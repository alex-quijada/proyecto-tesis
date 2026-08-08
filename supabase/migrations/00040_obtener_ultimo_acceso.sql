-- ==========================================
-- 00040: último acceso desde auth.users
--
-- Se agrega la columna ultimo_acceso (auth.users.last_sign_in_at) al RPC
-- obtener_datos_adicionales_usuarios para mostrarlo en Gestión de Usuarios.
-- Como el RPC es SECURITY DEFINER puede leer auth.users sin exponer secretos.
-- (Agregar columna a RETURNS TABLE requiere DROP + CREATE, no CREATE OR REPLACE)
-- ==========================================

DROP FUNCTION IF EXISTS public.obtener_datos_adicionales_usuarios(uuid[]);

CREATE OR REPLACE FUNCTION public.obtener_datos_adicionales_usuarios(usuario_ids uuid[])
RETURNS TABLE(
    usuario_id uuid,
    licencia_numero varchar,
    licencia_grado varchar,
    licencia_expedicion date,
    licencia_vencimiento date,
    certificado_numero varchar,
    certificado_expedicion date,
    certificado_vencimiento date,
    prefijo_doc char,
    ultimo_acceso timestamptz
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
        lc.licencia_grado::varchar,
        lc.licencia_expedicion,
        lc.licencia_vencimiento,
        cm.certificado_numero,
        cm.certificado_expedicion,
        cm.certificado_vencimiento,
        u.prefijo_doc,
        au.last_sign_in_at
    FROM usuarios u
    LEFT JOIN licencias_conducir lc ON lc.usuario_id = u.id_usuario
    LEFT JOIN certificados_medicos cm ON cm.usuario_id = u.id_usuario
    LEFT JOIN auth.users au ON au.id = u.id_usuario
    WHERE u.id_usuario = ANY(usuario_ids);
END;
$$;
