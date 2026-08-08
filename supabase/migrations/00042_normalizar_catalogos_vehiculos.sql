-- ==========================================
-- 00042: Normalizar catálogos de vehículos
--
-- El remoto se creó manualmente con valores en minúsculas y un typo en
-- tipos_cajas ('refrijerado'). El seed local (00001) usa mayúsculas.
-- Se corrige el typo y se normaliza el casing de los 3 catálogos para
-- igualar el local. Los RPCs ya son case-insensitive (00005) y el FK de
-- vehiculos es por UUID, así que no hay pérdida de datos ni conflictos.
-- ==========================================

-- --- tipos_cajas: corregir typo + normalizar ---
UPDATE public.tipos_cajas SET nombre_caja = 'REFRIGERADO' WHERE LOWER(nombre_caja) = 'refrijerado';
UPDATE public.tipos_cajas SET nombre_caja = 'SECA' WHERE LOWER(nombre_caja) = 'seca';
UPDATE public.tipos_cajas SET nombre_caja = 'PLATAFORMA' WHERE LOWER(nombre_caja) = 'plataforma';
UPDATE public.tipos_cajas SET nombre_caja = 'ARTICULADO' WHERE LOWER(nombre_caja) = 'articulado';

-- --- tipos_vehiculos: normalizar ---
UPDATE public.tipos_vehiculos SET nombre_tipo = 'CARRO' WHERE LOWER(nombre_tipo) = 'carro';
UPDATE public.tipos_vehiculos SET nombre_tipo = 'MOTO' WHERE LOWER(nombre_tipo) = 'moto';
UPDATE public.tipos_vehiculos SET nombre_tipo = 'CAMION' WHERE LOWER(nombre_tipo) = 'camion';

-- --- estados_vehiculos: normalizar ---
UPDATE public.estados_vehiculos SET nombre_estado = 'OPERATIVO' WHERE LOWER(nombre_estado) = 'operativo';
UPDATE public.estados_vehiculos SET nombre_estado = 'MANTENIMIENTO' WHERE LOWER(nombre_estado) = 'mantenimiento';
UPDATE public.estados_vehiculos SET nombre_estado = 'INACTIVO' WHERE LOWER(nombre_estado) = 'inactivo';
