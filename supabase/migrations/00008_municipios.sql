-- ==========================================
-- Catálogo de municipios de Nueva Esparta
-- ==========================================

DROP TABLE IF EXISTS public.municipios CASCADE;

CREATE TABLE public.municipios (
    id_municipio uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre character varying(100) NOT NULL UNIQUE,
    capital character varying(100) NOT NULL
);

INSERT INTO public.municipios (nombre, capital) VALUES
    ('Antolín del Campo', 'Paraguachí'),
    ('Arismendi', 'La Asunción'),
    ('Díaz', 'San Juan Bautista'),
    ('García', 'El Valle del Espíritu Santo'),
    ('Gómez', 'Santa Ana'),
    ('Maneiro', 'Pampatar'),
    ('Marcano', 'Juan Griego'),
    ('Mariño', 'Porlamar'),
    ('Península de Macanao', 'Boca de Río'),
    ('Tubores', 'Punta de Piedras'),
    ('Villalba', 'San Pedro de Coche')
ON CONFLICT (nombre) DO NOTHING;

-- ==========================================
-- Agregar FK de municipio a ubicaciones
-- ==========================================
ALTER TABLE public.ubicaciones
    ADD COLUMN IF NOT EXISTS id_municipio uuid REFERENCES public.municipios(id_municipio) ON DELETE RESTRICT;

UPDATE public.ubicaciones u
SET id_municipio = m.id_municipio
FROM public.municipios m
WHERE u.municipio = m.nombre
  AND u.id_municipio IS NULL;

-- ==========================================
-- RLS
-- ==========================================
ALTER TABLE public.municipios ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'municipios_select_policy' AND tablename = 'municipios') THEN
        CREATE POLICY "municipios_select_policy" ON public.municipios FOR SELECT TO authenticated USING (true);
    END IF;
END $$;

-- ==========================================
-- RPC: Obtener municipios
-- ==========================================
CREATE OR REPLACE FUNCTION public.obtener_municipios()
RETURNS TABLE(
    id_municipio uuid,
    nombre character varying(100),
    capital character varying(100)
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
    SELECT id_municipio, nombre, capital
    FROM public.municipios
    ORDER BY nombre;
$$;

-- ==========================================
-- Actualizar RPC guardar_ubicaciones_cliente
-- para incluir id_municipio y nombre_contacto
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
        id_municipio,
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
        u.id_municipio::uuid,
        COALESCE(u.municipio, m.nombre),
        COALESCE(u.estado, 'Nueva Esparta'),
        COALESCE(u.pais, 'Venezuela'),
        u.referencia,
        u.nombre_sucursal,
        u.telefono_contacto
    FROM jsonb_to_recordset(p_ubicaciones) AS u(
        direccion text,
        id_municipio text,
        municipio character varying(100),
        estado character varying(100),
        pais character varying(100),
        referencia text,
        nombre_sucursal character varying(100),
        telefono_contacto character varying(20)
    )
    LEFT JOIN public.municipios m ON m.id_municipio = u.id_municipio::uuid;
END;
$$;

-- ==========================================
-- Actualizar RPC obtener_ubicaciones_cliente
-- para incluir id_municipio y nombre_sucursal
-- ==========================================
DROP FUNCTION IF EXISTS public.obtener_ubicaciones_cliente(uuid);
CREATE FUNCTION public.obtener_ubicaciones_cliente(p_id_cliente uuid)
RETURNS TABLE(
    id_ubicacion uuid,
    direccion_completa text,
    id_municipio uuid,
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
        u.id_municipio,
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
