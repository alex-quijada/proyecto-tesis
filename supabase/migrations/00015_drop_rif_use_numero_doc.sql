-- Reemplazar rif por numero_doc en clientes (rif es redundante)

-- 1. Migrar datos existentes de rif a numero_doc si estan vacios
UPDATE public.clientes SET numero_doc = rif WHERE numero_doc IS NULL OR numero_doc = '';

-- 2. Recrear RPCs usando numero_doc
DROP FUNCTION IF EXISTS public.crear_cliente(uuid, character varying, character varying, character varying, character varying, character varying, uuid, jsonb);
DROP FUNCTION IF EXISTS public.actualizar_cliente(uuid, uuid, character varying, character varying, character varying, character varying, character varying, uuid, jsonb);
DROP FUNCTION IF EXISTS public.obtener_clientes();

CREATE OR REPLACE FUNCTION public.crear_cliente(
    p_id_prefijo uuid,
    p_numero_doc character varying,
    p_nombre_comercial character varying,
    p_telefono character varying,
    p_correo text,
    p_persona_contacto character varying,
    p_id_prioridad uuid,
    p_reglas jsonb DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
    v_id_cliente uuid;
BEGIN
    INSERT INTO public.clientes (
        id_prefijo,
        numero_doc,
        nombre_comercial,
        telefono,
        correo,
        persona_contacto,
        id_prioridad,
        reglas
    ) VALUES (
        p_id_prefijo,
        p_numero_doc,
        p_nombre_comercial,
        p_telefono,
        p_correo,
        p_persona_contacto,
        p_id_prioridad,
        p_reglas
    )
    RETURNING id_cliente INTO v_id_cliente;

    RETURN v_id_cliente;
END;
$$;

CREATE OR REPLACE FUNCTION public.actualizar_cliente(
    p_id_cliente uuid,
    p_id_prefijo uuid,
    p_numero_doc character varying,
    p_nombre_comercial character varying,
    p_telefono character varying,
    p_correo text,
    p_persona_contacto character varying,
    p_id_prioridad uuid,
    p_reglas jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
    UPDATE public.clientes
    SET
        id_prefijo = p_id_prefijo,
        numero_doc = p_numero_doc,
        nombre_comercial = p_nombre_comercial,
        telefono = p_telefono,
        correo = p_correo,
        persona_contacto = p_persona_contacto,
        id_prioridad = p_id_prioridad,
        reglas = p_reglas
    WHERE id_cliente = p_id_cliente;
END;
$$;

CREATE OR REPLACE FUNCTION public.obtener_clientes()
RETURNS TABLE(
    id_cliente uuid,
    nombre_comercial character varying,
    prefijo character(1),
    numero_doc character varying,
    telefono character varying,
    correo text,
    persona_contacto character varying,
    reglas jsonb,
    id_prioridad uuid,
    nombre_prioridad character varying
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
        c.reglas,
        c.id_prioridad,
        pr.nombre_prioridad
    FROM public.clientes c
    JOIN public.prioridades_clientes pr ON pr.id_prioridad = c.id_prioridad
    LEFT JOIN public.prefijos_documento pd ON pd.id_prefijo = c.id_prefijo
    ORDER BY c.nombre_comercial;
$$;

-- 3. Eliminar columna rif (redundante con numero_doc)
ALTER TABLE public.clientes DROP COLUMN IF EXISTS rif;
