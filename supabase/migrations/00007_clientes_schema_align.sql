-- ==========================================
-- Alinear esquema de clientes con el frontend
-- Agrega columnas faltantes, crea catálogos
-- normalizados, fusiona sucursales_cliente
-- en ubicaciones, elimina columnas que van
-- a otra tabla (latitud/longitud).
-- ==========================================

-- ==========================================
-- 1. CATÁLOGO: prefijos de documento (RIF)
-- ==========================================
CREATE TABLE IF NOT EXISTS public.prefijos_documento (
    id_prefijo uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    prefijo character varying(1) NOT NULL UNIQUE,
    descripcion character varying(50) NOT NULL
);

INSERT INTO public.prefijos_documento (prefijo, descripcion) VALUES
    ('V', 'Venezolano'),
    ('E', 'Extranjero'),
    ('J', 'Jurídico / Comercio'),
    ('P', 'Pasaporte'),
    ('G', 'Gobierno')
ON CONFLICT (prefijo) DO NOTHING;

-- ==========================================
-- 2. CLIENTES: columnas faltantes
-- ==========================================
ALTER TABLE public.clientes
    ADD COLUMN IF NOT EXISTS id_prefijo uuid REFERENCES public.prefijos_documento(id_prefijo) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS telefono character varying(20),
    ADD COLUMN IF NOT EXISTS persona_contacto character varying(150),
    ADD COLUMN IF NOT EXISTS reglas jsonb,
    ADD COLUMN IF NOT EXISTS rif text;

ALTER TABLE public.clientes
    ALTER COLUMN correo DROP NOT NULL;

ALTER TABLE public.clientes
    DROP CONSTRAINT IF EXISTS clientes_check;

-- ==========================================
-- 3. UBICACIONES: campos de sucursal + pais
--     y eliminar latitud/longitud/ciudad
-- ==========================================
ALTER TABLE public.ubicaciones
    ADD COLUMN IF NOT EXISTS pais character varying(100) DEFAULT 'Venezuela',
    ADD COLUMN IF NOT EXISTS nombre_sucursal character varying(100),
    ADD COLUMN IF NOT EXISTS telefono_contacto character varying(20);

ALTER TABLE public.ubicaciones
    DROP COLUMN IF EXISTS latitud,
    DROP COLUMN IF EXISTS longitud,
    DROP COLUMN IF EXISTS ciudad,
    DROP COLUMN IF EXISTS calle_avenida,
    DROP COLUMN IF EXISTS sector_urbanizacion,
    DROP COLUMN IF EXISTS codigo_postal;

-- ==========================================
-- 4. (saltado) MIGRAR sucursales_cliente
--    No existe en producción
-- ==========================================

-- ==========================================
-- 5. RLS POLICIES
-- ==========================================
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ubicaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prefijos_documento ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'clientes_select_policy' AND tablename = 'clientes') THEN
        CREATE POLICY "clientes_select_policy" ON public.clientes FOR SELECT TO authenticated USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'clientes_insert_policy' AND tablename = 'clientes') THEN
        CREATE POLICY "clientes_insert_policy" ON public.clientes FOR INSERT TO authenticated WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'clientes_update_policy' AND tablename = 'clientes') THEN
        CREATE POLICY "clientes_update_policy" ON public.clientes FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'clientes_delete_policy' AND tablename = 'clientes') THEN
        CREATE POLICY "clientes_delete_policy" ON public.clientes FOR DELETE TO authenticated USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'ubicaciones_select_policy' AND tablename = 'ubicaciones') THEN
        CREATE POLICY "ubicaciones_select_policy" ON public.ubicaciones FOR SELECT TO authenticated USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'ubicaciones_insert_policy' AND tablename = 'ubicaciones') THEN
        CREATE POLICY "ubicaciones_insert_policy" ON public.ubicaciones FOR INSERT TO authenticated WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'ubicaciones_update_policy' AND tablename = 'ubicaciones') THEN
        CREATE POLICY "ubicaciones_update_policy" ON public.ubicaciones FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'ubicaciones_delete_policy' AND tablename = 'ubicaciones') THEN
        CREATE POLICY "ubicaciones_delete_policy" ON public.ubicaciones FOR DELETE TO authenticated USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'prefijos_documento_select_policy' AND tablename = 'prefijos_documento') THEN
        CREATE POLICY "prefijos_documento_select_policy" ON public.prefijos_documento FOR SELECT TO authenticated USING (true);
    END IF;
END $$;

-- ==========================================
-- 6. RPC: Obtener todos los clientes
-- ==========================================
CREATE OR REPLACE FUNCTION public.obtener_clientes()
RETURNS TABLE(
    id_cliente uuid,
    nombre_comercial character varying(150),
    prefijo_documento character varying(1),
    rif_numero text,
    telefono character varying(20),
    correo text,
    persona_contacto character varying(150),
    reglas jsonb,
    id_prioridad uuid,
    nombre_prioridad character varying(50)
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
    SELECT
        c.id_cliente,
        c.nombre_comercial,
        pd.prefijo,
        c.rif,
        c.telefono,
        c.correo,
        c.persona_contacto,
        c.reglas,
        c.id_prioridad,
        pr.nombre_prioridad
    FROM public.clientes c
    JOIN public.prioridades_clientes pr ON pr.id_prioridad = c.id_prioridad
    LEFT JOIN public.prefijos_documento pd ON pd.id_prefijo = c.id_prefijo
    ORDER BY c.nombre_comercial;
$$;

-- ==========================================
-- 7. RPC: Obtener ubicaciones de un cliente
-- ==========================================
CREATE OR REPLACE FUNCTION public.obtener_ubicaciones_cliente(p_id_cliente uuid)
RETURNS TABLE(
    id_ubicacion uuid,
    direccion_completa text,
    municipio character varying(100),
    referencia text,
    pais character varying(100),
    estado_provincia character varying(100),
    nombre_sucursal character varying(100),
    telefono_contacto character varying(20)
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
    SELECT
        u.id_ubicacion,
        u.direccion_completa,
        u.municipio,
        u.referencia,
        u.pais,
        u.estado_provincia,
        u.nombre_sucursal,
        u.telefono_contacto
    FROM public.ubicaciones u
    WHERE u.id_cliente = p_id_cliente
    ORDER BY u.id_ubicacion;
$$;

-- ==========================================
-- 8. RPC: Listar prioridades de clientes
-- ==========================================
CREATE OR REPLACE FUNCTION public.obtener_prioridades_clientes()
RETURNS TABLE(
    id_prioridad uuid,
    nombre_prioridad character varying(50)
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
    SELECT id_prioridad, nombre_prioridad
    FROM public.prioridades_clientes
    ORDER BY nombre_prioridad;
$$;

-- ==========================================
-- 9. RPC: Listar prefijos de documento
-- ==========================================
CREATE OR REPLACE FUNCTION public.obtener_prefijos_documento()
RETURNS TABLE(
    id_prefijo uuid,
    prefijo character varying(1),
    descripcion character varying(50)
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
    SELECT id_prefijo, prefijo, descripcion
    FROM public.prefijos_documento
    ORDER BY prefijo;
$$;

-- ==========================================
-- 10. RPC: Crear cliente
-- ==========================================
CREATE OR REPLACE FUNCTION public.crear_cliente(
    p_id_prefijo uuid,
    p_rif_numero text,
    p_nombre_comercial character varying,
    p_telefono character varying,
    p_correo text,
    p_persona_contacto character varying,
    p_id_prioridad uuid,
    p_reglas jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
    v_id_cliente uuid;
BEGIN
    INSERT INTO public.clientes (
        id_prefijo,
        rif,
        nombre_comercial,
        telefono,
        correo,
        persona_contacto,
        id_prioridad,
        reglas
    ) VALUES (
        p_id_prefijo,
        p_rif_numero,
        p_nombre_comercial,
        p_telefono,
        p_correo,
        p_persona_contacto,
        p_id_prioridad,
        p_reglas
    )
    RETURNING id_cliente INTO v_id_cliente;

    RETURN v_id_cliente;
END;
$$;

-- ==========================================
-- 11. RPC: Actualizar cliente
-- ==========================================
CREATE OR REPLACE FUNCTION public.actualizar_cliente(
    p_id_cliente uuid,
    p_id_prefijo uuid,
    p_rif_numero text,
    p_nombre_comercial character varying,
    p_telefono character varying,
    p_correo text,
    p_persona_contacto character varying,
    p_id_prioridad uuid,
    p_reglas jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
    UPDATE public.clientes
    SET
        id_prefijo = p_id_prefijo,
        rif = p_rif_numero,
        nombre_comercial = p_nombre_comercial,
        telefono = p_telefono,
        correo = p_correo,
        persona_contacto = p_persona_contacto,
        id_prioridad = p_id_prioridad,
        reglas = p_reglas
    WHERE id_cliente = p_id_cliente;
END;
$$;

-- ==========================================
-- 12. RPC: Eliminar cliente
-- ==========================================
CREATE OR REPLACE FUNCTION public.eliminar_cliente(p_id_cliente uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
    DELETE FROM public.clientes WHERE id_cliente = p_id_cliente;
END;
$$;

-- ==========================================
-- 13. RPC: Guardar ubicaciones de un cliente
-- ==========================================
CREATE OR REPLACE FUNCTION public.guardar_ubicaciones_cliente(
    p_id_cliente uuid,
    p_ubicaciones jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
    DELETE FROM public.ubicaciones WHERE id_cliente = p_id_cliente;

    INSERT INTO public.ubicaciones (
        id_cliente,
        direccion_completa,
        municipio,
        estado_provincia,
        pais,
        referencia,
        nombre_sucursal,
        telefono_contacto
    )
    SELECT
        p_id_cliente,
        u.direccion,
        u.municipio,
        COALESCE(u.estado, 'Nueva Esparta'),
        COALESCE(u.pais, 'Venezuela'),
        u.referencia,
        u.nombre_sucursal,
        u.telefono_contacto
    FROM jsonb_to_recordset(p_ubicaciones) AS u(
        direccion text,
        municipio character varying(100),
        estado character varying(100),
        pais character varying(100),
        referencia text,
        nombre_sucursal character varying(100),
        telefono_contacto character varying(20)
    );
END;
$$;

-- ==========================================
-- 14. SEED: prioridades actualizadas
-- ==========================================
INSERT INTO public.prioridades_clientes (nombre_prioridad)
SELECT 'Alta'
WHERE NOT EXISTS (SELECT 1 FROM public.prioridades_clientes WHERE nombre_prioridad = 'Alta');

INSERT INTO public.prioridades_clientes (nombre_prioridad)
SELECT 'Media'
WHERE NOT EXISTS (SELECT 1 FROM public.prioridades_clientes WHERE nombre_prioridad = 'Media');

INSERT INTO public.prioridades_clientes (nombre_prioridad)
SELECT 'Baja'
WHERE NOT EXISTS (SELECT 1 FROM public.prioridades_clientes WHERE nombre_prioridad = 'Baja');
