-- ============================================================
-- 00082: Tablas de gastos reales — combustible y mantenimiento.
--
-- Crea las tablas cargas_combustible y mantenimientos (hoy solo
-- existían como mock en el frontend). RLS: solo personal interno
-- (Administrador/Analista/Coordinador) puede leer/escribir.
-- RPCs CRUD SECURITY DEFINER con validación de rol (patrón 00045).
--
-- Seed: SOLO 2 ejemplos por tabla, referenciando vehículos reales
-- ya registrados en public.vehiculos (subconsulta, sin datos
-- inventados). Si no hay vehículos, no inserta nada.
-- ============================================================

-- ============================================================
-- Helper: validación de rol de personal interno (reutilizable
-- por los RPCs CRUD de gastos).
-- ============================================================
CREATE OR REPLACE FUNCTION public.es_personal_interno()
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_rol text;
BEGIN
    SELECT COALESCE(LOWER(r.nombre_rol), '') INTO v_rol
    FROM public.usuarios u
    LEFT JOIN public.roles r ON r.id_rol = u.id_rol
    WHERE u.id_usuario = auth.uid();

    RETURN v_rol IN ('administrador', 'coordinador', 'analista');
END;
$$;

-- ============================================================
-- 1) Tabla cargas_combustible
-- ============================================================
CREATE TABLE IF NOT EXISTS public.cargas_combustible (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    id_vehiculo uuid NOT NULL REFERENCES public.vehiculos(id_vehiculo) ON DELETE CASCADE,
    fecha date NOT NULL DEFAULT CURRENT_DATE,
    tipo_combustible varchar(30) NOT NULL DEFAULT 'DIESEL'
        CHECK (tipo_combustible IN ('GASOLINA_95', 'GASOLINA_91', 'DIESEL')),
    metodo_calculo varchar(20) NOT NULL DEFAULT 'TANQUE'
        CHECK (metodo_calculo IN ('TANQUE', 'ODOMETRO', 'GPS')),
    kilometraje numeric(10,2),
    nivel_tanque_antes numeric(5,2),
    nivel_tanque_despues numeric(5,2),
    litros numeric(10,2) NOT NULL,
    costo_por_litro numeric(12,4) NOT NULL,
    costo_total numeric(12,2) NOT NULL,
    estacion_servicio text,
    observaciones text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cargas_combustible_vehiculo
    ON public.cargas_combustible (id_vehiculo, fecha DESC);

ALTER TABLE public.cargas_combustible ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cargas_combustible_staff_all"
    ON public.cargas_combustible
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.usuarios u
            JOIN public.roles r ON r.id_rol = u.id_rol
            WHERE u.id_usuario = auth.uid()
              AND LOWER(r.nombre_rol) IN ('administrador', 'coordinador', 'analista')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.usuarios u
            JOIN public.roles r ON r.id_rol = u.id_rol
            WHERE u.id_usuario = auth.uid()
              AND LOWER(r.nombre_rol) IN ('administrador', 'coordinador', 'analista')
        )
    );

-- ============================================================
-- 2) Tabla mantenimientos
-- ============================================================
CREATE TABLE IF NOT EXISTS public.mantenimientos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    id_vehiculo uuid NOT NULL REFERENCES public.vehiculos(id_vehiculo) ON DELETE CASCADE,
    tipo varchar(20) NOT NULL DEFAULT 'PREVENTIVO'
        CHECK (tipo IN ('PREVENTIVO', 'CORRECTIVO')),
    fecha_programada date,
    fecha_realizado date,
    kilometraje numeric(10,2),
    descripcion text,
    responsable text,
    costo numeric(12,2) NOT NULL DEFAULT 0,
    proximo_km numeric(10,2),
    proxima_fecha date,
    estado varchar(20) NOT NULL DEFAULT 'PROGRAMADO'
        CHECK (estado IN ('PROGRAMADO', 'EN_PROCESO', 'REALIZADO', 'CANCELADO')),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mantenimientos_vehiculo
    ON public.mantenimientos (id_vehiculo, fecha_programada DESC);

ALTER TABLE public.mantenimientos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mantenimientos_staff_all"
    ON public.mantenimientos
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.usuarios u
            JOIN public.roles r ON r.id_rol = u.id_rol
            WHERE u.id_usuario = auth.uid()
              AND LOWER(r.nombre_rol) IN ('administrador', 'coordinador', 'analista')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.usuarios u
            JOIN public.roles r ON r.id_rol = u.id_rol
            WHERE u.id_usuario = auth.uid()
              AND LOWER(r.nombre_rol) IN ('administrador', 'coordinador', 'analista')
        )
    );

-- ============================================================
-- 3) RPCs CRUD — cargas_combustible
-- ============================================================
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
        litros, costo_por_litro, costo_total,
        estacion_servicio, observaciones
    ) VALUES (
        p_id_vehiculo, p_fecha, p_tipo_combustible, p_metodo_calculo,
        p_kilometraje, p_nivel_tanque_antes, p_nivel_tanque_despues,
        p_litros, p_costo_por_litro, p_costo_total,
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
    p_observaciones text
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
        estacion_servicio = p_estacion_servicio,
        observaciones = p_observaciones
    WHERE id = p_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.eliminar_carga_combustible(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.es_personal_interno() THEN
        RAISE EXCEPTION 'No tienes permiso para eliminar cargas de combustible' USING ERRCODE = 'P0001';
    END IF;

    DELETE FROM public.cargas_combustible WHERE id = p_id;
END;
$$;

-- ============================================================
-- 4) RPCs CRUD — mantenimientos
-- ============================================================
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

CREATE OR REPLACE FUNCTION public.crear_mantenimiento(
    p_id_vehiculo uuid,
    p_tipo varchar,
    p_fecha_programada date,
    p_fecha_realizado date DEFAULT NULL,
    p_kilometraje numeric DEFAULT NULL,
    p_descripcion text DEFAULT NULL,
    p_responsable text DEFAULT NULL,
    p_costo numeric DEFAULT 0,
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
        kilometraje, descripcion, responsable, costo,
        proximo_km, proxima_fecha, estado
    ) VALUES (
        p_id_vehiculo, p_tipo, p_fecha_programada, p_fecha_realizado,
        p_kilometraje, p_descripcion, p_responsable, p_costo,
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
    p_estado varchar
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
        proximo_km = p_proximo_km,
        proxima_fecha = p_proxima_fecha,
        estado = p_estado
    WHERE id = p_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.eliminar_mantenimiento(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.es_personal_interno() THEN
        RAISE EXCEPTION 'No tienes permiso para eliminar mantenimientos' USING ERRCODE = 'P0001';
    END IF;

    DELETE FROM public.mantenimientos WHERE id = p_id;
END;
$$;

-- ============================================================
-- 5) Seed — SOLO 2 ejemplos por tabla con vehículos reales.
--    Sin datos inventados: toma los primeros 2 vehículos
--    registrados en public.vehiculos. Si no hay, no inserta.
-- ============================================================
INSERT INTO public.cargas_combustible (
    id_vehiculo, fecha, tipo_combustible, metodo_calculo,
    kilometraje, nivel_tanque_antes, nivel_tanque_despues,
    litros, costo_por_litro, costo_total, estacion_servicio
)
SELECT
    v.id_vehiculo,
    CURRENT_DATE,
    'DIESEL',
    'TANQUE',
    0,
    0.25,
    1,
    100,
    0.5,
    50,
    'Estación de servicio (ejemplo)'
FROM public.vehiculos v
WHERE v.id_vehiculo IN (
    SELECT id_vehiculo FROM public.vehiculos ORDER BY placa LIMIT 2
)
AND NOT EXISTS (SELECT 1 FROM public.cargas_combustible)
ON CONFLICT DO NOTHING;

INSERT INTO public.mantenimientos (
    id_vehiculo, tipo, fecha_programada, fecha_realizado,
    kilometraje, descripcion, responsable, costo,
    proximo_km, estado
)
SELECT
    v.id_vehiculo,
    'PREVENTIVO',
    CURRENT_DATE,
    CURRENT_DATE,
    0,
    'Mantenimiento preventivo (ejemplo)',
    'Taller',
    100,
    5000,
    'REALIZADO'
FROM public.vehiculos v
WHERE v.id_vehiculo IN (
    SELECT id_vehiculo FROM public.vehiculos ORDER BY placa LIMIT 2
)
AND NOT EXISTS (SELECT 1 FROM public.mantenimientos)
ON CONFLICT DO NOTHING;

-- ============================================================
-- Grants
-- ============================================================
REVOKE ALL ON FUNCTION public.obtener_cargas_combustible(uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.obtener_cargas_combustible(uuid, date, date) TO authenticated;
REVOKE ALL ON FUNCTION public.crear_carga_combustible(uuid, date, varchar, varchar, numeric, numeric, numeric, numeric, numeric, numeric, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crear_carga_combustible(uuid, date, varchar, varchar, numeric, numeric, numeric, numeric, numeric, numeric, text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.actualizar_carga_combustible(uuid, uuid, date, varchar, varchar, numeric, numeric, numeric, numeric, numeric, numeric, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.actualizar_carga_combustible(uuid, uuid, date, varchar, varchar, numeric, numeric, numeric, numeric, numeric, numeric, text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.eliminar_carga_combustible(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.eliminar_carga_combustible(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.obtener_mantenimientos(uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.obtener_mantenimientos(uuid, date, date) TO authenticated;
REVOKE ALL ON FUNCTION public.crear_mantenimiento(uuid, varchar, date, date, numeric, text, text, numeric, numeric, date, varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crear_mantenimiento(uuid, varchar, date, date, numeric, text, text, numeric, numeric, date, varchar) TO authenticated;
REVOKE ALL ON FUNCTION public.actualizar_mantenimiento(uuid, uuid, varchar, date, date, numeric, text, text, numeric, numeric, date, varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.actualizar_mantenimiento(uuid, uuid, varchar, date, date, numeric, text, text, numeric, numeric, date, varchar) TO authenticated;
REVOKE ALL ON FUNCTION public.eliminar_mantenimiento(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.eliminar_mantenimiento(uuid) TO authenticated;