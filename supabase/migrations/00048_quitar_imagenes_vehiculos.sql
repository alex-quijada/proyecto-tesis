-- ==========================================
-- Eliminar imágenes de vehículos
-- Se quita la columna imagen_url, la lógica
-- en los RPCs y el bucket de storage.
-- ==========================================

-- 1) Dropear RPCs que referencian imagen_url (DROP antes de la columna)
DROP FUNCTION IF EXISTS public.obtener_vehiculos();
DROP FUNCTION IF EXISTS public.crear_vehiculo(varchar, varchar, varchar, integer, varchar, varchar, numeric, integer, varchar, text);
DROP FUNCTION IF EXISTS public.actualizar_vehiculo(uuid, varchar, varchar, varchar, integer, varchar, varchar, integer, numeric, varchar, text);

-- 2) Eliminar la columna
ALTER TABLE public.vehiculos DROP COLUMN IF EXISTS imagen_url;

-- 3) Recrear RPC: obtener_vehiculos sin imagen_url
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
    estado_nombre varchar
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
        ev.nombre_estado::varchar
    FROM public.vehiculos v
    JOIN public.tipos_vehiculos tv ON v.id_tipo_vehiculo = tv.id_tipo_vehiculo
    JOIN public.tipos_cajas tc ON v.id_tipo_caja = tc.id_tipo_caja
    JOIN public.estados_vehiculos ev ON v.id_estado_vehiculo = ev.id_estado_vehiculo
    ORDER BY v.placa;
END;
$$;

-- 4) Recrear RPC: crear_vehiculo sin p_imagen_url
CREATE OR REPLACE FUNCTION public.crear_vehiculo(
    p_placa varchar,
    p_marca varchar,
    p_modelo varchar,
    p_anio integer,
    p_tipo_nombre varchar,
    p_caja_nombre varchar,
    p_peso_maximo numeric,
    p_capacidad_pallets integer DEFAULT 0,
    p_estado_nombre varchar DEFAULT 'OPERATIVO'
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
        id_estado_vehiculo
    ) VALUES (
        UPPER(p_placa), p_marca, p_modelo, p_anio,
        v_id_tipo_vehiculo, v_id_tipo_caja,
        p_capacidad_pallets, p_peso_maximo,
        v_id_estado_vehiculo
    )
    RETURNING id_vehiculo INTO v_id_vehiculo;

    RETURN v_id_vehiculo;
END;
$$;

-- 5) Recrear RPC: actualizar_vehiculo sin p_imagen_url
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
    p_estado_nombre varchar
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
        id_estado_vehiculo = v_id_estado_vehiculo
    WHERE id_vehiculo = p_id_vehiculo;
END;
$$;

-- 6) Storage: eliminar objetos, políticas y bucket
-- Los triggers protect_delete checkean storage.allow_delete_query; se usa SET (sesión)
SET storage.allow_delete_query = 'true';
DELETE FROM storage.objects WHERE bucket_id = 'vehiculos-imagenes';
DROP POLICY IF EXISTS "Autenticados pueden subir imagenes vehiculos" ON storage.objects;
DROP POLICY IF EXISTS "Cualquiera puede leer imagenes vehiculos" ON storage.objects;
DELETE FROM storage.buckets WHERE id = 'vehiculos-imagenes';
RESET storage.allow_delete_query;
