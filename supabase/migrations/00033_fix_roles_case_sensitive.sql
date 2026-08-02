-- ==========================================
-- 00033: Roles consistentes en PascalCase + policies RLS case-insensitive
--
-- Contexto: los roles se creaban en minúscula ('analista', 'chofer'...) via
-- user_metadata.nombre_rol, pero la tabla public.roles y las policies RLS
-- comparan en PascalCase ('Analista', 'Chofer'). Esto dejaba usuarios con
-- usuarios.id_rol = NULL y errores de permisos.
-- ==========================================

-- 1) Normalizar nombre_rol en user_metadata de usuarios existentes
UPDATE auth.users
SET raw_user_meta_data = jsonb_set(
    COALESCE(raw_user_meta_data, '{}'::jsonb),
    '{nombre_rol}',
    to_jsonb(initcap(raw_user_meta_data ->> 'nombre_rol')),
    true
)
WHERE raw_user_meta_data ? 'nombre_rol';

-- 2) Backfill de usuarios.id_rol según metadata (case-insensitive)
UPDATE public.usuarios u
SET id_rol = r.id_rol
FROM public.roles r
JOIN auth.users au ON au.id = u.id_usuario
WHERE LOWER(r.nombre_rol) = LOWER(COALESCE(au.raw_user_meta_data ->> 'nombre_rol', 'Chofer'))
  AND (u.id_rol IS NULL OR u.id_rol <> r.id_rol);

-- 3) Trigger handle_new_user: lookup case-insensitive
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  default_role_id uuid;
BEGIN
  SELECT id_rol INTO default_role_id
  FROM public.roles
  WHERE LOWER(nombre_rol) = LOWER(COALESCE(new.raw_user_meta_data->>'nombre_rol', 'Chofer'))
  LIMIT 1;

  INSERT INTO public.usuarios (id_usuario, email, id_rol, nombre_completo, cedula, prefijo_doc)
  VALUES (
    new.id,
    new.email,
    default_role_id,
    COALESCE(new.raw_user_meta_data->>'nombre_completo', 'Usuario Nuevo'),
    (new.raw_user_meta_data->>'cedula')::integer,
    COALESCE(new.raw_user_meta_data->>'prefijo_doc', 'V')
  );
  return new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4) RPC obtener_choferes: filtro case-insensitive
CREATE OR REPLACE FUNCTION public.obtener_choferes()
RETURNS TABLE(
    id_usuario uuid,
    nombre_completo varchar,
    cedula integer,
    prefijo_doc char,
    nombre_rol varchar,
    certificado_numero varchar,
    certificado_expedicion date,
    certificado_vencimiento date,
    licencia_numero varchar,
    licencia_grado varchar,
    licencia_expedicion date,
    licencia_vencimiento date
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        u.id_usuario,
        u.nombre_completo,
        u.cedula,
        u.prefijo_doc,
        r.nombre_rol::varchar,
        cm.certificado_numero,
        cm.certificado_expedicion,
        cm.certificado_vencimiento,
        lc.licencia_numero,
        lc.licencia_grado::varchar,
        lc.licencia_expedicion,
        lc.licencia_vencimiento
    FROM usuarios u
    JOIN roles r ON r.id_rol = u.id_rol
    LEFT JOIN certificados_medicos cm ON cm.usuario_id = u.id_usuario
    LEFT JOIN licencias_conducir lc ON lc.usuario_id = u.id_usuario
    WHERE LOWER(r.nombre_rol) IN ('chofer', 'ayudante')
    ORDER BY u.nombre_completo;
END;
$$;

-- ==========================================
-- 5) Policies RLS case-insensitive (acepta JWT viejo en minúscula y nuevo en PascalCase)
-- ==========================================

-- --- vehiculos ---
DROP POLICY IF EXISTS "Admin y Analista pueden SELECT vehiculos" ON public.vehiculos;
DROP POLICY IF EXISTS "Admin y Analista pueden INSERT vehiculos" ON public.vehiculos;
DROP POLICY IF EXISTS "Admin y Analista pueden UPDATE vehiculos" ON public.vehiculos;
DROP POLICY IF EXISTS "Admin y Analista pueden DELETE vehiculos" ON public.vehiculos;

CREATE POLICY "Admin y Analista pueden SELECT vehiculos"
    ON public.vehiculos FOR SELECT TO authenticated
    USING (LOWER(COALESCE(auth.jwt() ->> 'nombre_rol', auth.jwt() -> 'user_metadata' ->> 'nombre_rol'))
        = ANY (ARRAY['administrador'::text, 'analista'::text]));

CREATE POLICY "Admin y Analista pueden INSERT vehiculos"
    ON public.vehiculos FOR INSERT TO authenticated
    WITH CHECK (LOWER(COALESCE(auth.jwt() ->> 'nombre_rol', auth.jwt() -> 'user_metadata' ->> 'nombre_rol'))
        = ANY (ARRAY['administrador'::text, 'analista'::text]));

CREATE POLICY "Admin y Analista pueden UPDATE vehiculos"
    ON public.vehiculos FOR UPDATE TO authenticated
    USING (LOWER(COALESCE(auth.jwt() ->> 'nombre_rol', auth.jwt() -> 'user_metadata' ->> 'nombre_rol'))
        = ANY (ARRAY['administrador'::text, 'analista'::text]))
    WITH CHECK (LOWER(COALESCE(auth.jwt() ->> 'nombre_rol', auth.jwt() -> 'user_metadata' ->> 'nombre_rol'))
        = ANY (ARRAY['administrador'::text, 'analista'::text]));

CREATE POLICY "Admin y Analista pueden DELETE vehiculos"
    ON public.vehiculos FOR DELETE TO authenticated
    USING (LOWER(COALESCE(auth.jwt() ->> 'nombre_rol', auth.jwt() -> 'user_metadata' ->> 'nombre_rol'))
        = ANY (ARRAY['administrador'::text, 'analista'::text]));

-- --- Storage: imágenes de vehículos ---
DROP POLICY IF EXISTS "Autenticados pueden subir imagenes vehiculos" ON storage.objects;

CREATE POLICY "Autenticados pueden subir imagenes vehiculos"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'vehiculos-imagenes'
        AND LOWER(COALESCE(auth.jwt() ->> 'nombre_rol', auth.jwt() -> 'user_metadata' ->> 'nombre_rol'))
            = ANY (ARRAY['administrador'::text, 'analista'::text])
    );

-- --- guias_carga ---
DROP POLICY IF EXISTS "guias_carga_select_policy" ON public.guias_carga;
DROP POLICY IF EXISTS "guias_carga_insert_policy" ON public.guias_carga;
DROP POLICY IF EXISTS "guias_carga_update_policy" ON public.guias_carga;
DROP POLICY IF EXISTS "guias_carga_delete_policy" ON public.guias_carga;

CREATE POLICY "guias_carga_select_policy"
    ON public.guias_carga FOR SELECT TO authenticated
    USING (LOWER(COALESCE(auth.jwt() ->> 'nombre_rol', auth.jwt() -> 'user_metadata' ->> 'nombre_rol'))
        = ANY (ARRAY['administrador'::text, 'analista'::text, 'coordinador'::text]));

CREATE POLICY "guias_carga_insert_policy"
    ON public.guias_carga FOR INSERT TO authenticated
    WITH CHECK (LOWER(COALESCE(auth.jwt() ->> 'nombre_rol', auth.jwt() -> 'user_metadata' ->> 'nombre_rol'))
        = ANY (ARRAY['administrador'::text, 'analista'::text]));

CREATE POLICY "guias_carga_update_policy"
    ON public.guias_carga FOR UPDATE TO authenticated
    USING (LOWER(COALESCE(auth.jwt() ->> 'nombre_rol', auth.jwt() -> 'user_metadata' ->> 'nombre_rol'))
        = ANY (ARRAY['administrador'::text, 'analista'::text]))
    WITH CHECK (LOWER(COALESCE(auth.jwt() ->> 'nombre_rol', auth.jwt() -> 'user_metadata' ->> 'nombre_rol'))
        = ANY (ARRAY['administrador'::text, 'analista'::text]));

CREATE POLICY "guias_carga_delete_policy"
    ON public.guias_carga FOR DELETE TO authenticated
    USING (LOWER(COALESCE(auth.jwt() ->> 'nombre_rol', auth.jwt() -> 'user_metadata' ->> 'nombre_rol'))
        = ANY (ARRAY['administrador'::text, 'analista'::text]));

-- --- facturas ---
DROP POLICY IF EXISTS "facturas_select_policy" ON public.facturas;
DROP POLICY IF EXISTS "facturas_insert_policy" ON public.facturas;
DROP POLICY IF EXISTS "facturas_update_policy" ON public.facturas;
DROP POLICY IF EXISTS "facturas_delete_policy" ON public.facturas;

CREATE POLICY "facturas_select_policy"
    ON public.facturas FOR SELECT TO authenticated
    USING (LOWER(COALESCE(auth.jwt() ->> 'nombre_rol', auth.jwt() -> 'user_metadata' ->> 'nombre_rol'))
        = ANY (ARRAY['administrador'::text, 'analista'::text, 'coordinador'::text]));

CREATE POLICY "facturas_insert_policy"
    ON public.facturas FOR INSERT TO authenticated
    WITH CHECK (LOWER(COALESCE(auth.jwt() ->> 'nombre_rol', auth.jwt() -> 'user_metadata' ->> 'nombre_rol'))
        = ANY (ARRAY['administrador'::text, 'analista'::text]));

CREATE POLICY "facturas_update_policy"
    ON public.facturas FOR UPDATE TO authenticated
    USING (LOWER(COALESCE(auth.jwt() ->> 'nombre_rol', auth.jwt() -> 'user_metadata' ->> 'nombre_rol'))
        = ANY (ARRAY['administrador'::text, 'analista'::text]))
    WITH CHECK (LOWER(COALESCE(auth.jwt() ->> 'nombre_rol', auth.jwt() -> 'user_metadata' ->> 'nombre_rol'))
        = ANY (ARRAY['administrador'::text, 'analista'::text]));

CREATE POLICY "facturas_delete_policy"
    ON public.facturas FOR DELETE TO authenticated
    USING (LOWER(COALESCE(auth.jwt() ->> 'nombre_rol', auth.jwt() -> 'user_metadata' ->> 'nombre_rol'))
        = ANY (ARRAY['administrador'::text, 'analista'::text]));

-- --- viajes / itinerario_viaje (JOIN con roles, case-insensitive) ---
DROP POLICY IF EXISTS "Admin/Coord/Analista todo viajes" ON public.viajes;
DROP POLICY IF EXISTS "Admin/Coord/Analista todo itinerario" ON public.itinerario_viaje;

CREATE POLICY "Admin/Coord/Analista todo viajes"
    ON public.viajes FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM usuarios u
            JOIN roles r ON u.id_rol = r.id_rol
            WHERE u.id_usuario = auth.uid()
            AND LOWER(r.nombre_rol) IN ('administrador', 'coordinador', 'analista')
        )
    );

CREATE POLICY "Admin/Coord/Analista todo itinerario"
    ON public.itinerario_viaje FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM usuarios u
            JOIN roles r ON u.id_rol = r.id_rol
            WHERE u.id_usuario = auth.uid()
            AND LOWER(r.nombre_rol) IN ('administrador', 'coordinador', 'analista')
        )
    );
