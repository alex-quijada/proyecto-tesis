-- Fix RLS policies for guias_carga and facturas
-- Previous policies used auth.jwt() ->> 'nombre_rol' but the claim may be nested under user_metadata.
-- This fix checks both locations.

-- =====================
-- guias_carga policies
-- =====================

DROP POLICY IF EXISTS "guias_carga_select_policy" ON public.guias_carga;
DROP POLICY IF EXISTS "guias_carga_insert_policy" ON public.guias_carga;
DROP POLICY IF EXISTS "guias_carga_update_policy" ON public.guias_carga;
DROP POLICY IF EXISTS "guias_carga_delete_policy" ON public.guias_carga;

CREATE POLICY "guias_carga_select_policy"
    ON public.guias_carga
    FOR SELECT
    TO authenticated
    USING (
        COALESCE(
            (auth.jwt() ->> 'nombre_rol'::text),
            (auth.jwt() -> 'user_metadata' ->> 'nombre_rol'::text)
        ) = ANY (ARRAY['Administrador'::text, 'Analista'::text, 'Coordinador'::text])
    );

CREATE POLICY "guias_carga_insert_policy"
    ON public.guias_carga
    FOR INSERT
    TO authenticated
    WITH CHECK (
        COALESCE(
            (auth.jwt() ->> 'nombre_rol'::text),
            (auth.jwt() -> 'user_metadata' ->> 'nombre_rol'::text)
        ) = ANY (ARRAY['Administrador'::text, 'Analista'::text])
    );

CREATE POLICY "guias_carga_update_policy"
    ON public.guias_carga
    FOR UPDATE
    TO authenticated
    USING (
        COALESCE(
            (auth.jwt() ->> 'nombre_rol'::text),
            (auth.jwt() -> 'user_metadata' ->> 'nombre_rol'::text)
        ) = ANY (ARRAY['Administrador'::text, 'Analista'::text])
    )
    WITH CHECK (
        COALESCE(
            (auth.jwt() ->> 'nombre_rol'::text),
            (auth.jwt() -> 'user_metadata' ->> 'nombre_rol'::text)
        ) = ANY (ARRAY['Administrador'::text, 'Analista'::text])
    );

CREATE POLICY "guias_carga_delete_policy"
    ON public.guias_carga
    FOR DELETE
    TO authenticated
    USING (
        COALESCE(
            (auth.jwt() ->> 'nombre_rol'::text),
            (auth.jwt() -> 'user_metadata' ->> 'nombre_rol'::text)
        ) = ANY (ARRAY['Administrador'::text, 'Analista'::text])
    );

-- =====================
-- facturas policies
-- =====================

DROP POLICY IF EXISTS "facturas_select_policy" ON public.facturas;
DROP POLICY IF EXISTS "facturas_insert_policy" ON public.facturas;
DROP POLICY IF EXISTS "facturas_update_policy" ON public.facturas;
DROP POLICY IF EXISTS "facturas_delete_policy" ON public.facturas;

CREATE POLICY "facturas_select_policy"
    ON public.facturas
    FOR SELECT
    TO authenticated
    USING (
        COALESCE(
            (auth.jwt() ->> 'nombre_rol'::text),
            (auth.jwt() -> 'user_metadata' ->> 'nombre_rol'::text)
        ) = ANY (ARRAY['Administrador'::text, 'Analista'::text, 'Coordinador'::text])
    );

CREATE POLICY "facturas_insert_policy"
    ON public.facturas
    FOR INSERT
    TO authenticated
    WITH CHECK (
        COALESCE(
            (auth.jwt() ->> 'nombre_rol'::text),
            (auth.jwt() -> 'user_metadata' ->> 'nombre_rol'::text)
        ) = ANY (ARRAY['Administrador'::text, 'Analista'::text])
    );

CREATE POLICY "facturas_update_policy"
    ON public.facturas
    FOR UPDATE
    TO authenticated
    USING (
        COALESCE(
            (auth.jwt() ->> 'nombre_rol'::text),
            (auth.jwt() -> 'user_metadata' ->> 'nombre_rol'::text)
        ) = ANY (ARRAY['Administrador'::text, 'Analista'::text])
    )
    WITH CHECK (
        COALESCE(
            (auth.jwt() ->> 'nombre_rol'::text),
            (auth.jwt() -> 'user_metadata' ->> 'nombre_rol'::text)
        ) = ANY (ARRAY['Administrador'::text, 'Analista'::text])
    );

CREATE POLICY "facturas_delete_policy"
    ON public.facturas
    FOR DELETE
    TO authenticated
    USING (
        COALESCE(
            (auth.jwt() ->> 'nombre_rol'::text),
            (auth.jwt() -> 'user_metadata' ->> 'nombre_rol'::text)
        ) = ANY (ARRAY['Administrador'::text, 'Analista'::text])
    );
