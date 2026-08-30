-- ==========================================
-- 00098: Solo choferes en el monitoreo de posiciones.
--
-- Problema: `posiciones_chofer` puede tener filas de usuarios que NO son
-- choferes (admin/analista que probaron la app del chofer). `actualizar_posicion_chofer`
-- no validaba el rol y `obtener_posiciones_choferes` devolvía TODAS las filas,
-- así que el admin aparecía como "chofer" en Seguimiento y contaba en el
-- dashboard ("choferes en línea", marcadores del mapa).
--
-- Cambios:
-- 1) `obtener_posiciones_choferes` filtra SOLO rol 'chofer' (se ignoran
--    ayudantes: el monitoreo es solo para el manejo de choferes).
-- 2) `actualizar_posicion_chofer` valida el rol del llamador (solo 'chofer'
--    puede registrar su posición); evita filas basura futuras.
-- 3) Limpieza: se borran las filas existentes de no-choferes.
-- ==========================================

-- ==========================================
-- 1) obtener_posiciones_choferes: solo choferes
-- ==========================================
CREATE OR REPLACE FUNCTION public.obtener_posiciones_choferes()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_rol text;
    v_resultado jsonb;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Sesión no válida'
            USING ERRCODE = 'P0002';
    END IF;

    SELECT COALESCE(LOWER(r.nombre_rol), '') INTO v_rol
    FROM public.usuarios u
    LEFT JOIN public.roles r ON r.id_rol = u.id_rol
    WHERE u.id_usuario = v_uid;

    IF v_rol NOT IN ('administrador', 'coordinador', 'analista') THEN
        RAISE EXCEPTION 'No tienes permiso para consultar posiciones'
            USING ERRCODE = 'P0001';
    END IF;

    SELECT COALESCE(jsonb_agg(p), '[]'::jsonb)
    INTO v_resultado
    FROM (
        SELECT
            pc.id_chofer,
            pc.latitud,
            pc.longitud,
            pc.velocidad_kmh,
            pc.precision_m,
            pc.rumbo,
            pc.id_viaje_activo,
            pc.actualizado_en,
            u.nombre_completo AS nombre_chofer,
            veh.placa AS placa_vehiculo
        FROM public.posiciones_chofer pc
        JOIN public.usuarios u ON u.id_usuario = pc.id_chofer
        JOIN public.roles r ON r.id_rol = u.id_rol
        LEFT JOIN public.viajes v ON v.id_viaje = pc.id_viaje_activo
        LEFT JOIN public.vehiculos veh ON veh.id_vehiculo = v.id_vehiculo
        WHERE LOWER(r.nombre_rol) = 'chofer'
        ORDER BY pc.actualizado_en DESC
    ) p;

    RETURN v_resultado;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.obtener_posiciones_choferes() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.obtener_posiciones_choferes() TO authenticated;

-- ==========================================
-- 2) actualizar_posicion_chofer: solo el rol 'chofer' puede escribir
-- ==========================================
CREATE OR REPLACE FUNCTION public.actualizar_posicion_chofer(
    p_latitud double precision,
    p_longitud double precision,
    p_velocidad_kmh double precision DEFAULT NULL,
    p_precision_m double precision DEFAULT NULL,
    p_rumbo double precision DEFAULT NULL,
    p_id_viaje_activo UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_rol text;
    v_fila public.posiciones_chofer%ROWTYPE;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Sesión no válida'
            USING ERRCODE = 'P0002';
    END IF;

    SELECT COALESCE(LOWER(r.nombre_rol), '') INTO v_rol
    FROM public.usuarios u
    LEFT JOIN public.roles r ON r.id_rol = u.id_rol
    WHERE u.id_usuario = v_uid;

    IF v_rol <> 'chofer' THEN
        RAISE EXCEPTION 'Solo los choferes pueden registrar su posición'
            USING ERRCODE = 'P0001';
    END IF;

    INSERT INTO public.posiciones_chofer (
        id_chofer, latitud, longitud, velocidad_kmh, precision_m, rumbo,
        id_viaje_activo, actualizado_en
    )
    VALUES (
        v_uid, p_latitud, p_longitud, p_velocidad_kmh, p_precision_m, p_rumbo,
        p_id_viaje_activo, now()
    )
    ON CONFLICT (id_chofer)
    DO UPDATE SET
        latitud = EXCLUDED.latitud,
        longitud = EXCLUDED.longitud,
        velocidad_kmh = EXCLUDED.velocidad_kmh,
        precision_m = EXCLUDED.precision_m,
        rumbo = EXCLUDED.rumbo,
        id_viaje_activo = EXCLUDED.id_viaje_activo,
        actualizado_en = now()
    RETURNING * INTO v_fila;

    RETURN jsonb_build_object(
        'id_chofer', v_fila.id_chofer,
        'latitud', v_fila.latitud,
        'longitud', v_fila.longitud,
        'actualizado_en', v_fila.actualizado_en
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.actualizar_posicion_chofer(double precision, double precision, double precision, double precision, double precision, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.actualizar_posicion_chofer(double precision, double precision, double precision, double precision, double precision, uuid) TO authenticated;

-- ==========================================
-- 3) Limpieza: borrar filas de no-choferes
-- ==========================================
DELETE FROM public.posiciones_chofer pc
USING public.usuarios u
LEFT JOIN public.roles r ON r.id_rol = u.id_rol
WHERE pc.id_chofer = u.id_usuario
  AND COALESCE(LOWER(r.nombre_rol), '') <> 'chofer';