-- ============================================================
-- 00075: reagregar_factura_reenvio — criterio de re-entrega con
-- múltiples incidencias. Antes validaba solo la última incidencia
-- recuperable (LIMIT 1). Ahora valida que EXISTA al menos una
-- incidencia pendiente (resuelta = false) y recuperable.
-- ============================================================
CREATE OR REPLACE FUNCTION public.reagregar_factura_reenvio(
    p_id_viaje uuid,
    p_ids_facturas uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_rol text;
    v_es_chofer boolean;
    v_id_estado_proceso uuid;
    v_id_estado_incidencia uuid;
    v_es_transicion boolean;
    v_factura uuid;
    v_total integer := 0;
    v_viaje_estado text;
    v_redespachable boolean;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Sesión no válida' USING ERRCODE = 'P0002';
    END IF;

    SELECT v.estado INTO v_viaje_estado
    FROM public.viajes v
    WHERE v.id_viaje = p_id_viaje;
    IF v_viaje_estado IS NULL THEN
        RAISE EXCEPTION 'Viaje no encontrado' USING ERRCODE = 'P0002';
    END IF;
    IF v_viaje_estado <> 'proceso' THEN
        RAISE EXCEPTION 'La re-entrega solo aplica a un viaje en proceso' USING ERRCODE = 'P0001';
    END IF;

    SELECT v.id_chofer = v_uid INTO v_es_chofer
    FROM public.viajes v
    WHERE v.id_viaje = p_id_viaje;

    SELECT COALESCE(LOWER(r.nombre_rol), '') INTO v_rol
    FROM public.usuarios u
    LEFT JOIN public.roles r ON r.id_rol = u.id_rol
    WHERE u.id_usuario = v_uid;

    IF NOT (v_es_chofer OR v_rol IN ('administrador', 'coordinador', 'analista')) THEN
        RAISE EXCEPTION 'No autorizado para re-agregar facturas a este viaje' USING ERRCODE = 'P0001';
    END IF;

    SELECT id_estado INTO v_id_estado_proceso FROM public.estados WHERE LOWER(nombre_estado) = 'proceso';
    SELECT id_estado INTO v_id_estado_incidencia FROM public.estados WHERE LOWER(nombre_estado) = 'incidencia';
    IF v_id_estado_proceso IS NULL OR v_id_estado_incidencia IS NULL THEN
        RAISE EXCEPTION 'Estados de factura no encontrados';
    END IF;

    FOREACH v_factura IN ARRAY p_ids_facturas
    LOOP
        -- Debe pertenecer al viaje y estar en 'incidencia'.
        IF NOT EXISTS (
            SELECT 1 FROM public.itinerario_viaje i
            WHERE i.id_viaje = p_id_viaje AND i.id_factura = v_factura
        ) THEN
            CONTINUE;
        END IF;

        SELECT es_transicion_valida_factura('incidencia', 'proceso') INTO v_es_transicion;
        IF NOT COALESCE(v_es_transicion, false) THEN
            CONTINUE;
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM public.facturas f
            WHERE f.id_factura = v_factura AND f.id_estado = v_id_estado_incidencia
        ) THEN
            CONTINUE;
        END IF;

        -- Con múltiples incidencias: re-despachable si existe ≥1 incidencia
        -- pendiente (resuelta = false) y recuperable.
        SELECT EXISTS (
            SELECT 1 FROM public.incidencias i
            WHERE i.id_detalle_fact = v_factura
              AND i.recuperable = true
              AND i.resuelta = false
        ) INTO v_redespachable;
        IF NOT COALESCE(v_redespachable, false) THEN
            CONTINUE;
        END IF;

        UPDATE public.facturas
        SET id_estado = v_id_estado_proceso
        WHERE id_factura = v_factura;

        INSERT INTO public.historial_estados_factura
            (id_factura, id_estado_anterior, id_estado_nuevo, id_usuario, observacion)
        VALUES (v_factura, v_id_estado_incidencia, v_id_estado_proceso, v_uid, 'Re-entrega autorizada');

        v_total := v_total + 1;
    END LOOP;

    RETURN jsonb_build_object('id_viaje', p_id_viaje, 'total_reactivadas', v_total);
END;
$$;

GRANT EXECUTE ON FUNCTION public.reagregar_factura_reenvio(uuid, uuid[]) TO authenticated;