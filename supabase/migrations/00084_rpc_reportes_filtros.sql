-- ============================================================
-- 00084: RPCs de reportes con filtros por chofer y municipio.
--
--  - obtener_metricas_eficiencia: agrega p_id_chofer y p_id_municipio.
--  - obtener_resumen_incidencias: agrega p_id_chofer.
--
-- Se DROP-ean las firmas antiguas (date,date) para no dejar
-- overloads ambiguos (lección de 00062/00063).
-- ============================================================

DROP FUNCTION IF EXISTS public.obtener_metricas_eficiencia(date, date);
DROP FUNCTION IF EXISTS public.obtener_resumen_incidencias(date, date);

-- ============================================================
-- 1) Eficiencia (con filtros por chofer y municipio)
-- ============================================================
CREATE OR REPLACE FUNCTION public.obtener_metricas_eficiencia(
    p_desde date DEFAULT NULL,
    p_hasta date DEFAULT NULL,
    p_id_chofer uuid DEFAULT NULL,
    p_id_municipio uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_kpis jsonb;
    v_por_chofer jsonb;
    v_por_municipio jsonb;
    v_tiempos jsonb;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Sesión no válida' USING ERRCODE = 'P0002';
    END IF;

    IF NOT public.es_personal_interno() THEN
        RAISE EXCEPTION 'No tienes permiso para consultar reportes' USING ERRCODE = 'P0001';
    END IF;

    -- KPIs sobre viajes finalizados en el rango (con filtros).
    SELECT jsonb_build_object(
        'viajes_finalizados', count(DISTINCT v.id_viaje),
        'entregas', count(*) FILTER (WHERE st.nombre_estado = 'finalizado'),
        'incidencias', count(*) FILTER (WHERE st.nombre_estado = 'incidencia'),
        'monto_entregado_usd', COALESCE(sum(f.monto_dolares) FILTER (WHERE st.nombre_estado = 'finalizado'), 0),
        'monto_incidencia_usd', COALESCE(sum(f.monto_dolares) FILTER (WHERE st.nombre_estado = 'incidencia'), 0)
    )
    INTO v_kpis
    FROM public.viajes v
    JOIN public.itinerario_viaje i ON i.id_viaje = v.id_viaje
    JOIN public.facturas f ON f.id_factura = i.id_factura
    JOIN public.estados st ON st.id_estado = f.id_estado
    LEFT JOIN public.sucursales_cliente s ON s.id = f.id_sucursal
    WHERE v.estado = 'finalizado'
      AND (p_desde IS NULL OR v.fecha_finalizacion::date >= p_desde)
      AND (p_hasta IS NULL OR v.fecha_finalizacion::date <= p_hasta)
      AND (p_id_chofer IS NULL OR v.id_chofer = p_id_chofer)
      AND (p_id_municipio IS NULL OR s.id_municipio = p_id_municipio);

    -- Desglose por chofer. Se agrega primero por viaje (para no
    -- multiplicar la distancia por el número de facturas) y luego
    -- se consolida por chofer.
    SELECT COALESCE(jsonb_agg(c ORDER BY c.entregas DESC), '[]'::jsonb)
    INTO v_por_chofer
    FROM (
        SELECT
            r.id_chofer,
            COALESCE(r.nombre_chofer, 'Sin asignar') AS nombre_chofer,
            sum(r.entregas) AS entregas,
            sum(r.incidencias) AS incidencias,
            sum(r.monto_usd) AS monto_usd,
            sum(r.km_planificados) AS km_planificados
        FROM (
            SELECT
                v.id_chofer,
                ch.nombre_completo AS nombre_chofer,
                v.id_viaje,
                count(*) FILTER (WHERE st.nombre_estado = 'finalizado') AS entregas,
                count(*) FILTER (WHERE st.nombre_estado = 'incidencia') AS incidencias,
                COALESCE(sum(f.monto_dolares) FILTER (WHERE st.nombre_estado = 'finalizado'), 0) AS monto_usd,
                COALESCE(v.distancia_total_km, 0) AS km_planificados
            FROM public.viajes v
            JOIN public.itinerario_viaje i ON i.id_viaje = v.id_viaje
            JOIN public.facturas f ON f.id_factura = i.id_factura
            JOIN public.estados st ON st.id_estado = f.id_estado
            LEFT JOIN public.usuarios ch ON ch.id_usuario = v.id_chofer
            LEFT JOIN public.sucursales_cliente s ON s.id = f.id_sucursal
            WHERE v.estado = 'finalizado'
              AND (p_desde IS NULL OR v.fecha_finalizacion::date >= p_desde)
              AND (p_hasta IS NULL OR v.fecha_finalizacion::date <= p_hasta)
              AND (p_id_chofer IS NULL OR v.id_chofer = p_id_chofer)
              AND (p_id_municipio IS NULL OR s.id_municipio = p_id_municipio)
            GROUP BY v.id_chofer, ch.nombre_completo, v.id_viaje, v.distancia_total_km
        ) r
        GROUP BY r.id_chofer, r.nombre_chofer
    ) c;

    -- Desglose por municipio (paradas de viajes finalizados, con filtros).
    SELECT COALESCE(jsonb_agg(m ORDER BY m.entregas DESC), '[]'::jsonb)
    INTO v_por_municipio
    FROM (
        SELECT
            COALESCE(mun.nombre, 'Sin municipio') AS municipio,
            count(*) FILTER (WHERE st.nombre_estado = 'finalizado') AS entregas,
            count(*) FILTER (WHERE st.nombre_estado = 'incidencia') AS incidencias,
            COALESCE(sum(f.monto_dolares), 0) AS monto_usd
        FROM public.viajes v
        JOIN public.itinerario_viaje i ON i.id_viaje = v.id_viaje
        JOIN public.facturas f ON f.id_factura = i.id_factura
        JOIN public.estados st ON st.id_estado = f.id_estado
        LEFT JOIN public.sucursales_cliente s ON s.id = f.id_sucursal
        LEFT JOIN public.municipios mun ON mun.id_municipio = s.id_municipio
        WHERE v.estado = 'finalizado'
          AND (p_desde IS NULL OR v.fecha_finalizacion::date >= p_desde)
          AND (p_hasta IS NULL OR v.fecha_finalizacion::date <= p_hasta)
          AND (p_id_chofer IS NULL OR v.id_chofer = p_id_chofer)
          AND (p_id_municipio IS NULL OR s.id_municipio = p_id_municipio)
        GROUP BY mun.nombre
    ) m;

    -- Tiempo promedio por etapa (minutos) sobre facturas de viajes
    -- finalizados en el rango: duración = fecha de salida - fecha de
    -- entrada a cada estado (lead sobre la línea de tiempo).
    SELECT COALESCE(jsonb_agg(t ORDER BY t.orden), '[]'::jsonb)
    INTO v_tiempos
    FROM (
        WITH cambios AS (
            SELECT
                h.id_factura,
                he.nombre_estado,
                h.fecha_cambio,
                LEAD(h.fecha_cambio) OVER (
                    PARTITION BY h.id_factura ORDER BY h.fecha_cambio
                ) AS fecha_salida
            FROM public.historial_estados_factura h
            JOIN public.estados he ON he.id_estado = h.id_estado_nuevo
            JOIN public.itinerario_viaje i ON i.id_factura = h.id_factura
            JOIN public.viajes v ON v.id_viaje = i.id_viaje
            LEFT JOIN public.facturas f ON f.id_factura = h.id_factura
            LEFT JOIN public.sucursales_cliente s ON s.id = f.id_sucursal
            WHERE v.estado = 'finalizado'
              AND (p_desde IS NULL OR v.fecha_finalizacion::date >= p_desde)
              AND (p_hasta IS NULL OR v.fecha_finalizacion::date <= p_hasta)
              AND (p_id_chofer IS NULL OR v.id_chofer = p_id_chofer)
              AND (p_id_municipio IS NULL OR s.id_municipio = p_id_municipio)
        )
        SELECT
            CASE LOWER(nombre_estado)
                WHEN 'embarque' THEN 1
                WHEN 'proceso' THEN 2
                WHEN 'espera' THEN 3
                WHEN 'entrega' THEN 4
            END AS orden,
            LOWER(nombre_estado) AS etapa,
            COALESCE(round(avg(EXTRACT(EPOCH FROM (fecha_salida - fecha_cambio)) / 60)::numeric, 1), 0) AS minutos_promedio
        FROM cambios
        WHERE LOWER(nombre_estado) IN ('embarque', 'proceso', 'espera', 'entrega')
          AND fecha_salida IS NOT NULL
        GROUP BY LOWER(nombre_estado)
    ) t;

    RETURN jsonb_build_object(
        'kpis', v_kpis,
        'por_chofer', v_por_chofer,
        'por_municipio', v_por_municipio,
        'tiempos_por_etapa', v_tiempos
    );
END;
$$;

-- ============================================================
-- 2) Resumen de incidencias (con filtro por chofer)
-- ============================================================
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
            COALESCE(sum(f.monto_dolares), 0) AS monto_usd
        FROM public.incidencias inc
        LEFT JOIN public.facturas f ON f.id_factura = inc.id_detalle_fact
        LEFT JOIN public.guias_carga g ON g.id_guia = f.id_guia
        WHERE (p_desde IS NULL OR inc.hora_reporte::date >= p_desde)
          AND (p_hasta IS NULL OR inc.hora_reporte::date <= p_hasta)
          AND (p_id_chofer IS NULL OR g.id_chofer = p_id_chofer)
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
            COALESCE(sum(f.monto_dolares), 0) AS monto_usd
        FROM public.incidencias inc
        LEFT JOIN public.facturas f ON f.id_factura = inc.id_detalle_fact
        LEFT JOIN public.guias_carga g ON g.id_guia = f.id_guia
        LEFT JOIN public.usuarios ch ON ch.id_usuario = g.id_chofer
        WHERE (p_desde IS NULL OR inc.hora_reporte::date >= p_desde)
          AND (p_hasta IS NULL OR inc.hora_reporte::date <= p_hasta)
          AND (p_id_chofer IS NULL OR g.id_chofer = p_id_chofer)
        GROUP BY ch.nombre_completo
    ) c;

    SELECT jsonb_build_object(
        'total', (SELECT count(*) FROM public.incidencias inc
            LEFT JOIN public.facturas f ON f.id_factura = inc.id_detalle_fact
            LEFT JOIN public.guias_carga g ON g.id_guia = f.id_guia
            WHERE (p_desde IS NULL OR inc.hora_reporte::date >= p_desde)
              AND (p_hasta IS NULL OR inc.hora_reporte::date <= p_hasta)
              AND (p_id_chofer IS NULL OR g.id_chofer = p_id_chofer)),
        'recuperables', (SELECT count(*) FROM public.incidencias inc
            LEFT JOIN public.facturas f ON f.id_factura = inc.id_detalle_fact
            LEFT JOIN public.guias_carga g ON g.id_guia = f.id_guia
            WHERE inc.recuperable = true
              AND (p_desde IS NULL OR inc.hora_reporte::date >= p_desde)
              AND (p_hasta IS NULL OR inc.hora_reporte::date <= p_hasta)
              AND (p_id_chofer IS NULL OR g.id_chofer = p_id_chofer)),
        'terminales', (SELECT count(*) FROM public.incidencias inc
            LEFT JOIN public.facturas f ON f.id_factura = inc.id_detalle_fact
            LEFT JOIN public.guias_carga g ON g.id_guia = f.id_guia
            WHERE inc.recuperable = false
              AND (p_desde IS NULL OR inc.hora_reporte::date >= p_desde)
              AND (p_hasta IS NULL OR inc.hora_reporte::date <= p_hasta)
              AND (p_id_chofer IS NULL OR g.id_chofer = p_id_chofer)),
        'resueltas', (SELECT count(*) FROM public.incidencias inc
            LEFT JOIN public.facturas f ON f.id_factura = inc.id_detalle_fact
            LEFT JOIN public.guias_carga g ON g.id_guia = f.id_guia
            WHERE inc.resuelta = true
              AND (p_desde IS NULL OR inc.hora_reporte::date >= p_desde)
              AND (p_hasta IS NULL OR inc.hora_reporte::date <= p_hasta)
              AND (p_id_chofer IS NULL OR g.id_chofer = p_id_chofer)),
        'pendientes', (SELECT count(*) FROM public.incidencias inc
            LEFT JOIN public.facturas f ON f.id_factura = inc.id_detalle_fact
            LEFT JOIN public.guias_carga g ON g.id_guia = f.id_guia
            WHERE inc.resuelta = false
              AND (p_desde IS NULL OR inc.hora_reporte::date >= p_desde)
              AND (p_hasta IS NULL OR inc.hora_reporte::date <= p_hasta)
              AND (p_id_chofer IS NULL OR g.id_chofer = p_id_chofer)),
        'monto_usd', (SELECT COALESCE(sum(f.monto_dolares), 0)
            FROM public.incidencias inc
            LEFT JOIN public.facturas f ON f.id_factura = inc.id_detalle_fact
            LEFT JOIN public.guias_carga g ON g.id_guia = f.id_guia
            WHERE (p_desde IS NULL OR inc.hora_reporte::date >= p_desde)
              AND (p_hasta IS NULL OR inc.hora_reporte::date <= p_hasta)
              AND (p_id_chofer IS NULL OR g.id_chofer = p_id_chofer))
    )
    INTO v_totales;

    RETURN jsonb_build_object(
        'por_tipo', v_por_tipo,
        'por_chofer', v_por_chofer,
        'totales', v_totales
    );
END;
$$;

-- ============================================================
-- Grants
-- ============================================================
REVOKE ALL ON FUNCTION public.obtener_metricas_eficiencia(date, date, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.obtener_metricas_eficiencia(date, date, uuid, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.obtener_resumen_incidencias(date, date, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.obtener_resumen_incidencias(date, date, uuid) TO authenticated;