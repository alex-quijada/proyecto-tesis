-- Supabase Vehicle Upload SQL
-- Generated on 2026-07-04

-- Determine realistic values for all other fields
-- Based on typical vehicle data and Supabase vehicles table structure

-- First, check what reference data exists
-- (This would be run in the Supabase interface or psql)

-- Insert 3 truck records as requested:

-- 1. [A98AE3I] MITSUBISHI CANTER - 3500.0kg
-- - placa: A98AE3I
-- - marca: MITSUBISHI
-- - modelo: CANTER
-- - pesoMaximo: 3500.0
-- - Additional realistic fields:
--   - anio: 2020 (modern truck)
--   - tipo: 'CAMION' (from tipos_vehiculos catalog)
--   - capacidadPallets: 20 (standard truck capacity)
--   - tipoCaja: 'PLATAFORMA' (standard cargo box)
--   - estado: 'OPERATIVO' (from estados_vehiculos catalog)

INSERT INTO public.vehiculos 
(
    placa, marca, modelo, anio,
    id_tipo_vehiculo, id_tipo_caja, id_estado_vehiculo,
    capacidad_pallets, peso_maximo
)
SELECT 
    'A98AE3I', 
    'MITSUBISHI',
    'CANTER',
    2020,
    tv.id_tipo_vehiculo,
    tc.id_tipo_caja,
    ev.id_estado_vehiculo,
    20,
    3500.0
FROM public.tipos_vehiculos tv
JOIN public.tipos_cajas tc ON tc.nombre_caja = 'PLATAFORMA'
JOIN public.estados_vehiculos ev ON ev.nombre_estado = 'OPERATIVO'
WHERE tv.nombre_tipo = 'CAMION'
ON CONFLICT (placa) DO NOTHING;

-- 2. [AA260XA] MERCEDES BENZ - 0kg
-- - placa: AA260XA
-- - marca: MERCEDES BENZ
-- - modelo: UNKNOWN - fill this with a realistic model (like "ACTROS" or "Atego")
-- - pesoMaximo: 0.0 (this seems like an empty truck)
-- - Additional realistic fields:
--   - anio: 2019
--   - tipo: 'CAMION'
--   - capacidadPallets: 10
--   - tipoCaja: 'ARTICULADO' (articulated truck)
--   - estado: 'OPERATIVO'

INSERT INTO public.vehiculos 
(
    placa, marca, modelo, anio,
    id_tipo_vehiculo, id_tipo_caja, id_estado_vehiculo,
    capacidad_pallets, peso_maximo
)
SELECT 
    'AA260XA',
    'MERCEDES BENZ',
    'ACTROS',
    2019,
    tv.id_tipo_vehiculo,
    tc.id_tipo_caja,
    ev.id_estado_vehiculo,
    10,
    0.0
FROM public.tipos_vehiculos tv
JOIN public.tipos_cajas tc ON tc.nombre_caja = 'ARTICULADO'
JOIN public.estados_vehiculos ev ON ev.nombre_estado = 'OPERATIVO'
WHERE tv.nombre_tipo = 'CAMION'
ON CONFLICT (placa) DO NOTHING;

-- 3. [A48AR2B] FORD CARGO 9000.0kg
-- - placa: A48AR2B
-- - marca: FORD
-- - modelo: CARGO 1721
-- - pesoMaximo: 9000.0
-- - Additional realistic fields:
--   - anio: 2018
--   - tipo: 'CAMION'
--   - capacidadPallets: 30 (heavy-duty truck)
--   - tipoCaja: 'REFRIGERADO' (refrigerated truck)
--   - estado: 'OPERATIVO'

INSERT INTO public.vehiculos 
(
    placa, marca, modelo, anio,
    id_tipo_vehiculo, id_tipo_caja, id_estado_vehiculo,
    capacidad_pallets, peso_maximo
)
SELECT 
    'A48AR2B',
    'FORD',
    'CARGO 1721',
    2018,
    tv.id_tipo_vehiculo,
    tc.id_tipo_caja,
    ev.id_estado_vehiculo,
    30,
    9000.0
FROM public.tipos_vehiculos tv
JOIN public.tipos_cajas tc ON tc.nombre_caja = 'REFRIGERADO'
JOIN public.estados_vehiculos ev ON ev.nombre_estado = 'OPERATIVO'
WHERE tv.nombre_tipo = 'CAMION'
ON CONFLICT (placa) DO NOTHING;

-- Verify inserts
SELECT v.placa, v.marca, v.modelo, v.anio, tv.nombre_tipo as tipo, 
       tc.nombre_caja as tipo_caja, v.capacidad_pallets, v.peso_maximo, ev.nombre_estado as estado
FROM public.vehiculos v
JOIN public.tipos_vehiculos tv ON v.id_tipo_vehiculo = tv.id_tipo_vehiculo
JOIN public.tipos_cajas tc ON v.id_tipo_caja = tc.id_tipo_caja
JOIN public.estados_vehiculos ev ON v.id_estado_vehiculo = ev.id_estado_vehiculo
ORDER BY v.placa;
