-- ==========================================
-- 00046: Soft-delete de clientes (desactivar/reactivar)
--
-- - Añade la columna `activo` a public.clientes.
-- - RPC `actualizar_estado_cliente` (SECURITY DEFINER) con validación de rol:
--   solo el personal interno (Administrador, Analista, Coordinador) puede
--   desactivar/reactivar, RAISE EXCEPTION si se deniega (mismo patrón que 00045).
-- - `obtener_clientes` devuelve `activo` (sin filtrar, para poder reactivar).
-- ==========================================

-- --- Asegurar columna activo ---
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS activo boolean NOT NULL DEFAULT true;

-- --- RPC: actualizar estado del cliente ---
CREATE OR REPLACE FUNCTION public.actualizar_estado_cliente(
    p_id_cliente uuid,
    p_activo boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_rol text;
BEGIN
    SELECT r.nombre_rol::text INTO v_rol
    FROM public.usuarios u
    JOIN public.roles r ON r.id_rol = u.id_rol
    WHERE u.id_usuario = auth.uid();

    IF v_rol IS NULL OR LOWER(v_rol) NOT IN ('administrador', 'analista', 'coordinador') THEN
        RAISE EXCEPTION 'Acceso denegado: solo el personal interno puede modificar el estado de los clientes.'
        USING ERRCODE = '42501';
    END IF;

    UPDATE public.clientes
    SET activo = p_activo
    WHERE id_cliente = p_id_cliente;
END;
$$;

-- --- obtener_clientes: devolver activo ---
DROP FUNCTION IF EXISTS public.obtener_clientes();

CREATE OR REPLACE FUNCTION public.obtener_clientes()
RETURNS TABLE(
    id_cliente uuid,
    nombre_comercial character varying,
    prefijo character(1),
    numero_doc character varying,
    telefono character varying,
    correo text,
    persona_contacto character varying,
    id_prioridad uuid,
    nombre_prioridad character varying,
    activo boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
    SELECT
        c.id_cliente,
        c.nombre_comercial,
        pd.prefijo,
        c.numero_doc,
        c.telefono,
        c.correo,
        c.persona_contacto,
        c.id_prioridad,
        pr.nombre_prioridad,
        c.activo
    FROM public.clientes c
    LEFT JOIN public.prefijos_documento pd ON pd.id_prefijo = c.id_prefijo
    LEFT JOIN public.prioridades_clientes pr ON pr.id_prioridad = c.id_prioridad
    ORDER BY c.nombre_comercial ASC;
$$;
