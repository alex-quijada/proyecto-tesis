DROP FUNCTION IF EXISTS public.obtener_datos_adicionales_usuarios(uuid[]);

CREATE OR REPLACE FUNCTION public.obtener_datos_adicionales_usuarios(usuario_ids uuid[])
RETURNS TABLE(
    usuario_id uuid,
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
        cm.certificado_numero,
        cm.certificado_expedicion,
        cm.certificado_vencimiento,
        lc.licencia_numero,
        lc.licencia_grado::varchar,
        lc.licencia_expedicion,
        lc.licencia_vencimiento
    FROM usuarios u
    LEFT JOIN certificados_medicos cm ON cm.usuario_id = u.id_usuario
    LEFT JOIN licencias_conducir lc ON lc.usuario_id = u.id_usuario
    WHERE u.id_usuario = ANY(usuario_ids);
END;
$$;
