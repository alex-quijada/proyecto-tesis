-- ============================================================
-- 00097: obtener_resumen_gastos — los totales respetan el filtro
-- de vehículo.
--
--  Bug: el bloque `totales` (KPIs + doughnut del reporte de
--  gastos) sumaba todas las cargas de combustible y mantenimientos
--  del rango ignorando `p_id_vehiculo`. Solo `por_vehiculo`
--  (tabla + barras) aplicaba el filtro, así que al filtrar por un
--  vehículo las cards y la dona seguían mostrando el total general.
--
--  Se recrea la función (misma firma) agregando el filtro de
--  vehículo también en los totales. Sin cambios de grants.
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
            COALESCE(cf.costo_combustible_bss, 0) AS costo_combustible_bss,
            COALESCE(cf.cargas, 0) AS cargas,
            COALESCE(mt.costo_mantenimiento, 0) AS costo_mantenimiento,
            COALESCE(mt.costo_mantenimiento_bss, 0) AS costo_mantenimiento_bss,
            COALESCE(mt.mantenimientos, 0) AS mantenimientos,
            COALESCE(cf.costo_combustible, 0) + COALESCE(mt.costo_mantenimiento, 0) AS costo_total,
            COALESCE(cf.costo_combustible_bss, 0) + COALESCE(mt.costo_mantenimiento_bss, 0) AS costo_total_bss,
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
                sum(cc.costo_total_bss) AS costo_combustible_bss,
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
                sum(mt.costo_bss) AS costo_mantenimiento_bss,
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

    -- Totales globales (USD + Bs), respetando el filtro de vehículo.
    SELECT jsonb_build_object(
        'costo_combustible', COALESCE(sum(cc.costo_total), 0),
        'litros', COALESCE(sum(cc.litros), 0),
        'costo_mantenimiento', COALESCE((SELECT sum(costo) FROM public.mantenimientos
            WHERE (p_desde IS NULL OR COALESCE(fecha_realizado, fecha_programada) >= p_desde)
              AND (p_hasta IS NULL OR COALESCE(fecha_realizado, fecha_programada) <= p_hasta)
              AND (p_id_vehiculo IS NULL OR id_vehiculo = p_id_vehiculo)), 0),
        'costo_total', COALESCE(sum(cc.costo_total), 0) +
            COALESCE((SELECT sum(costo) FROM public.mantenimientos
                WHERE (p_desde IS NULL OR COALESCE(fecha_realizado, fecha_programada) >= p_desde)
                  AND (p_hasta IS NULL OR COALESCE(fecha_realizado, fecha_programada) <= p_hasta)
                  AND (p_id_vehiculo IS NULL OR id_vehiculo = p_id_vehiculo)), 0),
        'costo_combustible_bss', COALESCE(sum(cc.costo_total_bss), 0),
        'costo_mantenimiento_bss', COALESCE((SELECT sum(costo_bss) FROM public.mantenimientos
            WHERE (p_desde IS NULL OR COALESCE(fecha_realizado, fecha_programada) >= p_desde)
              AND (p_hasta IS NULL OR COALESCE(fecha_realizado, fecha_programada) <= p_hasta)
              AND (p_id_vehiculo IS NULL OR id_vehiculo = p_id_vehiculo)), 0),
        'costo_total_bss', COALESCE(sum(cc.costo_total_bss), 0) +
            COALESCE((SELECT sum(costo_bss) FROM public.mantenimientos
                WHERE (p_desde IS NULL OR COALESCE(fecha_realizado, fecha_programada) >= p_desde)
                  AND (p_hasta IS NULL OR COALESCE(fecha_realizado, fecha_programada) <= p_hasta)
                  AND (p_id_vehiculo IS NULL OR id_vehiculo = p_id_vehiculo)), 0)
    )
    INTO v_totales
    FROM public.cargas_combustible cc
    WHERE (p_desde IS NULL OR cc.fecha >= p_desde)
      AND (p_hasta IS NULL OR cc.fecha <= p_hasta)
      AND (p_id_vehiculo IS NULL OR cc.id_vehiculo = p_id_vehiculo);

    RETURN jsonb_build_object(
        'por_vehiculo', v_vehiculos,
        'totales', v_totales
    );
END;
$$;

-- Grants: misma firma (date, date, uuid), se re-aplican por consistencia.
REVOKE ALL ON FUNCTION public.obtener_resumen_gastos(date, date, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.obtener_resumen_gastos(date, date, uuid) TO authenticated;