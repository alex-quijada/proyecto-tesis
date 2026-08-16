-- ==========================================
-- 00056: finalizar_viaje — marca el viaje como 'finalizado' cuando el
-- chofer regresa al almacén con todas las entregas completadas.
--
-- Valida que el llamador sea el chofer del viaje (o staff) y que el viaje
-- esté en 'proceso'. Solo se puede finalizar si todas sus facturas están en
-- 'finalizado' o 'incidencia' (si queda alguna pendiente → error).
-- ==========================================

CREATE OR REPLACE FUNCTION public.finalizar_viaje(
    p_id_viaje uuid
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_id_chofer uuid;
    v_rol text;
    v_estado text;
    v_pendientes integer;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Sesión no válida'
            USING ERRCODE = 'P0002';
    END IF;

    SELECT id_chofer INTO v_id_chofer FROM public.viajes WHERE id_viaje = p_id_viaje;
    IF v_id_chofer IS NULL THEN
        RAISE EXCEPTION 'Viaje no encontrado';
    END IF;

    SELECT COALESCE(LOWER(r.nombre_rol), '') INTO v_rol
    FROM public.usuarios u
    LEFT JOIN public.roles r ON r.id_rol = u.id_rol
    WHERE u.id_usuario = v_uid;

    IF v_uid <> v_id_chofer AND v_rol NOT IN ('administrador', 'coordinador', 'analista') THEN
        RAISE EXCEPTION 'No tienes permiso para finalizar este viaje';
    END IF;

    SELECT estado INTO v_estado FROM public.viajes WHERE id_viaje = p_id_viaje;
    IF v_estado <> 'proceso' THEN
        RAISE EXCEPTION 'El viaje no está en proceso';
    END IF;

    SELECT count(*) INTO v_pendientes
    FROM public.itinerario_viaje i
    JOIN public.facturas f ON f.id_factura = i.id_factura
    JOIN public.estados e ON e.id_estado = f.id_estado
    WHERE i.id_viaje = p_id_viaje
      AND e.nombre_estado NOT IN ('finalizado', 'incidencia');

    IF v_pendientes > 0 THEN
        RAISE EXCEPTION 'Hay % entrega(s) sin finalizar', v_pendientes;
    END IF;

    UPDATE public.viajes
    SET estado = 'finalizado'
    WHERE id_viaje = p_id_viaje;

    RETURN jsonb_build_object('id_viaje', p_id_viaje, 'estado', 'finalizado');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.finalizar_viaje(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalizar_viaje(uuid) TO authenticated;
