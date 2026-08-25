-- ============================================================
-- 00086: Montos en bolívares (Bs) en gastos.
--
--  - cargas_combustible.costo_total_bss (Bs de la carga).
--  - mantenimientos.costo_bss (Bs del mantenimiento).
--  - RPCs CRUD actualizados para recibir/devolver Bs.
--  - obtener_resumen_gastos devuelve montos en Bs.
--
-- Se DROP-ean las firmas CRUD que cambian y se recrean. Las
-- funciones obtener_* conservan su firma (solo cambia el cuerpo).
-- ============================================================

-- ============================================================
-- 1) Columnas nuevas
-- ============================================================
ALTER TABLE public.cargas_combustible
    ADD COLUMN IF NOT EXISTS costo_total_bss numeric(14,2) NOT NULL DEFAULT 0;

ALTER TABLE public.mantenimientos
    ADD COLUMN IF NOT EXISTS costo_bss numeric(14,2) NOT NULL DEFAULT 0;

-- ============================================================
-- 2) RPCs CRUD — cargas_combustible (cambian firma: se DROP)
-- ============================================================
DROP FUNCTION IF EXISTS public.crear_carga_combustible(uuid, date, varchar, varchar, numeric, numeric, numeric, numeric, numeric, numeric, text, text);
DROP FUNCTION IF EXISTS public.actualizar_carga_combustible(uuid, uuid, date, varchar, varchar, numeric, numeric, numeric, numeric, numeric, numeric, text, text);

CREATE OR REPLACE FUNCTION public.crear_carga_combustible(
    p_id_vehiculo uuid,
    p_fecha date,
    p_tipo_combustible varchar,
    p_metodo_calculo varchar DEFAULT 'TANQUE',
    p_kilometraje numeric DEFAULT NULL,
    p_nivel_tanque_antes numeric DEFAULT NULL,
    p_nivel_tanque_despues numeric DEFAULT NULL,
    p_litros numeric DEFAULT NULL,
    p_costo_por_litro numeric DEFAULT NULL,
    p_costo_total numeric DEFAULT NULL,
    p_costo_total_bss numeric DEFAULT 0,
    p_estacion_servicio text DEFAULT NULL,
    p_observaciones text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id uuid;
BEGIN
    IF NOT public.es_personal_interno() THEN
        RAISE EXCEPTION 'No tienes permiso para registrar cargas de combustible' USING ERRCODE = 'P0001';
    END IF;

    INSERT INTO public.cargas_combustible (
        id_vehiculo, fecha, tipo_combustible, metodo_calculo,
        kilometraje, nivel_tanque_antes, nivel_tanque_despues,
        litros, costo_por_litro, costo_total, costo_total_bss,
        estacion_servicio, observaciones
    ) VALUES (
        p_id_vehiculo, p_fecha, p_tipo_combustible, p_metodo_calculo,
        p_kilometraje, p_nivel_tanque_antes, p_nivel_tanque_despues,
        p_litros, p_costo_por_litro, p_costo_total, p_costo_total_bss,
        p_estacion_servicio, p_observaciones
    )
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.actualizar_carga_combustible(
    p_id uuid,
    p_id_vehiculo uuid,
    p_fecha date,
    p_tipo_combustible varchar,
    p_metodo_calculo varchar,
    p_kilometraje numeric,
    p_nivel_tanque_antes numeric,
    p_nivel_tanque_despues numeric,
    p_litros numeric,
    p_costo_por_litro numeric,
    p_costo_total numeric,
    p_estacion_servicio text,
    p_observaciones text,
    p_costo_total_bss numeric DEFAULT 0
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.es_personal_interno() THEN
        RAISE EXCEPTION 'No tienes permiso para actualizar cargas de combustible' USING ERRCODE = 'P0001';
    END IF;

    UPDATE public.cargas_combustible SET
        id_vehiculo = p_id_vehiculo,
        fecha = p_fecha,
        tipo_combustible = p_tipo_combustible,
        metodo_calculo = p_metodo_calculo,
        kilometraje = p_kilometraje,
        nivel_tanque_antes = p_nivel_tanque_antes,
        nivel_tanque_despues = p_nivel_tanque_despues,
        litros = p_litros,
        costo_por_litro = p_costo_por_litro,
        costo_total = p_costo_total,
        costo_total_bss = p_costo_total_bss,
        estacion_servicio = p_estacion_servicio,
        observaciones = p_observaciones
    WHERE id = p_id;
END;
$$;

-- obtener_cargas_combustible: misma firma, cuerpo con Bs
CREATE OR REPLACE FUNCTION public.obtener_cargas_combustible(
    p_id_vehiculo uuid DEFAULT NULL,
    p_desde date DEFAULT NULL,
    p_hasta date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_resultado jsonb;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Sesión no válida' USING ERRCODE = 'P0002';
    END IF;

    SELECT COALESCE(jsonb_agg(c ORDER BY c.fecha DESC), '[]'::jsonb)
    INTO v_resultado
    FROM (
        SELECT
            cc.id,
            cc.id_vehiculo,
            v.placa AS placa_vehiculo,
            v.marca || ' ' || v.modelo AS vehiculo_desc,
            cc.fecha,
            cc.tipo_combustible,
            cc.metodo_calculo,
            cc.kilometraje,
            cc.nivel_tanque_antes,
            cc.nivel_tanque_despues,
            cc.litros,
            cc.costo_por_litro,
            cc.costo_total,
            cc.costo_total_bss,
            cc.estacion_servicio,
            cc.observaciones,
            cc.created_at
        FROM public.cargas_combustible cc
        LEFT JOIN public.vehiculos v ON v.id_vehiculo = cc.id_vehiculo
        WHERE (p_id_vehiculo IS NULL OR cc.id_vehiculo = p_id_vehiculo)
          AND (p_desde IS NULL OR cc.fecha >= p_desde)
          AND (p_hasta IS NULL OR cc.fecha <= p_hasta)
    ) c;

    RETURN v_resultado;
END;
$$;

-- ============================================================
-- 3) RPCs CRUD — mantenimientos (cambian firma: se DROP)
-- ============================================================
DROP FUNCTION IF EXISTS public.crear_mantenimiento(uuid, varchar, date, date, numeric, text, text, numeric, numeric, date, varchar);
DROP FUNCTION IF EXISTS public.actualizar_mantenimiento(uuid, uuid, varchar, date, date, numeric, text, text, numeric, numeric, date, varchar);

CREATE OR REPLACE FUNCTION public.crear_mantenimiento(
    p_id_vehiculo uuid,
    p_tipo varchar,
    p_fecha_programada date,
    p_fecha_realizado date DEFAULT NULL,
    p_kilometraje numeric DEFAULT NULL,
    p_descripcion text DEFAULT NULL,
    p_responsable text DEFAULT NULL,
    p_costo numeric DEFAULT 0,
    p_costo_bss numeric DEFAULT 0,
    p_proximo_km numeric DEFAULT NULL,
    p_proxima_fecha date DEFAULT NULL,
    p_estado varchar DEFAULT 'PROGRAMADO'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id uuid;
BEGIN
    IF NOT public.es_personal_interno() THEN
        RAISE EXCEPTION 'No tienes permiso para registrar mantenimientos' USING ERRCODE = 'P0001';
    END IF;

    INSERT INTO public.mantenimientos (
        id_vehiculo, tipo, fecha_programada, fecha_realizado,
        kilometraje, descripcion, responsable, costo, costo_bss,
        proximo_km, proxima_fecha, estado
    ) VALUES (
        p_id_vehiculo, p_tipo, p_fecha_programada, p_fecha_realizado,
        p_kilometraje, p_descripcion, p_responsable, p_costo, p_costo_bss,
        p_proximo_km, p_proxima_fecha, p_estado
    )
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.actualizar_mantenimiento(
    p_id uuid,
    p_id_vehiculo uuid,
    p_tipo varchar,
    p_fecha_programada date,
    p_fecha_realizado date,
    p_kilometraje numeric,
    p_descripcion text,
    p_responsable text,
    p_costo numeric,
    p_proximo_km numeric,
    p_proxima_fecha date,
    p_estado varchar,
    p_costo_bss numeric DEFAULT 0
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.es_personal_interno() THEN
        RAISE EXCEPTION 'No tienes permiso para actualizar mantenimientos' USING ERRCODE = 'P0001';
    END IF;

    UPDATE public.mantenimientos SET
        id_vehiculo = p_id_vehiculo,
        tipo = p_tipo,
        fecha_programada = p_fecha_programada,
        fecha_realizado = p_fecha_realizado,
        kilometraje = p_kilometraje,
        descripcion = p_descripcion,
        responsable = p_responsable,
        costo = p_costo,
        costo_bss = p_costo_bss,
        proximo_km = p_proximo_km,
        proxima_fecha = p_proxima_fecha,
        estado = p_estado
    WHERE id = p_id;
END;
$$;

-- obtener_mantenimientos: misma firma, cuerpo con Bs
CREATE OR REPLACE FUNCTION public.obtener_mantenimientos(
    p_id_vehiculo uuid DEFAULT NULL,
    p_desde date DEFAULT NULL,
    p_hasta date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_resultado jsonb;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Sesión no válida' USING ERRCODE = 'P0002';
    END IF;

    SELECT COALESCE(jsonb_agg(m ORDER BY COALESCE(m.fecha_realizado, m.fecha_programada) DESC), '[]'::jsonb)
    INTO v_resultado
    FROM (
        SELECT
            mt.id,
            mt.id_vehiculo,
            v.placa AS placa_vehiculo,
            v.marca || ' ' || v.modelo AS vehiculo_desc,
            mt.tipo,
            mt.fecha_programada,
            mt.fecha_realizado,
            mt.kilometraje,
            mt.descripcion,
            mt.responsable,
            mt.costo,
            mt.costo_bss,
            mt.proximo_km,
            mt.proxima_fecha,
            mt.estado,
            mt.created_at
        FROM public.mantenimientos mt
        LEFT JOIN public.vehiculos v ON v.id_vehiculo = mt.id_vehiculo
        WHERE (p_id_vehiculo IS NULL OR mt.id_vehiculo = p_id_vehiculo)
          AND (p_desde IS NULL OR COALESCE(mt.fecha_realizado, mt.fecha_programada) >= p_desde)
          AND (p_hasta IS NULL OR COALESCE(mt.fecha_realizado, mt.fecha_programada) <= p_hasta)
    ) m;

    RETURN v_resultado;
END;
$$;

-- ============================================================
-- 4) Resumen de gastos (misma firma, montos USD + Bs)
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

    -- Totales globales (USD + Bs).
    SELECT jsonb_build_object(
        'costo_combustible', COALESCE(sum(cc.costo_total), 0),
        'litros', COALESCE(sum(cc.litros), 0),
        'costo_mantenimiento', COALESCE((SELECT sum(costo) FROM public.mantenimientos
            WHERE (p_desde IS NULL OR COALESCE(fecha_realizado, fecha_programada) >= p_desde)
              AND (p_hasta IS NULL OR COALESCE(fecha_realizado, fecha_programada) <= p_hasta)), 0),
        'costo_total', COALESCE(sum(cc.costo_total), 0) +
            COALESCE((SELECT sum(costo) FROM public.mantenimientos
                WHERE (p_desde IS NULL OR COALESCE(fecha_realizado, fecha_programada) >= p_desde)
                  AND (p_hasta IS NULL OR COALESCE(fecha_realizado, fecha_programada) <= p_hasta)), 0),
        'costo_combustible_bss', COALESCE(sum(cc.costo_total_bss), 0),
        'costo_mantenimiento_bss', COALESCE((SELECT sum(costo_bss) FROM public.mantenimientos
            WHERE (p_desde IS NULL OR COALESCE(fecha_realizado, fecha_programada) >= p_desde)
              AND (p_hasta IS NULL OR COALESCE(fecha_realizado, fecha_programada) <= p_hasta)), 0),
        'costo_total_bss', COALESCE(sum(cc.costo_total_bss), 0) +
            COALESCE((SELECT sum(costo_bss) FROM public.mantenimientos
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
-- Grants
-- ============================================================
REVOKE ALL ON FUNCTION public.crear_carga_combustible(uuid, date, varchar, varchar, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crear_carga_combustible(uuid, date, varchar, varchar, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.actualizar_carga_combustible(uuid, uuid, date, varchar, varchar, numeric, numeric, numeric, numeric, numeric, numeric, text, text, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.actualizar_carga_combustible(uuid, uuid, date, varchar, varchar, numeric, numeric, numeric, numeric, numeric, numeric, text, text, numeric) TO authenticated;
REVOKE ALL ON FUNCTION public.obtener_cargas_combustible(uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.obtener_cargas_combustible(uuid, date, date) TO authenticated;

REVOKE ALL ON FUNCTION public.crear_mantenimiento(uuid, varchar, date, date, numeric, text, text, numeric, numeric, numeric, date, varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crear_mantenimiento(uuid, varchar, date, date, numeric, text, text, numeric, numeric, numeric, date, varchar) TO authenticated;
REVOKE ALL ON FUNCTION public.actualizar_mantenimiento(uuid, uuid, varchar, date, date, numeric, text, text, numeric, numeric, date, varchar, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.actualizar_mantenimiento(uuid, uuid, varchar, date, date, numeric, text, text, numeric, numeric, date, varchar, numeric) TO authenticated;
REVOKE ALL ON FUNCTION public.obtener_mantenimientos(uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.obtener_mantenimientos(uuid, date, date) TO authenticated;

REVOKE ALL ON FUNCTION public.obtener_resumen_gastos(date, date, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.obtener_resumen_gastos(date, date, uuid) TO authenticated;