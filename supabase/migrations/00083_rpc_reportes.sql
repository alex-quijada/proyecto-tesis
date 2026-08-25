-- ============================================================
-- 00083: RPCs de agregación para los reportes del área de
-- Informes y Reportes. Solo personal interno puede ejecutarlos.
--
--  1) obtener_metricas_eficiencia  — KPIs + por chofer/municipio
--                                    + tiempos promedio por etapa.
--  2) obtener_resumen_gastos       — combustible + mantenimiento
--                                    por vehículo, con costo/km.
--  3) obtener_resumen_incidencias  — por tipo y por chofer,
--                                    recuperables/terminales,
--                                    resueltas/pendientes, monto.
-- ============================================================

-- ============================================================
-- 1) Eficiencia
-- ============================================================
CREATE OR REPLACE FUNCTION public.obtener_metricas_eficiencia(
    p_desde date DEFAULT NULL,
    p_hasta date DEFAULT NULL
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

    -- KPIs sobre viajes finalizados en el rango.
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
    WHERE v.estado = 'finalizado'
      AND (p_desde IS NULL OR v.fecha_finalizacion::date >= p_desde)
      AND (p_hasta IS NULL OR v.fecha_finalizacion::date <= p_hasta);

    -- Desglose por chofer (sobre viajes finalizados en el rango).
    -- Se agrega primero por viaje (para no multiplicar la distancia por
    -- el número de facturas) y luego se consolida por chofer.
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
            WHERE v.estado = 'finalizado'
              AND (p_desde IS NULL OR v.fecha_finalizacion::date >= p_desde)
              AND (p_hasta IS NULL OR v.fecha_finalizacion::date <= p_hasta)
            GROUP BY v.id_chofer, ch.nombre_completo, v.id_viaje, v.distancia_total_km
        ) r
        GROUP BY r.id_chofer, r.nombre_chofer
    ) c;

    -- Desglose por municipio (paradas de viajes finalizados).
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
            WHERE v.estado = 'finalizado'
              AND (p_desde IS NULL OR v.fecha_finalizacion::date >= p_desde)
              AND (p_hasta IS NULL OR v.fecha_finalizacion::date <= p_hasta)
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
-- 2) Resumen de gastos
-- ============================================================
CREATE OR REPLACE FUNCTION public.obtener_resumen_gastos(
    p_desde date DEFAULT NULL,
    p_hasta date DEFAULT NULL,
    p_id_vehiculo uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_vehiculos jsonb;
    v_totales jsonb;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Sesión no válida' USING ERRCODE = 'P0002';
    END IF;

    IF NOT public.es_personal_interno() THEN
        RAISE EXCEPTION 'No tienes permiso para consultar reportes' USING ERRCODE = 'P0001';
    END IF;

    -- Desglose por vehículo: combustible + mantenimiento + km recorridos.
    SELECT COALESCE(jsonb_agg(v ORDER BY v.costo_total DESC), '[]'::jsonb)
    INTO v_vehiculos
    FROM (
        SELECT
            veh.id_vehiculo,
            veh.placa,
            veh.marca || ' ' || veh.modelo AS vehiculo_desc,
            COALESCE(cf.litros, 0) AS litros_combustible,
            COALESCE(cf.costo_combustible, 0) AS costo_combustible,
            COALESCE(cf.cargas, 0) AS cargas,
            COALESCE(mt.costo_mantenimiento, 0) AS costo_mantenimiento,
            COALESCE(mt.mantenimientos, 0) AS mantenimientos,
            COALESCE(cf.costo_combustible, 0) + COALESCE(mt.costo_mantenimiento, 0) AS costo_total,
            COALESCE(km.km_recorridos, 0) AS km_recorridos,
            CASE
                WHEN COALESCE(km.km_recorridos, 0) > 0 THEN
                    round(
                        ((COALESCE(cf.costo_combustible, 0) + COALESCE(mt.costo_mantenimiento, 0)) /
                         km.km_recorridos)::numeric, 4
                    )
                ELSE 0
            END AS costo_por_km
        FROM public.vehiculos veh
        LEFT JOIN (
            SELECT
                cc.id_vehiculo,
                sum(cc.litros) AS litros,
                sum(cc.costo_total) AS costo_combustible,
                count(*) AS cargas
            FROM public.cargas_combustible cc
            WHERE (p_desde IS NULL OR cc.fecha >= p_desde)
              AND (p_hasta IS NULL OR cc.fecha <= p_hasta)
            GROUP BY cc.id_vehiculo
        ) cf ON cf.id_vehiculo = veh.id_vehiculo
        LEFT JOIN (
            SELECT
                mt.id_vehiculo,
                sum(mt.costo) AS costo_mantenimiento,
                count(*) AS mantenimientos
            FROM public.mantenimientos mt
            WHERE (p_desde IS NULL OR COALESCE(mt.fecha_realizado, mt.fecha_programada) >= p_desde)
              AND (p_hasta IS NULL OR COALESCE(mt.fecha_realizado, mt.fecha_programada) <= p_hasta)
            GROUP BY mt.id_vehiculo
        ) mt ON mt.id_vehiculo = veh.id_vehiculo
        LEFT JOIN (
            SELECT
                v.id_vehiculo,
                sum(COALESCE(v.distancia_total_km, 0)) AS km_recorridos
            FROM public.viajes v
            WHERE v.estado = 'finalizado'
              AND (p_desde IS NULL OR v.fecha_finalizacion::date >= p_desde)
              AND (p_hasta IS NULL OR v.fecha_finalizacion::date <= p_hasta)
            GROUP BY v.id_vehiculo
        ) km ON km.id_vehiculo = veh.id_vehiculo
        WHERE (p_id_vehiculo IS NULL OR veh.id_vehiculo = p_id_vehiculo)
          AND (cf.id_vehiculo IS NOT NULL OR mt.id_vehiculo IS NOT NULL OR km.id_vehiculo IS NOT NULL)
    ) v;

    -- Totales globales.
    SELECT jsonb_build_object(
        'costo_combustible', COALESCE(sum(cc.costo_total), 0),
        'litros', COALESCE(sum(cc.litros), 0),
        'costo_mantenimiento', COALESCE((SELECT sum(costo) FROM public.mantenimientos
            WHERE (p_desde IS NULL OR COALESCE(fecha_realizado, fecha_programada) >= p_desde)
              AND (p_hasta IS NULL OR COALESCE(fecha_realizado, fecha_programada) <= p_hasta)), 0),
        'costo_total', COALESCE(sum(cc.costo_total), 0) +
            COALESCE((SELECT sum(costo) FROM public.mantenimientos
                WHERE (p_desde IS NULL OR COALESCE(fecha_realizado, fecha_programada) >= p_desde)
                  AND (p_hasta IS NULL OR COALESCE(fecha_realizado, fecha_programada) <= p_hasta)), 0)
    )
    INTO v_totales
    FROM public.cargas_combustible cc
    WHERE (p_desde IS NULL OR cc.fecha >= p_desde)
      AND (p_hasta IS NULL OR cc.fecha <= p_hasta);

    RETURN jsonb_build_object(
        'por_vehiculo', v_vehiculos,
        'totales', v_totales
    );
END;
$$;

-- ============================================================
-- 3) Resumen de incidencias
-- ============================================================
CREATE OR REPLACE FUNCTION public.obtener_resumen_incidencias(
    p_desde date DEFAULT NULL,
    p_hasta date DEFAULT NULL
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
        WHERE (p_desde IS NULL OR inc.hora_reporte::date >= p_desde)
          AND (p_hasta IS NULL OR inc.hora_reporte::date <= p_hasta)
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
        GROUP BY ch.nombre_completo
    ) c;

    SELECT jsonb_build_object(
        'total', (SELECT count(*) FROM public.incidencias
            WHERE (p_desde IS NULL OR hora_reporte::date >= p_desde)
              AND (p_hasta IS NULL OR hora_reporte::date <= p_hasta)),
        'recuperables', (SELECT count(*) FROM public.incidencias
            WHERE recuperable = true
              AND (p_desde IS NULL OR hora_reporte::date >= p_desde)
              AND (p_hasta IS NULL OR hora_reporte::date <= p_hasta)),
        'terminales', (SELECT count(*) FROM public.incidencias
            WHERE recuperable = false
              AND (p_desde IS NULL OR hora_reporte::date >= p_desde)
              AND (p_hasta IS NULL OR hora_reporte::date <= p_hasta)),
        'resueltas', (SELECT count(*) FROM public.incidencias
            WHERE resuelta = true
              AND (p_desde IS NULL OR hora_reporte::date >= p_desde)
              AND (p_hasta IS NULL OR hora_reporte::date <= p_hasta)),
        'pendientes', (SELECT count(*) FROM public.incidencias
            WHERE resuelta = false
              AND (p_desde IS NULL OR hora_reporte::date >= p_desde)
              AND (p_hasta IS NULL OR hora_reporte::date <= p_hasta)),
        'monto_usd', (SELECT COALESCE(sum(f.monto_dolares), 0)
            FROM public.incidencias inc
            LEFT JOIN public.facturas f ON f.id_factura = inc.id_detalle_fact
            WHERE (p_desde IS NULL OR inc.hora_reporte::date >= p_desde)
              AND (p_hasta IS NULL OR inc.hora_reporte::date <= p_hasta))
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
REVOKE ALL ON FUNCTION public.obtener_metricas_eficiencia(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.obtener_metricas_eficiencia(date, date) TO authenticated;
REVOKE ALL ON FUNCTION public.obtener_resumen_gastos(date, date, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.obtener_resumen_gastos(date, date, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.obtener_resumen_incidencias(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.obtener_resumen_incidencias(date, date) TO authenticated;