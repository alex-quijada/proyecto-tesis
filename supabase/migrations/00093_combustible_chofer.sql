-- ============================================================
-- 00093: Combustible desde el chofer + tasa del día.
--
--  - cargas_combustible.id_chofer  : quién registró la carga (NULL = staff).
--  - cargas_combustible.origen     : 'CHOFER' | 'STAFF' (procedencia).
--  - cargas_combustible.tasa_bs    : tasa Bs/USD del día (por registro).
--  - Se elimina el método de cálculo 'GPS' (solo TANQUE/ODOMETRO).
--  - RPCs CRUD recreados (cambia firma: se DROP de las firmas previas).
--  - Nuevo RPC registrar_carga_combustible_chofer (SECURITY DEFINER)
--    para que el chofer registre su carga (litros + costo USD + tasa).
-- ============================================================

-- ============================================================
-- 1) Columnas nuevas
-- ============================================================
ALTER TABLE public.cargas_combustible
    ADD COLUMN IF NOT EXISTS id_chofer uuid REFERENCES public.usuarios(id_usuario) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS origen varchar(10) NOT NULL DEFAULT 'STAFF'
        CHECK (origen IN ('STAFF', 'CHOFER')),
    ADD COLUMN IF NOT EXISTS tasa_bs numeric(14,2) NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_cargas_combustible_chofer
    ON public.cargas_combustible (id_chofer, fecha DESC);

-- ============================================================
-- 2) Eliminar el método de cálculo 'GPS'
-- ============================================================
-- Backfill defensivo: si hubiera filas con GPS, se tratan como ODOMETRO.
UPDATE public.cargas_combustible SET metodo_calculo = 'ODOMETRO'
    WHERE metodo_calculo = 'GPS';

ALTER TABLE public.cargas_combustible
    DROP CONSTRAINT IF EXISTS cargas_combustible_metodo_calculo_check;

ALTER TABLE public.cargas_combustible
    ADD CONSTRAINT cargas_combustible_metodo_calculo_check
        CHECK (metodo_calculo IN ('TANQUE', 'ODOMETRO'));

-- ============================================================
-- 3) RPCs CRUD — cargas_combustible (cambian firma: se DROP)
-- ============================================================
DROP FUNCTION IF EXISTS public.crear_carga_combustible(uuid, date, varchar, varchar, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text, text);
DROP FUNCTION IF EXISTS public.actualizar_carga_combustible(uuid, uuid, date, varchar, varchar, numeric, numeric, numeric, numeric, numeric, numeric, text, text, numeric);

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
    p_tasa_bs numeric DEFAULT 0,
    p_estacion_servicio text DEFAULT NULL,
    p_observaciones text DEFAULT NULL,
    p_id_chofer uuid DEFAULT NULL,
    p_origen varchar DEFAULT 'STAFF'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id uuid;
    v_final_chofer uuid;
    v_final_origen varchar;
BEGIN
    IF NOT public.es_personal_interno() THEN
        RAISE EXCEPTION 'No tienes permiso para registrar cargas de combustible' USING ERRCODE = 'P0001';
    END IF;

    v_final_chofer := p_id_chofer;
    v_final_origen := p_origen;

    IF v_final_origen = 'CHOFER' THEN
        -- El chofer solo puede registrar para sí mismo.
        IF v_final_chofer IS NULL OR v_final_chofer <> auth.uid() THEN
            RAISE EXCEPTION 'El chofer no puede registrar cargas para otro usuario' USING ERRCODE = 'P0001';
        END IF;
        -- El vehículo debe pertenecer al chofer (vía sus guías asignadas).
        IF NOT EXISTS (
            SELECT 1 FROM public.guias_carga g
            WHERE g.id_chofer = v_final_chofer AND g.id_vehiculo = p_id_vehiculo
        ) THEN
            RAISE EXCEPTION 'El vehículo no está asignado a este chofer' USING ERRCODE = 'P0001';
        END IF;
    END IF;

    INSERT INTO public.cargas_combustible (
        id_vehiculo, fecha, tipo_combustible, metodo_calculo,
        kilometraje, nivel_tanque_antes, nivel_tanque_despues,
        litros, costo_por_litro, costo_total, costo_total_bss, tasa_bs,
        estacion_servicio, observaciones, id_chofer, origen
    ) VALUES (
        p_id_vehiculo, p_fecha, p_tipo_combustible, p_metodo_calculo,
        p_kilometraje, p_nivel_tanque_antes, p_nivel_tanque_despues,
        p_litros, p_costo_por_litro, p_costo_total,
        COALESCE(p_costo_total_bss, p_costo_total * p_tasa_bs), p_tasa_bs,
        p_estacion_servicio, p_observaciones, v_final_chofer, v_final_origen
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
    p_costo_total_bss numeric DEFAULT 0,
    p_tasa_bs numeric DEFAULT 0,
    p_id_chofer uuid DEFAULT NULL,
    p_origen varchar DEFAULT 'STAFF'
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
        costo_total_bss = COALESCE(p_costo_total_bss, p_costo_total * p_tasa_bs),
        tasa_bs = p_tasa_bs,
        estacion_servicio = p_estacion_servicio,
        observaciones = p_observaciones,
        id_chofer = p_id_chofer,
        origen = p_origen
    WHERE id = p_id;
END;
$$;

-- obtener_cargas_combustible: misma firma, cuerpo con chofer/origen/tasa
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
            cc.tasa_bs,
            cc.estacion_servicio,
            cc.observaciones,
            cc.id_chofer,
            cc.origen,
            ch.nombre_completo AS nombre_chofer,
            cc.created_at
        FROM public.cargas_combustible cc
        LEFT JOIN public.vehiculos v ON v.id_vehiculo = cc.id_vehiculo
        LEFT JOIN public.usuarios ch ON ch.id_usuario = cc.id_chofer
        WHERE (p_id_vehiculo IS NULL OR cc.id_vehiculo = p_id_vehiculo)
          AND (p_desde IS NULL OR cc.fecha >= p_desde)
          AND (p_hasta IS NULL OR cc.fecha <= p_hasta)
    ) c;

    RETURN v_resultado;
END;
$$;

-- ============================================================
-- 4) Nuevo RPC: registro de carga por el chofer
-- ============================================================
CREATE OR REPLACE FUNCTION public.registrar_carga_combustible_chofer(
    p_id_vehiculo uuid,
    p_tipo_combustible varchar DEFAULT 'GASOLINA_95',
    p_metodo_calculo varchar DEFAULT 'TANQUE',
    p_kilometraje numeric DEFAULT NULL,
    p_litros numeric DEFAULT NULL,
    p_costo_por_litro numeric DEFAULT NULL,
    p_tasa_bs numeric DEFAULT 0
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id uuid;
    v_rol text;
BEGIN
    SELECT COALESCE(LOWER(r.nombre_rol), '') INTO v_rol
    FROM public.usuarios u
    LEFT JOIN public.roles r ON r.id_rol = u.id_rol
    WHERE u.id_usuario = auth.uid();

    IF v_rol <> 'chofer' THEN
        RAISE EXCEPTION 'Solo el chofer puede registrar su carga de combustible' USING ERRCODE = 'P0001';
    END IF;

    -- El vehículo debe pertenecer al chofer (vía sus guías asignadas).
    IF NOT EXISTS (
        SELECT 1 FROM public.guias_carga g
        WHERE g.id_chofer = auth.uid() AND g.id_vehiculo = p_id_vehiculo
    ) THEN
        RAISE EXCEPTION 'El vehículo no está asignado a este chofer' USING ERRCODE = 'P0001';
    END IF;

    INSERT INTO public.cargas_combustible (
        id_vehiculo, fecha, tipo_combustible, metodo_calculo,
        kilometraje, litros, costo_por_litro, costo_total,
        costo_total_bss, tasa_bs, id_chofer, origen
    ) VALUES (
        p_id_vehiculo, CURRENT_DATE, p_tipo_combustible, p_metodo_calculo,
        p_kilometraje, p_litros, p_costo_por_litro,
        p_litros * p_costo_por_litro,
        (p_litros * p_costo_por_litro) * p_tasa_bs,
        p_tasa_bs, auth.uid(), 'CHOFER'
    )
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

-- ============================================================
-- 5) Grants
-- ============================================================
REVOKE ALL ON FUNCTION public.crear_carga_combustible(uuid, date, varchar, varchar, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text, text, uuid, varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crear_carga_combustible(uuid, date, varchar, varchar, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text, text, uuid, varchar) TO authenticated;
REVOKE ALL ON FUNCTION public.actualizar_carga_combustible(uuid, uuid, date, varchar, varchar, numeric, numeric, numeric, numeric, numeric, numeric, text, text, numeric, numeric, uuid, varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.actualizar_carga_combustible(uuid, uuid, date, varchar, varchar, numeric, numeric, numeric, numeric, numeric, numeric, text, text, numeric, numeric, uuid, varchar) TO authenticated;
REVOKE ALL ON FUNCTION public.obtener_cargas_combustible(uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.obtener_cargas_combustible(uuid, date, date) TO authenticated;
REVOKE ALL ON FUNCTION public.registrar_carga_combustible_chofer(uuid, varchar, varchar, numeric, numeric, numeric, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_carga_combustible_chofer(uuid, varchar, varchar, numeric, numeric, numeric, numeric) TO authenticated;
