-- Remove reglas from RPCs — column no longer exists on clientes table

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
        c.id_prioridad,
        pr.nombre_prioridad
    FROM public.clientes c
    LEFT JOIN public.prefijos_documento pd ON pd.id_prefijo = c.id_prefijo
    LEFT JOIN public.prioridades_clientes pr ON pr.id_prioridad = c.id_prioridad
    ORDER BY c.nombre_comercial ASC;
$$;

DROP FUNCTION IF EXISTS public.crear_cliente(uuid, character varying, character varying, character varying, text, character varying, uuid, jsonb);

CREATE OR REPLACE FUNCTION public.crear_cliente(
    p_id_prefijo uuid,
    p_numero_doc character varying,
    p_nombre_comercial character varying,
    p_telefono character varying,
    p_correo text,
    p_persona_contacto character varying,
    p_id_prioridad uuid
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
        id_prioridad
    ) VALUES (
        p_id_prefijo,
        p_numero_doc,
        p_nombre_comercial,
        p_telefono,
        p_correo,
        p_persona_contacto,
        p_id_prioridad
    )
    RETURNING id_cliente INTO v_id_cliente;

    RETURN v_id_cliente;
END;
$$;

DROP FUNCTION IF EXISTS public.actualizar_cliente(uuid, uuid, character varying, character varying, character varying, character varying, uuid, jsonb);

CREATE OR REPLACE FUNCTION public.actualizar_cliente(
    p_id_cliente uuid,
    p_id_prefijo uuid,
    p_numero_doc character varying,
    p_nombre_comercial character varying,
    p_telefono character varying,
    p_correo text,
    p_persona_contacto character varying,
    p_id_prioridad uuid
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
        id_prioridad = p_id_prioridad
    WHERE id_cliente = p_id_cliente;
END;
$$;
