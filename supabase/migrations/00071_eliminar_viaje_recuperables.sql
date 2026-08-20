-- ============================================================
-- 00071:
-- 1) finalizar_viaje: las incidencias CERRADO / FUERA_HORARIO de
--    las facturas del viaje pasan a recuperable = true al cerrar
--    el viaje (el negocio recién vuelve a recibir en otro viaje).
-- 2) eliminar_viaje (staff, para pruebas): borra el viaje y su
--    historial de estados, incidencias y fotos; devuelve las URLs
--    de fotos para que el front las elimine del storage.
-- ============================================================

-- ============================================================
-- 1) finalizar_viaje
-- ============================================================
CREATE OR REPLACE FUNCTION public.finalizar_viaje(p_id_viaje uuid)
RETURNS jsonb
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
        RAISE EXCEPTION 'Sesión no válida' USING ERRCODE = 'P0002';
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
    SET estado = 'finalizado',
        fecha_finalizacion = now()
    WHERE id_viaje = p_id_viaje;

    -- Incidencias de negocio cerrado / fuera de hora se vuelven recuperables:
    -- al cerrar el viaje, ese cliente recién puede recibir en un viaje nuevo.
    UPDATE public.incidencias
    SET recuperable = true
    WHERE id_detalle_fact IN (
        SELECT it.id_factura FROM public.itinerario_viaje it WHERE it.id_viaje = p_id_viaje
    )
      AND tipo_incidencia IN ('CERRADO', 'FUERA_HORARIO');

    RETURN jsonb_build_object('id_viaje', p_id_viaje, 'estado', 'finalizado');
END;
$$;

GRANT EXECUTE ON FUNCTION public.finalizar_viaje(uuid) TO authenticated;

-- ============================================================
-- 2) eliminar_viaje (staff, para pruebas)
-- ============================================================
CREATE OR REPLACE FUNCTION public.eliminar_viaje(p_id_viaje uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_rol text;
    v_fotos text[] := '{}';
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Sesión no válida' USING ERRCODE = 'P0002';
    END IF;

    SELECT COALESCE(LOWER(r.nombre_rol), '') INTO v_rol
    FROM public.usuarios u
    LEFT JOIN public.roles r ON r.id_rol = u.id_rol
    WHERE u.id_usuario = v_uid;

    IF v_rol NOT IN ('administrador', 'coordinador', 'analista') THEN
        RAISE EXCEPTION 'No tienes permiso para eliminar viajes' USING ERRCODE = 'P0001';
    END IF;

    -- URLs de fotos de incidencia de las facturas del viaje (antes de borrar).
    SELECT COALESCE(array_agg(i.foto_evidencia_url), '{}')
    INTO v_fotos
    FROM public.incidencias i
    WHERE i.id_detalle_fact IN (
        SELECT it.id_factura FROM public.itinerario_viaje it WHERE it.id_viaje = p_id_viaje
    )
      AND i.foto_evidencia_url IS NOT NULL
      AND i.foto_evidencia_url <> '';

    -- Borrar incidencias e historial de estados de las facturas del viaje.
    DELETE FROM public.incidencias
    WHERE id_detalle_fact IN (
        SELECT it.id_factura FROM public.itinerario_viaje it WHERE it.id_viaje = p_id_viaje
    );

    DELETE FROM public.historial_estados_factura
    WHERE id_factura IN (
        SELECT it.id_factura FROM public.itinerario_viaje it WHERE it.id_viaje = p_id_viaje
    );

    -- Borrar el viaje: cascade elimina itinerario_viaje;
    -- posiciones_chofer.id_viaje_activo se limpia (FK SET NULL).
    DELETE FROM public.viajes WHERE id_viaje = p_id_viaje;

    RETURN jsonb_build_object(
        'id_viaje', p_id_viaje,
        'eliminado', true,
        'fotos_eliminadas', COALESCE(v_fotos, '{}')
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.eliminar_viaje(uuid) TO authenticated;
