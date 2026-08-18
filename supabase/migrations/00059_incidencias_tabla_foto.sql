-- ============================================================
-- 00059: Incidencias en tabla propia + foto en storage.
-- - Elimina los campos de incidencia de facturas.
-- - Crea el bucket de storage para fotos de incidencias.
-- - Reescribe reportar_incidencia para insertar en incidencias,
--   actualizar el estado de la factura y guardar el historial.
-- - Crea el RPC obtener_incidencia_factura (última por factura).
-- ============================================================

-- 1) Quitar campos de incidencia de facturas
ALTER TABLE public.facturas
    DROP COLUMN IF EXISTS incidencia,
    DROP COLUMN IF EXISTS foto_incidencia;

-- 2) Bucket de storage público para fotos de incidencias
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('incidencias-fotos', 'incidencias-fotos', true, 5242880)
ON CONFLICT (id) DO NOTHING;

-- Policies del bucket
DROP POLICY IF EXISTS "incidencias_public_read" ON storage.objects;
CREATE POLICY "incidencias_public_read"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'incidencias-fotos');

DROP POLICY IF EXISTS "incidencias_auth_insert" ON storage.objects;
CREATE POLICY "incidencias_auth_insert"
    ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'incidencias-fotos' AND auth.role() = 'authenticated');

-- 3) Reescribir reportar_incidencia
DROP FUNCTION IF EXISTS public.reportar_incidencia(uuid, text, text, text);
DROP FUNCTION IF EXISTS public.reportar_incidencia(uuid, text, text);

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

    -- Insertar en la tabla incidencias
    INSERT INTO public.incidencias
        (id_detalle_fact, tipo_incidencia, descripcion, foto_evidencia_url)
    VALUES
        (p_id_factura, p_tipo, COALESCE(p_descripcion, ''), p_foto_url)
    RETURNING id_incidencia INTO v_id_incidencia;

    -- Observación para el historial
    v_observacion := '[' || COALESCE(p_tipo, 'INCIDENCIA') || '] ' || COALESCE(p_descripcion, 'Incidencia reportada');

    -- Historial de estados
    INSERT INTO public.historial_estados_factura
        (id_factura, id_estado_anterior, id_estado_nuevo, id_usuario, observacion)
    VALUES (p_id_factura, v_anterior, v_id_estado_incidencia, v_uid, v_observacion);

    -- Actualizar estado de la factura
    UPDATE public.facturas
    SET id_estado = v_id_estado_incidencia
    WHERE id_factura = p_id_factura;

    RETURN jsonb_build_object(
        'ok', true,
        'id_incidencia', v_id_incidencia,
        'id_factura', p_id_factura
    );
END;
$$;

-- 4) RPC para obtener la última incidencia de una factura
CREATE OR REPLACE FUNCTION public.obtener_incidencia_factura(p_id_factura uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_result jsonb;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Sesión no válida'
            USING ERRCODE = 'P0002';
    END IF;

    SELECT jsonb_build_object(
        'id_incidencia', i.id_incidencia,
        'id_factura', i.id_detalle_fact,
        'tipo', i.tipo_incidencia,
        'descripcion', i.descripcion,
        'foto_url', i.foto_evidencia_url,
        'hora_reporte', i.hora_reporte
    )
    INTO v_result
    FROM public.incidencias i
    WHERE i.id_detalle_fact = p_id_factura
    ORDER BY i.hora_reporte DESC
    LIMIT 1;

    RETURN v_result;
END;
$$;

-- RLS sobre incidencias
ALTER TABLE public.incidencias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "incidencias_staff_all" ON public.incidencias;
CREATE POLICY "incidencias_staff_all"
    ON public.incidencias FOR ALL
    USING (
        EXISTS (
            SELECT 1
            FROM public.usuarios u
            JOIN public.roles r ON r.id_rol = u.id_rol
            WHERE u.id_usuario = auth.uid()
              AND LOWER(r.nombre_rol) IN ('administrador', 'coordinador', 'analista')
        )
    );

DROP POLICY IF EXISTS "incidencias_chofer_select" ON public.incidencias;
CREATE POLICY "incidencias_chofer_select"
    ON public.incidencias FOR SELECT
    USING (
        EXISTS (
            SELECT 1
            FROM public.facturas f
            JOIN public.itinerario_viaje it ON it.id_factura = f.id_factura
            JOIN public.viajes v ON v.id_viaje = it.id_viaje
            WHERE f.id_factura = incidencias.id_detalle_fact
              AND v.id_chofer = auth.uid()
        )
    );

GRANT EXECUTE ON FUNCTION public.reportar_incidencia(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.obtener_incidencia_factura(uuid) TO authenticated;
