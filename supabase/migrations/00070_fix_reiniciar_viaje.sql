-- ============================================================
-- 00070: fix reiniciar_viaje — quitar referencia a la columna
-- facturas.foto_incidencia, que NO existe en el remote (00058
-- no se aplicó). La foto de incidencia vive en
-- incidencias.foto_evidencia_url y se borra con su fila.
-- ============================================================
CREATE OR REPLACE FUNCTION public.reiniciar_viaje(
    p_id_viaje uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_rol text;
    v_id_estado_embarque uuid;
    v_factura uuid;
    v_total integer := 0;
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
        RAISE EXCEPTION 'No tienes permiso para reiniciar viajes' USING ERRCODE = 'P0001';
    END IF;

    SELECT id_estado INTO v_id_estado_embarque FROM public.estados WHERE LOWER(nombre_estado) = 'embarque';
    IF v_id_estado_embarque IS NULL THEN
        RAISE EXCEPTION 'Estado embarque no encontrado';
    END IF;

    -- Recoger las URLs de fotos de incidencia antes de borrarlas.
    SELECT COALESCE(array_agg(i.foto_evidencia_url), '{}')
    INTO v_fotos
    FROM public.incidencias i
    WHERE i.id_detalle_fact IN (
        SELECT it.id_factura FROM public.itinerario_viaje it WHERE it.id_viaje = p_id_viaje
    )
      AND i.foto_evidencia_url IS NOT NULL
      AND i.foto_evidencia_url <> '';

    FOR v_factura IN
        SELECT i.id_factura FROM public.itinerario_viaje i WHERE i.id_viaje = p_id_viaje
    LOOP
        -- Borrar incidencias de la factura (incluye su foto_evidencia_url).
        DELETE FROM public.incidencias WHERE id_detalle_fact = v_factura;

        -- Borrar el historial de estados de la factura.
        DELETE FROM public.historial_estados_factura WHERE id_factura = v_factura;

        -- Volver a 'embarque' y limpiar la firma.
        UPDATE public.facturas
        SET id_estado = v_id_estado_embarque, firma = NULL
        WHERE id_factura = v_factura;

        v_total := v_total + 1;
    END LOOP;

    UPDATE public.viajes
    SET estado = 'programado', fecha_finalizacion = NULL
    WHERE id_viaje = p_id_viaje;

    RETURN jsonb_build_object(
        'id_viaje', p_id_viaje,
        'estado', 'programado',
        'total_facturas', v_total,
        'fotos_eliminadas', COALESCE(v_fotos, '{}')
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.reiniciar_viaje(uuid) TO authenticated;
