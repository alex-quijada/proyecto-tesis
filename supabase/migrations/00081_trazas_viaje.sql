-- ==========================================
-- 00081: Traza real del chofer (reportes de desvío vs ruta VRPTW).
--
-- El chofer acumula la traza LOCALMENTE en el teléfono (Preferences)
-- mientras navega y la envía al finalizar el viaje (o al reconectar).
-- Aquí solo se persiste el lote final; nada de Realtime ni posiciones
-- en vivo (eso sigue en posiciones_chofer).
--
-- 1) Tabla trazas_viaje (histórico, con ON DELETE CASCADE).
-- 2) RLS: chofer inserta/lee sus filas; staff lee todas.
-- 3) RPC registrar_trazas_viaje: batch insert (SECURITY DEFINER, chofer).
-- 4) RPC obtener_traza_viaje: staff — puntos ordenados por tiempo.
-- 5) reiniciar_viaje ahora borra la traza del viaje (reporte solo refleja
--    la corrida final; se conserva el comportamiento de borrado en cascada).
-- ==========================================

CREATE TABLE IF NOT EXISTS public.trazas_viaje (
    id_traza UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_viaje UUID NOT NULL REFERENCES public.viajes(id_viaje) ON DELETE CASCADE,
    id_chofer UUID NOT NULL REFERENCES public.usuarios(id_usuario) ON DELETE CASCADE,
    latitud double precision NOT NULL,
    longitud double precision NOT NULL,
    velocidad_kmh double precision,
    rumbo double precision,
    es_simulacion boolean NOT NULL DEFAULT false,
    creada_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trazas_viaje_viaje
    ON public.trazas_viaje (id_viaje, creada_en);

ALTER TABLE public.trazas_viaje ENABLE ROW LEVEL SECURITY;

CREATE POLICY "trazas_viaje_staff_select"
    ON public.trazas_viaje
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.usuarios u
            JOIN public.roles r ON r.id_rol = u.id_rol
            WHERE u.id_usuario = auth.uid()
              AND LOWER(r.nombre_rol) IN ('administrador', 'coordinador', 'analista')
        )
    );

CREATE POLICY "trazas_viaje_own_select"
    ON public.trazas_viaje
    FOR SELECT
    TO authenticated
    USING (id_chofer = auth.uid());

CREATE POLICY "trazas_viaje_own_insert"
    ON public.trazas_viaje
    FOR INSERT
    TO authenticated
    WITH CHECK (id_chofer = auth.uid());

-- ==========================================
-- registrar_trazas_viaje — batch insert de la traza acumulada localmente.
-- Valida que el chofer sea dueño del viaje y que esté en 'proceso'
-- (también permite 'finalizado', por si el envío llega justo al cerrar).
-- ==========================================
CREATE OR REPLACE FUNCTION public.registrar_trazas_viaje(
    p_id_viaje uuid,
    p_puntos jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_estado text;
    v_punto jsonb;
    v_total integer := 0;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Sesión no válida' USING ERRCODE = 'P0002';
    END IF;

    SELECT v.estado INTO v_estado
    FROM public.viajes v
    WHERE v.id_viaje = p_id_viaje AND v.id_chofer = v_uid;

    IF v_estado IS NULL THEN
        RAISE EXCEPTION 'Viaje no encontrado o no es tuyo';
    END IF;

    IF v_estado NOT IN ('proceso', 'finalizado') THEN
        RAISE EXCEPTION 'El viaje no está activo para registrar la traza';
    END IF;

    IF p_puntos IS NOT NULL AND jsonb_typeof(p_puntos) = 'array' THEN
        FOR v_punto IN SELECT * FROM jsonb_array_elements(p_puntos)
        LOOP
            INSERT INTO public.trazas_viaje (
                id_viaje, id_chofer, latitud, longitud,
                velocidad_kmh, rumbo, es_simulacion, creada_en
            )
            VALUES (
                p_id_viaje,
                v_uid,
                (v_punto->>'latitud')::double precision,
                (v_punto->>'longitud')::double precision,
                (v_punto->>'velocidad_kmh')::double precision,
                (v_punto->>'rumbo')::double precision,
                COALESCE((v_punto->>'es_simulacion')::boolean, false),
                COALESCE((v_punto->>'creada_en')::timestamptz, now())
            );
            v_total := v_total + 1;
        END LOOP;
    END IF;

    RETURN jsonb_build_object(
        'id_viaje', p_id_viaje,
        'insertadas', v_total
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.registrar_trazas_viaje(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_trazas_viaje(uuid, jsonb) TO authenticated;

-- ==========================================
-- obtener_traza_viaje — staff: puntos de la traza en orden cronológico.
-- ==========================================
CREATE OR REPLACE FUNCTION public.obtener_traza_viaje(
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
    v_resultado jsonb;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Sesión no válida' USING ERRCODE = 'P0002';
    END IF;

    SELECT COALESCE(LOWER(r.nombre_rol), '') INTO v_rol
    FROM public.usuarios u
    LEFT JOIN public.roles r ON r.id_rol = u.id_rol
    WHERE u.id_usuario = v_uid;

    IF v_rol NOT IN ('administrador', 'coordinador', 'analista') THEN
        RAISE EXCEPTION 'No tienes permiso para consultar trazas' USING ERRCODE = 'P0001';
    END IF;

    SELECT COALESCE(jsonb_agg(t), '[]'::jsonb)
    INTO v_resultado
    FROM (
        SELECT
            tz.latitud,
            tz.longitud,
            tz.velocidad_kmh,
            tz.rumbo,
            tz.es_simulacion,
            tz.creada_en
        FROM public.trazas_viaje tz
        WHERE tz.id_viaje = p_id_viaje
        ORDER BY tz.creada_en ASC
    ) t;

    RETURN v_resultado;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.obtener_traza_viaje(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.obtener_traza_viaje(uuid) TO authenticated;

-- ==========================================
-- reiniciar_viaje: borrar la traza del viaje (reporte solo refleja la
-- corrida final).
-- ==========================================
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

    -- La traza del intento anterior ya no aplica (reporte = corrida final).
    DELETE FROM public.trazas_viaje WHERE id_viaje = p_id_viaje;

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