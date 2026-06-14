DO $$
BEGIN
  DROP POLICY IF EXISTS "Admins can update" ON public.usuarios;
  DROP POLICY IF EXISTS "Admins can delete" ON public.usuarios;
  DROP POLICY IF EXISTS "Admins and Coordinators can view all" ON public.usuarios;
  DROP POLICY IF EXISTS "Solo analistas y administradores leen usuarios" ON public.usuarios;

  CREATE POLICY "Admins can update" ON public.usuarios
    FOR UPDATE USING (get_user_role_name() = 'administrador');

  CREATE POLICY "Admins can delete" ON public.usuarios
    FOR DELETE USING (get_user_role_name() = 'administrador');

  CREATE POLICY "Admins and Coordinators can view all" ON public.usuarios
    FOR SELECT USING (get_user_role_name() = ANY (ARRAY['administrador', 'coordinador']));

  CREATE POLICY "Solo analistas y administradores leen usuarios" ON public.usuarios
    FOR SELECT USING (
      (auth.jwt() -> 'user_metadata' ->> 'nombre_rol') = ANY (ARRAY['analista', 'administrador'])
    );

  DROP POLICY IF EXISTS "Admins can insert certificados" ON public.certificados_medicos;
  CREATE POLICY "Admins can insert certificados" ON public.certificados_medicos
    FOR INSERT WITH CHECK (
      ((SELECT r.nombre_rol
        FROM usuarios u JOIN roles r ON r.id_rol = u.id_rol
        WHERE u.id_usuario = auth.uid()))::text = 'administrador'
    );

  DROP POLICY IF EXISTS "Admins can insert licencias" ON public.licencias_conducir;
  CREATE POLICY "Admins can insert licencias" ON public.licencias_conducir
    FOR INSERT WITH CHECK (
      ((SELECT r.nombre_rol
        FROM usuarios u JOIN roles r ON r.id_rol = u.id_rol
        WHERE u.id_usuario = auth.uid()))::text = 'administrador'
    );
END $$;

SELECT 'Policies updated' AS resultado;
