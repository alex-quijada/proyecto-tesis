-- SQL file to check and upload truck data to Supabase vehicles table
-- Based on migration 00003_vehiculos_mgmt.sql

-- Check if tables exist and their structure
\d public.vehiculos;
\d public.tipos_vehiculos;
\d public.tipos_cajas;
\d public.estados_vehiculos;

-- Check catalog data
table tipos_vehiculos:
SELECT * FROM public.tipos_vehiculos ORDER BY nombre_tipo;

table tipos_cajas:
SELECT * FROM public.tipos_cajas ORDER BY nombre_caja;

table estados_vehiculos:
SELECT * FROM public.estados_vehiculos ORDER BY nombre_estado;

-- Insert truck data with ON CONFLICT to prevent duplicates

-- 1. MITSUBISHI CANTER (A98AE3I) - 3500.0kg
WITH cat1 AS (SELECT id_tipo_vehiculo FROM public.tipos_vehiculos WHERE nombre_tipo = 'CAMION'),
     cat2 AS (SELECT id_tipo_caja FROM public.tipos_cajas WHERE nombre_caja = 'PLATAFORMA'),
     cat3 AS (SELECT id_estado_vehiculo FROM public.estados_vehiculos WHERE nombre_estado = 'OPERATIVO')
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
WITH cat1 AS (SELECT id_tipo_vehiculo FROM public.tipos_vehiculos WHERE nombre_tipo = 'CAMION'),
     cat2 AS (SELECT id_tipo_caja FROM public.tipos_cajas WHERE nombre_caja = 'ARTICULADO'),
     cat3 AS (SELECT id_estado_vehiculo FROM public.estados_vehiculos WHERE nombre_estado = 'INACTIVO')
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
WITH cat1 AS (SELECT id_tipo_vehiculo FROM public.tipos_vehiculos WHERE nombre_tipo = 'CAMION'),
     cat2 AS (SELECT id_tipo_caja FROM public.tipos_cajas WHERE nombre_caja = 'REFRIGERADO'),
     cat3 AS (SELECT id_estado_vehiculo FROM public.estados_vehiculos WHERE nombre_estado = 'OPERATIVO')
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
JOIN public.tipos_vehiculos tv ON v.id_tipo_vehiculo = tv.id_tipo_vehiculo
JOIN public.tipos_cajas tc ON v.id_tipo_caja = tc.id_tipo_caja
JOIN public.estados_vehiculos ev ON v.id_estado_vehiculo = ev.id_estado_vehiculo
ORDER BY v.placa;
