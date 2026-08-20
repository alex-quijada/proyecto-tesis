-- ============================================================
-- 00072: fix eliminar_viaje — restablecer el estado de las
-- facturas del viaje a 'nuevo' al borrarlo. Sin esto, una factura
-- que estaba en 'incidencia' quedaba colgada en ese estado sin
-- incidencia asociada y seguía apareciendo como incidencia en la
-- página de rutas.
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
    v_id_estado_nuevo uuid;
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

    SELECT id_estado INTO v_id_estado_nuevo FROM public.estados WHERE LOWER(nombre_estado) = 'nuevo';
    IF v_id_estado_nuevo IS NULL THEN
        RAISE EXCEPTION 'Estado nuevo no encontrado';
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

    -- Restablecer las facturas a 'nuevo' para que no queden colgadas en
    -- incidencia/embarque/etc. sin viaje.
    UPDATE public.facturas
    SET id_estado = v_id_estado_nuevo, firma = NULL
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
