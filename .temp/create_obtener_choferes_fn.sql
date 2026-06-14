CREATE OR REPLACE FUNCTION obtener_choferes()
RETURNS TABLE(
    id_usuario uuid,
    nombre_completo varchar,
    cedula integer,
    nombre_rol varchar,
    certificado_numero varchar,
    certificado_vencimiento date,
    licencia_numero varchar,
    licencia_grado varchar,
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
        r.nombre_rol::varchar,
        cm.certificado_numero,
        cm.certificado_vencimiento,
        lc.licencia_numero,
        lc.licencia_grado::varchar,
        lc.licencia_vencimiento
    FROM usuarios u
    JOIN roles r ON r.id_rol = u.id_rol
    LEFT JOIN certificados_medicos cm ON cm.usuario_id = u.id_usuario
    LEFT JOIN licencias_conducir lc ON lc.usuario_id = u.id_usuario
    WHERE r.nombre_rol IN ('chofer', 'ayudante')
    ORDER BY u.nombre_completo;
END;
$$;
