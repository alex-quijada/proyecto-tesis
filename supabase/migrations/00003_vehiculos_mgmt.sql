-- ==========================================
-- Agregar columna imagen_url a vehiculos
-- ==========================================
ALTER TABLE public.vehiculos ADD COLUMN IF NOT EXISTS imagen_url text;

-- ==========================================
-- Habilitar RLS en tablas de vehículos
-- ==========================================
ALTER TABLE public.vehiculos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tipos_vehiculos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tipos_cajas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estados_vehiculos ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- Políticas RLS para vehiculos
-- ==========================================
CREATE POLICY "Admin y Analista pueden SELECT vehiculos"
ON public.vehiculos FOR SELECT TO authenticated
USING (auth.jwt() ->> 'nombre_rol' IN ('Administrador', 'Analista'));

CREATE POLICY "Admin y Analista pueden INSERT vehiculos"
ON public.vehiculos FOR INSERT TO authenticated
WITH CHECK (auth.jwt() ->> 'nombre_rol' IN ('Administrador', 'Analista'));

CREATE POLICY "Admin y Analista pueden UPDATE vehiculos"
ON public.vehiculos FOR UPDATE TO authenticated
USING (auth.jwt() ->> 'nombre_rol' IN ('Administrador', 'Analista'))
WITH CHECK (auth.jwt() ->> 'nombre_rol' IN ('Administrador', 'Analista'));

CREATE POLICY "Admin y Analista pueden DELETE vehiculos"
ON public.vehiculos FOR DELETE TO authenticated
USING (auth.jwt() ->> 'nombre_rol' IN ('Administrador', 'Analista'));

-- ==========================================
-- Políticas RLS para tablas catálogo (SELECT público para autenticados)
-- ==========================================
CREATE POLICY "SELECT para autenticados en tipos_vehiculos"
ON public.tipos_vehiculos FOR SELECT TO authenticated
USING (true);

CREATE POLICY "SELECT para autenticados en tipos_cajas"
ON public.tipos_cajas FOR SELECT TO authenticated
USING (true);

CREATE POLICY "SELECT para autenticados en estados_vehiculos"
ON public.estados_vehiculos FOR SELECT TO authenticated
USING (true);

-- ==========================================
-- RPC: Obtener vehículos con nombres de catálogo
-- ==========================================
CREATE OR REPLACE FUNCTION public.obtener_vehiculos()
RETURNS TABLE(
    id_vehiculo uuid,
    placa varchar,
    marca varchar,
    modelo varchar,
    anio integer,
    tipo_nombre varchar,
    caja_nombre varchar,
    capacidad_pallets integer,
    peso_maximo numeric,
    estado_nombre varchar,
    imagen_url text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        v.id_vehiculo,
        v.placa::varchar,
        v.marca::varchar,
        v.modelo::varchar,
        v.anio,
        tv.nombre_tipo::varchar,
        tc.nombre_caja::varchar,
        v.capacidad_pallets,
        v.peso_maximo,
        ev.nombre_estado::varchar,
        v.imagen_url
    FROM public.vehiculos v
    JOIN public.tipos_vehiculos tv ON v.id_tipo_vehiculo = tv.id_tipo_vehiculo
    JOIN public.tipos_cajas tc ON v.id_tipo_caja = tc.id_tipo_caja
    JOIN public.estados_vehiculos ev ON v.id_estado_vehiculo = ev.id_estado_vehiculo
    ORDER BY v.placa;
END;
$$;

-- ==========================================
-- RPC: Obtener catálogos para dropdowns
-- ==========================================
CREATE OR REPLACE FUNCTION public.obtener_catalogos_vehiculos()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tipos json;
    v_cajas json;
    v_estados json;
BEGIN
    SELECT json_agg(json_build_object('label',
        CASE tv.nombre_tipo
            WHEN 'CARRO' THEN 'Automóvil'
            WHEN 'MOTO' THEN 'Motocicleta'
            WHEN 'CAMION' THEN 'Camión de Carga'
            ELSE tv.nombre_tipo
        END, 'value', tv.nombre_tipo) ORDER BY tv.nombre_tipo)
    INTO v_tipos
    FROM public.tipos_vehiculos tv;

    SELECT json_agg(json_build_object('label',
        CASE tc.nombre_caja
            WHEN 'SECA' THEN 'Caja Seca'
            WHEN 'PLATAFORMA' THEN 'Plataforma Abierta'
            WHEN 'REFRIGERADO' THEN 'Refrigerados'
            WHEN 'ARTICULADO' THEN 'Articulado'
            ELSE tc.nombre_caja
        END, 'value', tc.nombre_caja) ORDER BY tc.nombre_caja)
    INTO v_cajas
    FROM public.tipos_cajas tc;

    SELECT json_agg(json_build_object('label',
        CASE ev.nombre_estado
            WHEN 'OPERATIVO' THEN 'Operativo'
            WHEN 'MANTENIMIENTO' THEN 'En Mantenimiento'
            WHEN 'INACTIVO' THEN 'Inactivo'
            ELSE ev.nombre_estado
        END, 'value', ev.nombre_estado) ORDER BY ev.nombre_estado)
    INTO v_estados
    FROM public.estados_vehiculos ev;

    RETURN json_build_object(
        'tiposVehiculo', COALESCE(v_tipos, '[]'::json),
        'tiposCaja', COALESCE(v_cajas, '[]'::json),
        'estados', COALESCE(v_estados, '[]'::json)
    );
END;
$$;

-- ==========================================
-- RPC: Crear vehículo
-- ==========================================
CREATE OR REPLACE FUNCTION public.crear_vehiculo(
    p_placa varchar,
    p_marca varchar,
    p_modelo varchar,
    p_anio integer,
    p_tipo_nombre varchar,
    p_caja_nombre varchar,
    p_peso_maximo numeric,
    p_capacidad_pallets integer DEFAULT 0,
    p_estado_nombre varchar DEFAULT 'OPERATIVO',
    p_imagen_url text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id_vehiculo uuid;
    v_id_tipo_vehiculo uuid;
    v_id_tipo_caja uuid;
    v_id_estado_vehiculo uuid;
BEGIN
    SELECT id_tipo_vehiculo INTO v_id_tipo_vehiculo
    FROM public.tipos_vehiculos WHERE nombre_tipo = p_tipo_nombre;

    SELECT id_tipo_caja INTO v_id_tipo_caja
    FROM public.tipos_cajas WHERE nombre_caja = p_caja_nombre;

    SELECT id_estado_vehiculo INTO v_id_estado_vehiculo
    FROM public.estados_vehiculos WHERE nombre_estado = p_estado_nombre;

    INSERT INTO public.vehiculos (
        placa, marca, modelo, anio,
        id_tipo_vehiculo, id_tipo_caja,
        capacidad_pallets, peso_maximo,
        id_estado_vehiculo, imagen_url
    ) VALUES (
        UPPER(p_placa), p_marca, p_modelo, p_anio,
        v_id_tipo_vehiculo, v_id_tipo_caja,
        p_capacidad_pallets, p_peso_maximo,
        v_id_estado_vehiculo, p_imagen_url
    )
    RETURNING id_vehiculo INTO v_id_vehiculo;

    RETURN v_id_vehiculo;
END;
$$;

-- ==========================================
-- RPC: Actualizar vehículo
-- ==========================================
CREATE OR REPLACE FUNCTION public.actualizar_vehiculo(
    p_id_vehiculo uuid,
    p_placa varchar,
    p_marca varchar,
    p_modelo varchar,
    p_anio integer,
    p_tipo_nombre varchar,
    p_caja_nombre varchar,
    p_capacidad_pallets integer,
    p_peso_maximo numeric,
    p_estado_nombre varchar,
    p_imagen_url text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id_tipo_vehiculo uuid;
    v_id_tipo_caja uuid;
    v_id_estado_vehiculo uuid;
BEGIN
    SELECT id_tipo_vehiculo INTO v_id_tipo_vehiculo
    FROM public.tipos_vehiculos WHERE nombre_tipo = p_tipo_nombre;

    SELECT id_tipo_caja INTO v_id_tipo_caja
    FROM public.tipos_cajas WHERE nombre_caja = p_caja_nombre;

    SELECT id_estado_vehiculo INTO v_id_estado_vehiculo
    FROM public.estados_vehiculos WHERE nombre_estado = p_estado_nombre;

    UPDATE public.vehiculos SET
        placa = UPPER(p_placa),
        marca = p_marca,
        modelo = p_modelo,
        anio = p_anio,
        id_tipo_vehiculo = v_id_tipo_vehiculo,
        id_tipo_caja = v_id_tipo_caja,
        capacidad_pallets = p_capacidad_pallets,
        peso_maximo = p_peso_maximo,
        id_estado_vehiculo = v_id_estado_vehiculo,
        imagen_url = COALESCE(p_imagen_url, imagen_url)
    WHERE id_vehiculo = p_id_vehiculo;
END;
$$;

-- ==========================================
-- RPC: Eliminar vehículo
-- ==========================================
CREATE OR REPLACE FUNCTION public.eliminar_vehiculo(p_id_vehiculo uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    DELETE FROM public.vehiculos WHERE id_vehiculo = p_id_vehiculo;
END;
$$;

-- ==========================================
-- Storage bucket para imágenes de vehículos
-- ==========================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('vehiculos-imagenes', 'vehiculos-imagenes', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Autenticados pueden subir imagenes vehiculos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'vehiculos-imagenes' AND auth.jwt() ->> 'nombre_rol' IN ('Administrador', 'Analista'));

CREATE POLICY "Cualquiera puede leer imagenes vehiculos"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'vehiculos-imagenes');
