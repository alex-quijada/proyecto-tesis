-- ============================================================
-- 00058: Incidencias con tipo y foto.
-- reportar_incidencia ahora acepta un tipo de incidencia y una
-- foto (base64) opcionales. El tipo se guarda como prefijo de la
-- observación en el historial y la foto en facturas.foto_incidencia.
-- ============================================================

ALTER TABLE public.facturas
    ADD COLUMN IF NOT EXISTS foto_incidencia text;

DROP FUNCTION IF EXISTS public.reportar_incidencia(uuid, text);

CREATE OR REPLACE FUNCTION public.reportar_incidencia(
    p_id_factura uuid,
    p_observacion text DEFAULT NULL,
    p_tipo text DEFAULT NULL,
    p_foto text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_id_estado_incidencia uuid;
    v_anterior uuid;
    v_observacion text;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Sesión no válida'
            USING ERRCODE = 'P0002';
    END IF;

    SELECT id_estado INTO v_id_estado_incidencia
    FROM public.estados
    WHERE LOWER(nombre_estado) = 'incidencia';
    IF v_id_estado_incidencia IS NULL THEN
        RAISE EXCEPTION 'Estado incidencia no encontrado';
    END IF;

    SELECT f.id_estado INTO v_anterior
    FROM public.facturas f
    JOIN public.itinerario_viaje i ON i.id_factura = f.id_factura
    JOIN public.viajes v ON v.id_viaje = i.id_viaje
    WHERE f.id_factura = p_id_factura
      AND v.id_chofer = v_uid
      AND v.estado = 'proceso'
    FOR UPDATE OF f;
    IF NOT FOUND OR v_anterior IS NULL THEN
        RAISE EXCEPTION 'Factura no encontrada o no asignada al chofer'
            USING ERRCODE = 'P0002';
    END IF;

    -- Guardar el tipo como prefijo de la observación para el historial.
    IF p_tipo IS NOT NULL AND p_tipo <> '' THEN
        v_observacion := '[' || p_tipo || '] ' || COALESCE(p_observacion, 'Incidencia reportada');
    ELSE
        v_observacion := COALESCE(p_observacion, 'Incidencia reportada');
    END IF;

    INSERT INTO public.historial_estados_factura
        (id_factura, id_estado_anterior, id_estado_nuevo, id_usuario, observacion)
    VALUES (p_id_factura, v_anterior, v_id_estado_incidencia, v_uid, v_observacion);

    UPDATE public.facturas
    SET id_estado = v_id_estado_incidencia,
        foto_incidencia = COALESCE(p_foto, foto_incidencia)
    WHERE id_factura = p_id_factura;

    RETURN jsonb_build_object(
        'ok', true,
        'id_factura', p_id_factura,
        'tipo', p_tipo,
        'observacion', v_observacion
    );
END;
$$;

REVOKE ALL ON FUNCTION public.reportar_incidencia(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reportar_incidencia(uuid, text, text, text) TO authenticated;
