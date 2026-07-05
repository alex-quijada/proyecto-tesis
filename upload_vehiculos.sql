-- SQL file to upload truck data to Supabase vehicles table
-- Format: Based on the existing vehicles table schema from 00003_vehiculos_mgmt.sql

-- First, let's check what catalog data exists
SELECT 'tipos_vehiculos:' as table_name, COUNT(*) as count FROM tipos_vehiculos UNION
SELECT 'tipos_cajas:' as table_name, COUNT(*) FROM tipos_cajas UNION
SELECT 'estados_vehiculos:' as table_name, COUNT(*) FROM estados_vehiculos;

-- Get catalog IDs for joining
SELECT tv.nombre_tipo, tv.id_tipo_vehiculo FROM tipos_vehiculos tv ORDER BY tv.nombre_tipo;
SELECT tc.nombre_caja, tc.id_tipo_caja FROM tipos_cajas tc ORDER BY tc.nombre_caja;
SELECT ev.nombre_estado, ev.id_estado_vehiculo FROM estados_vehiculos ev ORDER BY ev.nombre_estado;

-- Insert truck data with ON CONFLICT to prevent duplicates

-- 1. MITSUBISHI CANTER (A98AE3I) - 3500.0kg
WITH
    cat1 AS (SELECT id_tipo_vehiculo FROM tipos_vehiculos WHERE nombre_tipo = 'CAMION'),
    cat2 AS (SELECT id_tipo_caja FROM tipos_cajas WHERE nombre_caja = 'PLATAFORMA'),
    cat3 AS (SELECT id_estado_vehiculo FROM estados_vehiculos WHERE nombre_estado = 'OPERATIVO')
INSERT INTO public.vehiculos (
    placa,
    marca,
    modelo,
    anio,
    id_tipo_vehiculo,
    id_tipo_caja,
    capacidad_pallets,
    peso_maximo,
    id_estado_vehiculo,
    imagen_url
)
SELECT
    UPPER('A98AE3I'),
    'MITSUBISHI',
    'CANTER',
    2020,
    cat1.id_tipo_vehiculo,
    cat2.id_tipo_caja,
    20,
    3500.0,
    cat3.id_estado_vehiculo,
    NULL
FROM cat1, cat2, cat3
ON CONFLICT (placa) DO NOTHING;

-- 2. MERCEDES BENZ (AA260XA) - 0kg (modelo realistic: Sprinter)
WITH
    cat1 AS (SELECT id_tipo_vehiculo FROM tipos_vehiculos WHERE nombre_tipo = 'CAMION'),
    cat2 AS (SELECT id_tipo_caja FROM tipos_cajas WHERE nombre_caja = 'ARTICULADO'),
    cat3 AS (SELECT id_estado_vehiculo FROM estados_vehiculos WHERE nombre_estado = 'INACTIVO')
INSERT INTO public.vehiculos (
    placa,
    marca,
    modelo,
    anio,
    id_tipo_vehiculo,
    id_tipo_caja,
    capacidad_pallets,
    peso_maximo,
    id_estado_vehiculo,
    imagen_url
)
SELECT
    UPPER('AA260XA'),
    'MERCEDES BENZ',
    'SPRINTER',
    2019,
    cat1.id_tipo_vehiculo,
    cat2.id_tipo_caja,
    10,
    0.0,
    cat3.id_estado_vehiculo,
    NULL
FROM cat1, cat2, cat3
ON CONFLICT (placa) DO NOTHING;

-- 3. FORD CARGO 1721 (A48AR2B) - 9000.0kg
WITH
    cat1 AS (SELECT id_tipo_vehiculo FROM tipos_vehiculos WHERE nombre_tipo = 'CAMION'),
    cat2 AS (SELECT id_tipo_caja FROM tipos_cajas WHERE nombre_caja = 'REFRIGERADO'),
    cat3 AS (SELECT id_estado_vehiculo FROM estados_vehiculos WHERE nombre_estado = 'OPERATIVO')
INSERT INTO public.vehiculos (
    placa,
    marca,
    modelo,
    anio,
    id_tipo_vehiculo,
    id_tipo_caja,
    capacidad_pallets,
    peso_maximo,
    id_estado_vehiculo,
    imagen_url
)
SELECT
    UPPER('A48AR2B'),
    'FORD',
    'CARGO 1721',
    2018,
    cat1.id_tipo_vehiculo,
    cat2.id_tipo_caja,
    30,
    9000.0,
    cat3.id_estado_vehiculo,
    NULL
FROM cat1, cat2, cat3
ON CONFLICT (placa) DO NOTHING;

-- Verify the data was inserted
SELECT v.id_vehiculo, v.placa, v.marca, v.modelo, v.anio, 
       tv.nombre_tipo as tipo, tc.nombre_caja as caja,
       v.capacidad_pallets, v.peso_maximo, ev.nombre_estado as estado
FROM public.vehiculos v
JOIN tipos_vehiculos tv ON v.id_tipo_vehiculo = tv.id_tipo_vehiculo
JOIN tipos_cajas tc ON v.id_tipo_caja = tc.id_tipo_caja
JOIN estados_vehiculos ev ON v.id_estado_vehiculo = ev.id_estado_vehiculo
ORDER BY v.placa;
