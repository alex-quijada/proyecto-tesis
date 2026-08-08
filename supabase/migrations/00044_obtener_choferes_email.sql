-- ==========================================
-- 00044: obtener_choferes devuelve email
--
-- El diálogo de choferes edita datos que se persisten con la Edge Function
-- `actualizar-usuario`, que requiere `user_id` y `email`. El RPC no exponía
-- el email, así que el front no podía construir el payload. Se agrega
-- `email` al tipo de retorno y al SELECT.
-- ==========================================

-- Postgres no permite cambiar la firma (OUT params) con CREATE OR REPLACE,
-- así que se elimina la función existente antes de recrearla.
DROP FUNCTION IF EXISTS public.obtener_choferes();

CREATE OR REPLACE FUNCTION public.obtener_choferes()
RETURNS TABLE(
    id_usuario uuid,
    email varchar,
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
        u.email,
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
      AND u.activo = true
    ORDER BY u.nombre_completo;
END;
$$;
