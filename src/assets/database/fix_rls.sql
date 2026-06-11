-- ==========================================
-- DIAGNÓSTICO: Ver políticas actuales
-- ==========================================
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE schemaname = 'public' AND tablename IN ('usuarios', 'roles')
ORDER BY tablename, policyname;

-- ==========================================
-- ELIMINAR TODAS LAS POLÍTICAS EXISTENTES
-- ==========================================
DO \$\$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'usuarios'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.usuarios', pol.policyname);
  END LOOP;

  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'roles'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.roles', pol.policyname);
  END LOOP;
END \$\$;

-- ==========================================
-- POLÍTICAS NUEVAS (usando JWT, sin recursión)
-- ==========================================

-- roles: cualquier autenticado puede consultar
CREATE POLICY "roles_select_auth" ON public.roles
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- usuarios: cada quien ve su propio registro
CREATE POLICY "usuarios_view_own" ON public.usuarios
  FOR SELECT
  USING (id_usuario = auth.uid());

-- usuarios: admins y coordinadores ven todo (vía JWT metadata)
CREATE POLICY "usuarios_view_admin" ON public.usuarios
  FOR SELECT
  USING (
    coalesce(auth.jwt() -> 'user_metadata' ->> 'nombre_rol', '') IN ('Administrador', 'Coordinador')
  );

-- usuarios: solo admins pueden insertar/actualizar/eliminar
CREATE POLICY "usuarios_insert_admin" ON public.usuarios
  FOR INSERT
  WITH CHECK (
    coalesce(auth.jwt() -> 'user_metadata' ->> 'nombre_rol', '') = 'Administrador'
  );

CREATE POLICY "usuarios_update_admin" ON public.usuarios
  FOR UPDATE
  USING (
    coalesce(auth.jwt() -> 'user_metadata' ->> 'nombre_rol', '') = 'Administrador'
  );

CREATE POLICY "usuarios_delete_admin" ON public.usuarios
  FOR DELETE
  USING (
    coalesce(auth.jwt() -> 'user_metadata' ->> 'nombre_rol', '') = 'Administrador'
  );

-- ==========================================
-- CONFIRMACIÓN
-- ==========================================
SELECT 'Políticas actualizadas correctamente' AS resultado;
