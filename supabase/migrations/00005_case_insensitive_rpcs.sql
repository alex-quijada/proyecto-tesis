-- ==========================================
-- Hacer RPCs de vehículos case-insensitive
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
    FROM public.tipos_vehiculos WHERE LOWER(nombre_tipo) = LOWER(p_tipo_nombre);

    SELECT id_tipo_caja INTO v_id_tipo_caja
    FROM public.tipos_cajas WHERE LOWER(nombre_caja) = LOWER(p_caja_nombre);

    SELECT id_estado_vehiculo INTO v_id_estado_vehiculo
    FROM public.estados_vehiculos WHERE LOWER(nombre_estado) = LOWER(p_estado_nombre);

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
    FROM public.tipos_vehiculos WHERE LOWER(nombre_tipo) = LOWER(p_tipo_nombre);

    SELECT id_tipo_caja INTO v_id_tipo_caja
    FROM public.tipos_cajas WHERE LOWER(nombre_caja) = LOWER(p_caja_nombre);

    SELECT id_estado_vehiculo INTO v_id_estado_vehiculo
    FROM public.estados_vehiculos WHERE LOWER(nombre_estado) = LOWER(p_estado_nombre);

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
        CASE LOWER(tv.nombre_tipo)
            WHEN 'carro' THEN 'Automóvil'
            WHEN 'moto' THEN 'Motocicleta'
            WHEN 'camion' THEN 'Camión de Carga'
            ELSE tv.nombre_tipo
        END, 'value', tv.nombre_tipo) ORDER BY tv.nombre_tipo)
    INTO v_tipos
    FROM public.tipos_vehiculos tv;

    SELECT json_agg(json_build_object('label',
        CASE LOWER(tc.nombre_caja)
            WHEN 'seca' THEN 'Caja Seca'
            WHEN 'plataforma' THEN 'Plataforma Abierta'
            WHEN 'refrigerado' THEN 'Refrigerados'
            WHEN 'articulado' THEN 'Articulado'
            ELSE tc.nombre_caja
        END, 'value', tc.nombre_caja) ORDER BY tc.nombre_caja)
    INTO v_cajas
    FROM public.tipos_cajas tc;

    SELECT json_agg(json_build_object('label',
        CASE LOWER(ev.nombre_estado)
            WHEN 'operativo' THEN 'Operativo'
            WHEN 'mantenimiento' THEN 'En Mantenimiento'
            WHEN 'inactivo' THEN 'Inactivo'
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
