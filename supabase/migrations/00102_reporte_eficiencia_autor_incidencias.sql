-- ============================================================
-- 00102: Atribución precisa de incidencias por chofer en Eficiencia
--
-- Recrea obtener_metricas_eficiencia para que la verificación de
-- incidencias (tuvo_incidencia, resueltas, pendientes) en el desglose
-- por chofer valide inc.id_chofer = v.id_chofer / h.id_usuario = v.id_chofer.
-- Si una factura reasignada se entrega en un segundo viaje por otro chofer,
-- la incidencia original se computa al chofer que la generó y no
-- al chofer receptor que completó la entrega.
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
    WITH facturas_viaje AS (
        SELECT
            v.id_viaje,
            f.id_factura,
            f.monto_dolares,
            f.monto_bss,
            st.nombre_estado AS estado_actual,
            (
                LOWER(st.nombre_estado) = 'incidencia'
                OR EXISTS (
                    SELECT 1 FROM public.incidencias inc
                    WHERE inc.id_detalle_fact = f.id_factura
                      AND (p_id_chofer IS NULL OR COALESCE(inc.id_chofer, v.id_chofer) = p_id_chofer)
                )
                OR EXISTS (
                    SELECT 1 FROM public.historial_estados_factura h
                    JOIN public.estados he ON he.id_estado = h.id_estado_nuevo
                    WHERE h.id_factura = f.id_factura
                      AND LOWER(he.nombre_estado) = 'incidencia'
                      AND (p_id_chofer IS NULL OR h.id_usuario = p_id_chofer)
                )
            ) AS tuvo_incidencia,
            (
                LOWER(st.nombre_estado) = 'finalizado'
                AND (
                    EXISTS (
                        SELECT 1 FROM public.incidencias inc
                        WHERE inc.id_detalle_fact = f.id_factura
                          AND (p_id_chofer IS NULL OR COALESCE(inc.id_chofer, v.id_chofer) = p_id_chofer)
                    )
                    OR EXISTS (
                        SELECT 1 FROM public.historial_estados_factura h
                        JOIN public.estados he ON he.id_estado = h.id_estado_nuevo
                        WHERE h.id_factura = f.id_factura
                          AND LOWER(he.nombre_estado) = 'incidencia'
                          AND (p_id_chofer IS NULL OR h.id_usuario = p_id_chofer)
                    )
                )
            ) AS incidencia_resuelta
        FROM public.viajes v
        JOIN public.itinerario_viaje i ON i.id_viaje = v.id_viaje
        JOIN public.facturas f ON f.id_factura = i.id_factura
        JOIN public.estados st ON st.id_estado = f.id_estado
        LEFT JOIN public.sucursales_cliente s ON s.id = f.id_sucursal
        WHERE v.estado = 'finalizado'
          AND (p_desde IS NULL OR v.fecha_finalizacion::date >= p_desde)
          AND (p_hasta IS NULL OR v.fecha_finalizacion::date <= p_hasta)
          AND (p_id_chofer IS NULL OR v.id_chofer = p_id_chofer)
          AND (p_id_municipio IS NULL OR s.id_municipio = p_id_municipio)
    )
    SELECT jsonb_build_object(
        'viajes_finalizados', count(DISTINCT id_viaje),
        'entregas', count(*) FILTER (WHERE estado_actual = 'finalizado'),
        'entregas_directas', count(*) FILTER (WHERE estado_actual = 'finalizado' AND NOT tuvo_incidencia),
        'incidencias', count(*) FILTER (WHERE tuvo_incidencia),
        'incidencias_resueltas', count(*) FILTER (WHERE incidencia_resuelta),
        'incidencias_pendientes', count(*) FILTER (WHERE tuvo_incidencia AND estado_actual <> 'finalizado'),
        'monto_entregado_usd', COALESCE(sum(monto_dolares) FILTER (WHERE estado_actual = 'finalizado'), 0),
        'monto_entregado_bss', COALESCE(sum(monto_bss) FILTER (WHERE estado_actual = 'finalizado'), 0),
        'monto_incidencia_usd', COALESCE(sum(monto_dolares) FILTER (WHERE tuvo_incidencia), 0),
        'monto_incidencia_bss', COALESCE(sum(monto_bss) FILTER (WHERE tuvo_incidencia), 0),
        'monto_recuperado_usd', COALESCE(sum(monto_dolares) FILTER (WHERE incidencia_resuelta), 0),
        'monto_recuperado_bss', COALESCE(sum(monto_bss) FILTER (WHERE incidencia_resuelta), 0)
    )
    INTO v_kpis
    FROM facturas_viaje;

    -- Desglose por chofer
    SELECT COALESCE(jsonb_agg(c ORDER BY c.entregas DESC), '[]'::jsonb)
    INTO v_por_chofer
    FROM (
        SELECT
            r.id_chofer,
            COALESCE(r.nombre_chofer, 'Sin asignar') AS nombre_chofer,
            sum(r.entregas) AS entregas,
            sum(r.incidencias) AS incidencias,
            sum(r.incidencias_resueltas) AS incidencias_resueltas,
            sum(r.incidencias_pendientes) AS incidencias_pendientes,
            sum(r.monto_usd) AS monto_usd,
            sum(r.monto_bss) AS monto_bss,
            sum(r.km_planificados) AS km_planificados
        FROM (
            SELECT
                v.id_chofer,
                ch.nombre_completo AS nombre_chofer,
                v.id_viaje,
                count(*) FILTER (WHERE st.nombre_estado = 'finalizado') AS entregas,
                count(*) FILTER (WHERE (
                    LOWER(st.nombre_estado) = 'incidencia'
                    OR EXISTS (
                        SELECT 1 FROM public.incidencias inc
                        WHERE inc.id_detalle_fact = f.id_factura
                          AND COALESCE(inc.id_chofer, v.id_chofer) = v.id_chofer
                    )
                    OR EXISTS (
                        SELECT 1 FROM public.historial_estados_factura h
                        JOIN public.estados he ON he.id_estado = h.id_estado_nuevo
                        WHERE h.id_factura = f.id_factura
                          AND LOWER(he.nombre_estado) = 'incidencia'
                          AND h.id_usuario = v.id_chofer
                    )
                )) AS incidencias,
                count(*) FILTER (WHERE (
                    LOWER(st.nombre_estado) = 'finalizado'
                    AND (
                        EXISTS (
                            SELECT 1 FROM public.incidencias inc
                            WHERE inc.id_detalle_fact = f.id_factura
                              AND COALESCE(inc.id_chofer, v.id_chofer) = v.id_chofer
                        )
                        OR EXISTS (
                            SELECT 1 FROM public.historial_estados_factura h
                            JOIN public.estados he ON he.id_estado = h.id_estado_nuevo
                            WHERE h.id_factura = f.id_factura
                              AND LOWER(he.nombre_estado) = 'incidencia'
                              AND h.id_usuario = v.id_chofer
                        )
                    )
                )) AS incidencias_resueltas,
                count(*) FILTER (WHERE (
                    LOWER(st.nombre_estado) <> 'finalizado'
                    AND (
                        LOWER(st.nombre_estado) = 'incidencia'
                        OR EXISTS (
                            SELECT 1 FROM public.incidencias inc
                            WHERE inc.id_detalle_fact = f.id_factura
                              AND COALESCE(inc.id_chofer, v.id_chofer) = v.id_chofer
                        )
                        OR EXISTS (
                            SELECT 1 FROM public.historial_estados_factura h
                            JOIN public.estados he ON he.id_estado = h.id_estado_nuevo
                            WHERE h.id_factura = f.id_factura
                              AND LOWER(he.nombre_estado) = 'incidencia'
                              AND h.id_usuario = v.id_chofer
                        )
                    )
                )) AS incidencias_pendientes,
                COALESCE(sum(f.monto_dolares) FILTER (WHERE st.nombre_estado = 'finalizado'), 0) AS monto_usd,
                COALESCE(sum(f.monto_bss) FILTER (WHERE st.nombre_estado = 'finalizado'), 0) AS monto_bss,
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

    -- Desglose por municipio
    SELECT COALESCE(jsonb_agg(m ORDER BY m.entregas DESC), '[]'::jsonb)
    INTO v_por_municipio
    FROM (
        SELECT
            COALESCE(mun.nombre, 'Sin municipio') AS municipio,
            count(*) FILTER (WHERE st.nombre_estado = 'finalizado') AS entregas,
            count(*) FILTER (WHERE (
                LOWER(st.nombre_estado) = 'incidencia'
                OR EXISTS (SELECT 1 FROM public.incidencias inc WHERE inc.id_detalle_fact = f.id_factura)
                OR EXISTS (SELECT 1 FROM public.historial_estados_factura h JOIN public.estados he ON he.id_estado = h.id_estado_nuevo WHERE h.id_factura = f.id_factura AND LOWER(he.nombre_estado) = 'incidencia')
            )) AS incidencias,
            count(*) FILTER (WHERE (
                LOWER(st.nombre_estado) = 'finalizado'
                AND (
                    EXISTS (SELECT 1 FROM public.incidencias inc WHERE inc.id_detalle_fact = f.id_factura)
                    OR EXISTS (SELECT 1 FROM public.historial_estados_factura h JOIN public.estados he ON he.id_estado = h.id_estado_nuevo WHERE h.id_factura = f.id_factura AND LOWER(he.nombre_estado) = 'incidencia')
                )
            )) AS incidencias_resueltas,
            COALESCE(sum(f.monto_dolares), 0) AS monto_usd,
            COALESCE(sum(f.monto_bss), 0) AS monto_bss
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

    -- Tiempo promedio por etapa (minutos)
    SELECT COALESCE(jsonb_agg(t ORDER BY t.orden), '[]'::jsonb)
    INTO v_tiempos
    FROM (
        SELECT
            'Carga de mercancía' AS etapa,
            1 AS orden,
            COALESCE(round(avg(EXTRACT(EPOCH FROM (h_fin.fecha_cambio - h_ini.fecha_cambio)) / 60)::numeric, 1), 0) AS minutos
        FROM public.historial_estados_factura h_ini
        JOIN public.estados e_ini ON e_ini.id_estado = h_ini.id_estado_nuevo AND LOWER(e_ini.nombre_estado) = 'embarque'
        JOIN public.historial_estados_factura h_fin ON h_fin.id_factura = h_ini.id_factura
        JOIN public.estados e_fin ON e_fin.id_estado = h_fin.id_estado_nuevo AND LOWER(e_fin.nombre_estado) = 'proceso'
        JOIN public.facturas f ON f.id_factura = h_ini.id_factura
        JOIN public.guias_carga g ON g.id_guia = f.id_guia
        WHERE (p_desde IS NULL OR h_ini.fecha_cambio::date >= p_desde)
          AND (p_hasta IS NULL OR h_ini.fecha_cambio::date <= p_hasta)
          AND (p_id_chofer IS NULL OR g.id_chofer = p_id_chofer)
          AND h_fin.fecha_cambio > h_ini.fecha_cambio

        UNION ALL

        SELECT
            'Tiempo en ruta' AS etapa,
            2 AS orden,
            COALESCE(round(avg(EXTRACT(EPOCH FROM (h_fin.fecha_cambio - h_ini.fecha_cambio)) / 60)::numeric, 1), 0) AS minutos
        FROM public.historial_estados_factura h_ini
        JOIN public.estados e_ini ON e_ini.id_estado = h_ini.id_estado_nuevo AND LOWER(e_ini.nombre_estado) = 'proceso'
        JOIN public.historial_estados_factura h_fin ON h_fin.id_factura = h_ini.id_factura
        JOIN public.estados e_fin ON e_fin.id_estado = h_fin.id_estado_nuevo AND LOWER(e_fin.nombre_estado) IN ('espera', 'entrega', 'incidencia', 'finalizado')
        JOIN public.facturas f ON f.id_factura = h_ini.id_factura
        JOIN public.guias_carga g ON g.id_guia = f.id_guia
        WHERE (p_desde IS NULL OR h_ini.fecha_cambio::date >= p_desde)
          AND (p_hasta IS NULL OR h_ini.fecha_cambio::date <= p_hasta)
          AND (p_id_chofer IS NULL OR g.id_chofer = p_id_chofer)
          AND h_fin.fecha_cambio > h_ini.fecha_cambio

        UNION ALL

        SELECT
            'Espera en cliente' AS etapa,
            3 AS orden,
            COALESCE(round(avg(EXTRACT(EPOCH FROM (h_fin.fecha_cambio - h_ini.fecha_cambio)) / 60)::numeric, 1), 0) AS minutos
        FROM public.historial_estados_factura h_ini
        JOIN public.estados e_ini ON e_ini.id_estado = h_ini.id_estado_nuevo AND LOWER(e_ini.nombre_estado) = 'espera'
        JOIN public.historial_estados_factura h_fin ON h_fin.id_factura = h_ini.id_factura
        JOIN public.estados e_fin ON e_fin.id_estado = h_fin.id_estado_nuevo AND LOWER(e_fin.nombre_estado) IN ('entrega', 'incidencia', 'finalizado')
        JOIN public.facturas f ON f.id_factura = h_ini.id_factura
        JOIN public.guias_carga g ON g.id_guia = f.id_guia
        WHERE (p_desde IS NULL OR h_ini.fecha_cambio::date >= p_desde)
          AND (p_hasta IS NULL OR h_ini.fecha_cambio::date <= p_hasta)
          AND (p_id_chofer IS NULL OR g.id_chofer = p_id_chofer)
          AND h_fin.fecha_cambio > h_ini.fecha_cambio

        UNION ALL

        SELECT
            'Entrega / Descarga' AS etapa,
            4 AS orden,
            COALESCE(round(avg(EXTRACT(EPOCH FROM (h_fin.fecha_cambio - h_ini.fecha_cambio)) / 60)::numeric, 1), 0) AS minutos
        FROM public.historial_estados_factura h_ini
        JOIN public.estados e_ini ON e_ini.id_estado = h_ini.id_estado_nuevo AND LOWER(e_ini.nombre_estado) = 'entrega'
        JOIN public.historial_estados_factura h_fin ON h_fin.id_factura = h_ini.id_factura
        JOIN public.estados e_fin ON e_fin.id_estado = h_fin.id_estado_nuevo AND LOWER(e_fin.nombre_estado) IN ('finalizado', 'incidencia')
        JOIN public.facturas f ON f.id_factura = h_ini.id_factura
        JOIN public.guias_carga g ON g.id_guia = f.id_guia
        WHERE (p_desde IS NULL OR h_ini.fecha_cambio::date >= p_desde)
          AND (p_hasta IS NULL OR h_ini.fecha_cambio::date <= p_hasta)
          AND (p_id_chofer IS NULL OR g.id_chofer = p_id_chofer)
          AND h_fin.fecha_cambio > h_ini.fecha_cambio
    ) t;

    RETURN jsonb_build_object(
        'kpis', v_kpis,
        'por_chofer', v_por_chofer,
        'por_municipio', v_por_municipio,
        'tiempos', v_tiempos
    );
END;
$$;

REVOKE ALL ON FUNCTION public.obtener_metricas_eficiencia(date, date, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.obtener_metricas_eficiencia(date, date, uuid, uuid) TO authenticated;
