-- ==========================================
-- 00038: Policies RLS de public.usuarios case-insensitive
--
-- Contexto: la migración 00033 normalizó los roles a PascalCase en
-- user_metadata ('Administrador') y en public.roles, pero las policies de
-- public.usuarios (creadas manualmente en el remoto) siguen comparando en
-- minúscula ('administrador'). Como resultado, un administrador ya no pasa
-- "Admins and Coordinators can view all" ni "Solo analistas y administradores
-- leen usuarios", y solo ve su propia fila vía "Users can view own data".
-- ==========================================

-- --- usuarios: SELECT ---
DROP POLICY IF EXISTS "Admins and Coordinators can view all" ON public.usuarios;
CREATE POLICY "Admins and Coordinators can view all"
    ON public.usuarios FOR SELECT TO authenticated
    USING (LOWER(COALESCE(get_user_role_name(), ''))
        = ANY (ARRAY['administrador'::text, 'coordinador'::text]));

DROP POLICY IF EXISTS "Solo analistas y administradores leen usuarios" ON public.usuarios;
CREATE POLICY "Solo analistas y administradores leen usuarios"
    ON public.usuarios FOR SELECT TO authenticated
    USING (LOWER(COALESCE(auth.jwt() ->> 'nombre_rol', auth.jwt() -> 'user_metadata' ->> 'nombre_rol'))
        = ANY (ARRAY['analista'::text, 'administrador'::text]));

-- "Users can view own data" se mantiene tal cual.

-- --- usuarios: INSERT / UPDATE / DELETE ---
DROP POLICY IF EXISTS "Admins can insert" ON public.usuarios;
CREATE POLICY "Admins can insert"
    ON public.usuarios FOR INSERT TO authenticated
    WITH CHECK (LOWER(get_user_role_name()) = 'administrador');

DROP POLICY IF EXISTS "Admins can update" ON public.usuarios;
CREATE POLICY "Admins can update"
    ON public.usuarios FOR UPDATE TO authenticated
    USING (LOWER(get_user_role_name()) = 'administrador');

DROP POLICY IF EXISTS "Admins can delete" ON public.usuarios;
CREATE POLICY "Admins can delete"
    ON public.usuarios FOR DELETE TO authenticated
    USING (LOWER(get_user_role_name()) = 'administrador');
