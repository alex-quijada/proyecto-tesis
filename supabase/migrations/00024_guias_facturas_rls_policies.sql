-- ==========================================
-- RLS Policies for guias_carga and facturas
-- ==========================================

-- Enable RLS (already enabled in backup, idempotent)
ALTER TABLE IF EXISTS public.guias_carga ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.facturas ENABLE ROW LEVEL SECURITY;

-- =====================
-- guias_carga policies
-- =====================

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'guias_carga' AND policyname = 'guias_carga_select_policy') THEN
        CREATE POLICY "guias_carga_select_policy"
            ON public.guias_carga
            FOR SELECT
            TO authenticated
            USING (
                (auth.jwt() ->> 'nombre_rol') = ANY (ARRAY['Administrador', 'Analista', 'Coordinador'])
            );
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'guias_carga' AND policyname = 'guias_carga_insert_policy') THEN
        CREATE POLICY "guias_carga_insert_policy"
            ON public.guias_carga
            FOR INSERT
            TO authenticated
            WITH CHECK (
                (auth.jwt() ->> 'nombre_rol') = ANY (ARRAY['Administrador', 'Analista'])
            );
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'guias_carga' AND policyname = 'guias_carga_update_policy') THEN
        CREATE POLICY "guias_carga_update_policy"
            ON public.guias_carga
            FOR UPDATE
            TO authenticated
            USING (
                (auth.jwt() ->> 'nombre_rol') = ANY (ARRAY['Administrador', 'Analista'])
            )
            WITH CHECK (
                (auth.jwt() ->> 'nombre_rol') = ANY (ARRAY['Administrador', 'Analista'])
            );
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'guias_carga' AND policyname = 'guias_carga_delete_policy') THEN
        CREATE POLICY "guias_carga_delete_policy"
            ON public.guias_carga
            FOR DELETE
            TO authenticated
            USING (
                (auth.jwt() ->> 'nombre_rol') = ANY (ARRAY['Administrador', 'Analista'])
            );
    END IF;
END $$;

-- =====================
-- facturas policies
-- =====================

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'facturas' AND policyname = 'facturas_select_policy') THEN
        CREATE POLICY "facturas_select_policy"
            ON public.facturas
            FOR SELECT
            TO authenticated
            USING (
                (auth.jwt() ->> 'nombre_rol') = ANY (ARRAY['Administrador', 'Analista', 'Coordinador'])
            );
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'facturas' AND policyname = 'facturas_insert_policy') THEN
        CREATE POLICY "facturas_insert_policy"
            ON public.facturas
            FOR INSERT
            TO authenticated
            WITH CHECK (
                (auth.jwt() ->> 'nombre_rol') = ANY (ARRAY['Administrador', 'Analista'])
            );
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'facturas' AND policyname = 'facturas_update_policy') THEN
        CREATE POLICY "facturas_update_policy"
            ON public.facturas
            FOR UPDATE
            TO authenticated
            USING (
                (auth.jwt() ->> 'nombre_rol') = ANY (ARRAY['Administrador', 'Analista'])
            )
            WITH CHECK (
                (auth.jwt() ->> 'nombre_rol') = ANY (ARRAY['Administrador', 'Analista'])
            );
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'facturas' AND policyname = 'facturas_delete_policy') THEN
        CREATE POLICY "facturas_delete_policy"
            ON public.facturas
            FOR DELETE
            TO authenticated
            USING (
                (auth.jwt() ->> 'nombre_rol') = ANY (ARRAY['Administrador', 'Analista'])
            );
    END IF;
END $$;

-- ==========================================
-- Table-level grants for authenticated role
-- ==========================================
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.guias_carga TO authenticated;
-- facturas already has ALL granted to authenticated (from backup)
