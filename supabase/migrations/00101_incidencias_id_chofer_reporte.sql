-- ============================================================
-- 00101: incidencias.id_chofer y fix en reporte de incidencias
--
-- 1) Agrega columna id_chofer a la tabla public.incidencias con FK.
-- 2) Backfill para poblar id_chofer en las incidencias existentes
--    desde historial_estados_factura o guias_carga.
-- 3) Actualiza reportar_incidencias, reportar_incidencia_chofer y
--    marcar_fuera_horario para guardar id_chofer = auth.uid().
-- 4) Recrea obtener_resumen_incidencias agrupando y filtrando por
--    el chofer real que reportó la incidencia (COALESCE(inc.id_chofer, g.id_chofer)),
--    evitando que las incidencias se transfieran si se reasigna la guía.
-- ============================================================

-- 1) Columna id_chofer en incidencias
ALTER TABLE public.incidencias
    ADD COLUMN IF NOT EXISTS id_chofer uuid REFERENCES public.usuarios(id_usuario);

-- 2) Backfill de incidencias existentes
UPDATE public.incidencias inc
SET id_chofer = COALESCE(
    (
        SELECT h.id_usuario
        FROM public.historial_estados_factura h
        JOIN public.estados e ON e.id_estado = h.id_estado_nuevo
        WHERE h.id_factura = inc.id_detalle_fact
          AND LOWER(e.nombre_estado) = 'incidencia'
        ORDER BY ABS(EXTRACT(EPOCH FROM (h.fecha_cambio - inc.hora_reporte))) ASC
        LIMIT 1
    ),
    (
        SELECT g.id_chofer
        FROM public.facturas f
        JOIN public.guias_carga g ON g.id_guia = f.id_guia
        WHERE f.id_factura = inc.id_detalle_fact
        LIMIT 1
    )
)
WHERE inc.id_chofer IS NULL;

-- 3a) reportar_incidencias (multi)
CREATE OR REPLACE FUNCTION public.reportar_incidencias(
    p_id_factura uuid,
    p_incidencias jsonb[]
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
    v_item jsonb;
    v_tipo text;
    v_descripcion text;
    v_foto text;
    v_total integer := 0;
    v_observacion text;
    v_tipos text[];
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

    FOREACH v_item IN ARRAY p_incidencias
    LOOP
        v_tipo := COALESCE(v_item->>'tipo', '');
        IF v_tipo = '' THEN
            CONTINUE;
        END IF;
        v_descripcion := COALESCE(v_item->>'descripcion', '');
        v_foto := NULLIF(v_item->>'foto', '');

        INSERT INTO public.incidencias
            (id_detalle_fact, id_chofer, tipo_incidencia, descripcion, foto_evidencia_url, recuperable, resuelta)
        VALUES
            (p_id_factura, v_uid, v_tipo, v_descripcion, v_foto, false, false);

        v_tipos := array_append(v_tipos, v_tipo);
        v_total := v_total + 1;
    END LOOP;

    IF v_total = 0 THEN
        RAISE EXCEPTION 'No se indicó ninguna incidencia válida';
    END IF;

    v_observacion := '[' || array_to_string(v_tipos, ', ') || '] Incidencia(s) reportada(s)';

    INSERT INTO public.historial_estados_factura
        (id_factura, id_estado_anterior, id_estado_nuevo, id_usuario, observacion)
    VALUES (p_id_factura, v_anterior, v_id_estado_incidencia, v_uid, v_observacion);

    UPDATE public.facturas
    SET id_estado = v_id_estado_incidencia
    WHERE id_factura = p_id_factura;

    RETURN jsonb_build_object('ok', true, 'total', v_total, 'id_factura', p_id_factura);
END;
$$;

GRANT EXECUTE ON FUNCTION public.reportar_incidencias(uuid, jsonb[]) TO authenticated;

-- 3b) reportar_incidencia_chofer (single)
CREATE OR REPLACE FUNCTION public.reportar_incidencia_chofer(
    p_id_factura uuid,
    p_tipo text,
    p_descripcion text,
    p_foto text DEFAULT NULL,
    p_recuperable boolean DEFAULT false
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

    INSERT INTO public.incidencias
        (id_detalle_fact, id_chofer, tipo_incidencia, descripcion, foto_evidencia_url, recuperable, resuelta)
    VALUES
        (p_id_factura, v_uid, p_tipo, p_descripcion, p_foto, COALESCE(p_recuperable, false), false);

    INSERT INTO public.historial_estados_factura
        (id_factura, id_estado_anterior, id_estado_nuevo, id_usuario, observacion)
    VALUES
        (p_id_factura, v_anterior, v_id_estado_incidencia, v_uid, '[' || p_tipo || '] ' || p_descripcion);

    UPDATE public.facturas
    SET id_estado = v_id_estado_incidencia
    WHERE id_factura = p_id_factura;

    RETURN jsonb_build_object('ok', true, 'id_factura', p_id_factura);
END;
$$;

GRANT EXECUTE ON FUNCTION public.reportar_incidencia_chofer(uuid, text, text, text, boolean) TO authenticated;

-- 3c) marcar_fuera_horario
CREATE OR REPLACE FUNCTION public.marcar_fuera_horario(p_id_viaje uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_viaje RECORD;
    v_factura uuid;
    v_anterior uuid;
    v_id_estado_incidencia uuid;
    v_total integer := 0;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Sesión no válida' USING ERRCODE = 'P0002';
    END IF;

    SELECT id_viaje, id_chofer, estado
    INTO v_viaje
    FROM public.viajes
    WHERE id_viaje = p_id_viaje;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Viaje no encontrado' USING ERRCODE = 'P0002';
    END IF;

    IF v_viaje.id_chofer <> v_uid AND NOT public.es_personal_interno() THEN
        RAISE EXCEPTION 'No autorizado para marcar fin de jornada en este viaje' USING ERRCODE = 'P0001';
    END IF;

    IF v_viaje.estado <> 'proceso' THEN
        RAISE EXCEPTION 'El viaje no está en proceso' USING ERRCODE = 'P0003';
    END IF;

    SELECT id_estado INTO v_id_estado_incidencia
    FROM public.estados WHERE LOWER(nombre_estado) = 'incidencia';
    IF v_id_estado_incidencia IS NULL THEN
        RAISE EXCEPTION 'Estado incidencia no encontrado';
    END IF;

    -- Marcar como FUERA_HORARIO (recuperable) cada factura pendiente del viaje.
    FOR v_factura IN
        SELECT i.id_factura
        FROM public.itinerario_viaje i
        JOIN public.facturas f ON f.id_factura = i.id_factura
        JOIN public.estados e ON e.id_estado = f.id_estado
        WHERE i.id_viaje = p_id_viaje
          AND e.nombre_estado NOT IN ('finalizado', 'incidencia')
    LOOP
        SELECT id_estado INTO v_anterior FROM public.facturas WHERE id_factura = v_factura;

        INSERT INTO public.incidencias
            (id_detalle_fact, id_chofer, tipo_incidencia, descripcion, foto_evidencia_url, recuperable, resuelta)
        VALUES
            (v_factura, v_viaje.id_chofer, 'FUERA_HORARIO',
             'No entregado — hora de volver al almacén', NULL, true, false);

        INSERT INTO public.historial_estados_factura
            (id_factura, id_estado_anterior, id_estado_nuevo, id_usuario, observacion)
        VALUES
            (v_factura, v_anterior, v_id_estado_incidencia, v_uid,
             '[FUERA_HORARIO] No entregado al volver al almacén');

        UPDATE public.facturas
        SET id_estado = v_id_estado_incidencia
        WHERE id_factura = v_factura;

        v_total := v_total + 1;
    END LOOP;

    RETURN jsonb_build_object(
        'id_viaje', p_id_viaje,
        'total_marcadas', v_total
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.marcar_fuera_horario(uuid) TO authenticated;

-- 4) Recrear obtener_resumen_incidencias con autoría real
CREATE OR REPLACE FUNCTION public.obtener_resumen_incidencias(
    p_desde date DEFAULT NULL,
    p_hasta date DEFAULT NULL,
    p_id_chofer uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_por_tipo jsonb;
    v_por_chofer jsonb;
    v_totales jsonb;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Sesión no válida' USING ERRCODE = 'P0002';
    END IF;

    IF NOT public.es_personal_interno() THEN
        RAISE EXCEPTION 'No tienes permiso para consultar reportes' USING ERRCODE = 'P0001';
    END IF;

    SELECT COALESCE(jsonb_agg(t ORDER BY t.total DESC), '[]'::jsonb)
    INTO v_por_tipo
    FROM (
        SELECT
            COALESCE(NULLIF(inc.tipo_incidencia, ''), 'Sin tipo') AS tipo,
            count(*) AS total,
            count(*) FILTER (WHERE inc.recuperable = true) AS recuperables,
            count(*) FILTER (WHERE inc.recuperable = false) AS terminales,
            count(*) FILTER (WHERE inc.resuelta = true) AS resueltas,
            count(*) FILTER (WHERE inc.resuelta = false) AS pendientes,
            COALESCE(sum(f.monto_dolares), 0) AS monto_usd,
            COALESCE(sum(f.monto_bss), 0) AS monto_bss
        FROM public.incidencias inc
        LEFT JOIN public.facturas f ON f.id_factura = inc.id_detalle_fact
        LEFT JOIN public.guias_carga g ON g.id_guia = f.id_guia
        WHERE (p_desde IS NULL OR inc.hora_reporte::date >= p_desde)
          AND (p_hasta IS NULL OR inc.hora_reporte::date <= p_hasta)
          AND (p_id_chofer IS NULL OR COALESCE(inc.id_chofer, g.id_chofer) = p_id_chofer)
        GROUP BY inc.tipo_incidencia
    ) t;

    SELECT COALESCE(jsonb_agg(c ORDER BY c.total DESC), '[]'::jsonb)
    INTO v_por_chofer
    FROM (
        SELECT
            COALESCE(ch.nombre_completo, 'Sin asignar') AS nombre_chofer,
            count(*) AS total,
            count(*) FILTER (WHERE inc.recuperable = true) AS recuperables,
            count(*) FILTER (WHERE inc.resuelta = true) AS resueltas,
            COALESCE(sum(f.monto_dolares), 0) AS monto_usd,
            COALESCE(sum(f.monto_bss), 0) AS monto_bss
        FROM public.incidencias inc
        LEFT JOIN public.facturas f ON f.id_factura = inc.id_detalle_fact
        LEFT JOIN public.guias_carga g ON g.id_guia = f.id_guia
        LEFT JOIN public.usuarios ch ON ch.id_usuario = COALESCE(inc.id_chofer, g.id_chofer)
        WHERE (p_desde IS NULL OR inc.hora_reporte::date >= p_desde)
          AND (p_hasta IS NULL OR inc.hora_reporte::date <= p_hasta)
          AND (p_id_chofer IS NULL OR COALESCE(inc.id_chofer, g.id_chofer) = p_id_chofer)
        GROUP BY ch.nombre_completo
    ) c;

    SELECT jsonb_build_object(
        'total', (SELECT count(*) FROM public.incidencias inc
            LEFT JOIN public.facturas f ON f.id_factura = inc.id_detalle_fact
            LEFT JOIN public.guias_carga g ON g.id_guia = f.id_guia
            WHERE (p_desde IS NULL OR inc.hora_reporte::date >= p_desde)
              AND (p_hasta IS NULL OR inc.hora_reporte::date <= p_hasta)
              AND (p_id_chofer IS NULL OR COALESCE(inc.id_chofer, g.id_chofer) = p_id_chofer)),
        'recuperables', (SELECT count(*) FROM public.incidencias inc
            LEFT JOIN public.facturas f ON f.id_factura = inc.id_detalle_fact
            LEFT JOIN public.guias_carga g ON g.id_guia = f.id_guia
            WHERE inc.recuperable = true
              AND (p_desde IS NULL OR inc.hora_reporte::date >= p_desde)
              AND (p_hasta IS NULL OR inc.hora_reporte::date <= p_hasta)
              AND (p_id_chofer IS NULL OR COALESCE(inc.id_chofer, g.id_chofer) = p_id_chofer)),
        'terminales', (SELECT count(*) FROM public.incidencias inc
            LEFT JOIN public.facturas f ON f.id_factura = inc.id_detalle_fact
            LEFT JOIN public.guias_carga g ON g.id_guia = f.id_guia
            WHERE inc.recuperable = false
              AND (p_desde IS NULL OR inc.hora_reporte::date >= p_desde)
              AND (p_hasta IS NULL OR inc.hora_reporte::date <= p_hasta)
              AND (p_id_chofer IS NULL OR COALESCE(inc.id_chofer, g.id_chofer) = p_id_chofer)),
        'resueltas', (SELECT count(*) FROM public.incidencias inc
            LEFT JOIN public.facturas f ON f.id_factura = inc.id_detalle_fact
            LEFT JOIN public.guias_carga g ON g.id_guia = f.id_guia
            WHERE inc.resuelta = true
              AND (p_desde IS NULL OR inc.hora_reporte::date >= p_desde)
              AND (p_hasta IS NULL OR inc.hora_reporte::date <= p_hasta)
              AND (p_id_chofer IS NULL OR COALESCE(inc.id_chofer, g.id_chofer) = p_id_chofer)),
        'pendientes', (SELECT count(*) FROM public.incidencias inc
            LEFT JOIN public.facturas f ON f.id_factura = inc.id_detalle_fact
            LEFT JOIN public.guias_carga g ON g.id_guia = f.id_guia
            WHERE inc.resuelta = false
              AND (p_desde IS NULL OR inc.hora_reporte::date >= p_desde)
              AND (p_hasta IS NULL OR inc.hora_reporte::date <= p_hasta)
              AND (p_id_chofer IS NULL OR COALESCE(inc.id_chofer, g.id_chofer) = p_id_chofer)),
        'monto_usd', (SELECT COALESCE(sum(f.monto_dolares), 0)
            FROM public.incidencias inc
            LEFT JOIN public.facturas f ON f.id_factura = inc.id_detalle_fact
            LEFT JOIN public.guias_carga g ON g.id_guia = f.id_guia
            WHERE (p_desde IS NULL OR inc.hora_reporte::date >= p_desde)
              AND (p_hasta IS NULL OR inc.hora_reporte::date <= p_hasta)
              AND (p_id_chofer IS NULL OR COALESCE(inc.id_chofer, g.id_chofer) = p_id_chofer)),
        'monto_bss', (SELECT COALESCE(sum(f.monto_bss), 0)
            FROM public.incidencias inc
            LEFT JOIN public.facturas f ON f.id_factura = inc.id_detalle_fact
            LEFT JOIN public.guias_carga g ON g.id_guia = f.id_guia
            WHERE (p_desde IS NULL OR inc.hora_reporte::date >= p_desde)
              AND (p_hasta IS NULL OR inc.hora_reporte::date <= p_hasta)
              AND (p_id_chofer IS NULL OR COALESCE(inc.id_chofer, g.id_chofer) = p_id_chofer))
    )
    INTO v_totales;

    RETURN jsonb_build_object(
        'por_tipo', v_por_tipo,
        'por_chofer', v_por_chofer,
        'totales', v_totales
    );
END;
$$;

REVOKE ALL ON FUNCTION public.obtener_resumen_incidencias(date, date, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.obtener_resumen_incidencias(date, date, uuid) TO authenticated;
