-- ==========================================
-- 00047: obtener_choferes devuelve inactivos y expone `activo`
--
-- Antes el RPC filtraba `u.activo = true` en BD, así que un chofer desactivado
-- desaparecía de la lista y no había forma de reactivarlo desde la UI.
-- Ahora recibe `p_incluir_inactivos` (default false) y devuelve `activo`:
-- - Los llamadores de asignación (home del chofer, guia-dialog) siguen sin el
--   param → solo reciben activos.
-- - La página de choferes pasa true cuando el filtro es "Todos"/"Inactivos".
-- ==========================================

DROP FUNCTION IF EXISTS public.obtener_choferes();

CREATE OR REPLACE FUNCTION public.obtener_choferes(
    p_incluir_inactivos boolean DEFAULT false
)
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
    licencia_vencimiento date,
    activo boolean
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
        lc.licencia_vencimiento,
        u.activo
    FROM usuarios u
    JOIN roles r ON r.id_rol = u.id_rol
    LEFT JOIN certificados_medicos cm ON cm.usuario_id = u.id_usuario
    LEFT JOIN licencias_conducir lc ON lc.usuario_id = u.id_usuario
    WHERE LOWER(r.nombre_rol) IN ('chofer', 'ayudante')
      AND (p_incluir_inactivos OR u.activo = true)
    ORDER BY u.nombre_completo;
END;
$$;
