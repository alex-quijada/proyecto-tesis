-- ============================================================
-- 00066: Las incidencias NO son recuperables por defecto.
-- La re-entrega solo ocurre tras aprobación EXPLÍCITA del admin
-- (set_incidencia_recuperable = true). Sin default por tipo.
-- ============================================================
CREATE OR REPLACE FUNCTION public.reportar_incidencia(
    p_id_factura uuid,
    p_tipo text,
    p_descripcion text DEFAULT NULL,
    p_foto_url text DEFAULT NULL
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
    v_id_incidencia uuid;
    v_observacion text;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Sesión no válida' USING ERRCODE = 'P0002';
    END IF;

    SELECT id_estado INTO v_id_estado_incidencia
    FROM public.estados WHERE LOWER(nombre_estado) = 'incidencia';
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
        RAISE EXCEPTION 'Factura no encontrada o no asignada al chofer' USING ERRCODE = 'P0002';
    END IF;

    -- La incidencia NO es recuperable por defecto: la aprueba el admin.
    INSERT INTO public.incidencias
        (id_detalle_fact, tipo_incidencia, descripcion, foto_evidencia_url, recuperable)
    VALUES
        (p_id_factura, p_tipo, COALESCE(p_descripcion, ''), p_foto_url, false)
    RETURNING id_incidencia INTO v_id_incidencia;

    v_observacion := '[' || COALESCE(p_tipo, 'INCIDENCIA') || '] ' || COALESCE(p_descripcion, 'Incidencia reportada');

    INSERT INTO public.historial_estados_factura
        (id_factura, id_estado_anterior, id_estado_nuevo, id_usuario, observacion)
    VALUES (p_id_factura, v_anterior, v_id_estado_incidencia, v_uid, v_observacion);

    UPDATE public.facturas
    SET id_estado = v_id_estado_incidencia
    WHERE id_factura = p_id_factura;

    RETURN jsonb_build_object(
        'ok', true, 'id_incidencia', v_id_incidencia,
        'id_factura', p_id_factura, 'recuperable', false
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.reportar_incidencia(uuid, text, text, text) TO authenticated;
