-- Clean up all function overloads for actualizar_cliente and crear_cliente

DROP FUNCTION IF EXISTS public.actualizar_cliente(uuid, uuid, text, character varying, character varying, text, character varying, uuid, jsonb);
DROP FUNCTION IF EXISTS public.actualizar_cliente(uuid, uuid, character varying, character varying, character varying, text, character varying, uuid, jsonb);
DROP FUNCTION IF EXISTS public.crear_cliente(uuid, text, character varying, character varying, text, character varying, uuid, jsonb);

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
