-- ==========================================
-- 00041: Desactivar usuarios en vez de borrar
--
-- - Se asegura la columna `activo` (el remoto ya la tenía; el local no).
-- - RPCs SECURITY DEFINER para desactivar/reactivar: marcan `activo` y
--   bloquean/desbloquean el login a nivel de Supabase Auth (banned_until).
-- - obtener_choferes solo devuelve usuarios activos (no asignar inactivos).
-- ==========================================

-- --- Asegurar columna activo ---
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS activo boolean NOT NULL DEFAULT true;

-- --- RPC: desactivar ---
CREATE OR REPLACE FUNCTION public.desactivar_usuario(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.usuarios SET activo = false WHERE id_usuario = p_id;
    UPDATE auth.users SET banned_until = 'infinity' WHERE id = p_id;
END;
$$;

-- --- RPC: reactivar ---
CREATE OR REPLACE FUNCTION public.reactivar_usuario(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.usuarios SET activo = true WHERE id_usuario = p_id;
    UPDATE auth.users SET banned_until = NULL WHERE id = p_id;
END;
$$;

-- --- obtener_choferes: solo activos ---
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
      AND u.activo = true
    ORDER BY u.nombre_completo;
END;
$$;
