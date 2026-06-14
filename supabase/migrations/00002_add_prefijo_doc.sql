-- ==========================================
-- Agregar prefijo_doc a la tabla usuarios
-- ==========================================
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS prefijo_doc CHAR(1) NOT NULL DEFAULT 'V'
  CHECK (prefijo_doc IN ('V', 'E', 'J', 'P', 'G'));

-- ==========================================
-- Actualizar trigger handle_new_user
-- ==========================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  default_role_id uuid;
BEGIN
  SELECT id_rol INTO default_role_id 
  FROM public.roles 
  WHERE nombre_rol = COALESCE(new.raw_user_meta_data->>'nombre_rol', 'Chofer') 
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

-- ==========================================
-- Actualizar RPC obtener_choferes
-- ==========================================
CREATE OR REPLACE FUNCTION obtener_choferes()
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
    WHERE r.nombre_rol IN ('chofer', 'ayudante')
    ORDER BY u.nombre_completo;
END;
$$;

-- ==========================================
-- Actualizar RPC obtener_datos_adicionales_usuarios
-- ==========================================
CREATE OR REPLACE FUNCTION obtener_datos_adicionales_usuarios(usuario_ids uuid[])
RETURNS TABLE(
    usuario_id uuid,
    licencia_numero varchar,
    licencia_grado varchar,
    licencia_expedicion date,
    licencia_vencimiento date,
    certificado_numero varchar,
    certificado_expedicion date,
    certificado_vencimiento date,
    prefijo_doc char
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        u.id_usuario,
        lc.licencia_numero,
        lc.licencia_grado,
        lc.licencia_expedicion,
        lc.licencia_vencimiento,
        cm.certificado_numero,
        cm.certificado_expedicion,
        cm.certificado_vencimiento,
        u.prefijo_doc
    FROM usuarios u
    LEFT JOIN licencias_conducir lc ON lc.usuario_id = u.id_usuario
    LEFT JOIN certificados_medicos cm ON cm.usuario_id = u.id_usuario
    WHERE u.id_usuario = ANY(usuario_ids);
END;
$$;
