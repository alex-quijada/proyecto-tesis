-- ==========================================
-- Add SELECT policies for sucursales_cliente and prioridades_clientes
-- Both tables have RLS enabled but lack any SELECT policies,
-- causing join queries in obtenerGuias() to return empty.
-- ==========================================

-- sucursales_cliente
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sucursales_cliente' AND policyname = 'sucursales_cliente_select_policy') THEN
        CREATE POLICY "sucursales_cliente_select_policy"
            ON public.sucursales_cliente
            FOR SELECT
            TO authenticated
            USING (true);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sucursales_cliente' AND policyname = 'sucursales_cliente_insert_policy') THEN
        CREATE POLICY "sucursales_cliente_insert_policy"
            ON public.sucursales_cliente
            FOR INSERT
            TO authenticated
            WITH CHECK (true);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sucursales_cliente' AND policyname = 'sucursales_cliente_update_policy') THEN
        CREATE POLICY "sucursales_cliente_update_policy"
            ON public.sucursales_cliente
            FOR UPDATE
            TO authenticated
            USING (true)
            WITH CHECK (true);
    END IF;
END $$;

-- prioridades_clientes
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'prioridades_clientes' AND policyname = 'prioridades_clientes_select_policy') THEN
        CREATE POLICY "prioridades_clientes_select_policy"
            ON public.prioridades_clientes
            FOR SELECT
            TO authenticated
            USING (true);
    END IF;
END $$;
