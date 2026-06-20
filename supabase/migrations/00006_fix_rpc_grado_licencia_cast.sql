-- ==========================================
-- Castear licencia_grado a varchar en RPC
-- La columna es tipo enum grado_licencia
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
        lc.licencia_grado::varchar,
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
