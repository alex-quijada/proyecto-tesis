-- Guardar sucursales del cliente (reemplaza guardar_ubicaciones_cliente)

DROP FUNCTION IF EXISTS public.guardar_ubicaciones_cliente(uuid, jsonb);
DROP FUNCTION IF EXISTS public.obtener_ubicaciones_cliente(uuid);

CREATE OR REPLACE FUNCTION public.guardar_sucursales_cliente(
    p_cliente_id uuid,
    p_sucursales jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
    DELETE FROM public.sucursales_cliente WHERE cliente_id = p_cliente_id;

    INSERT INTO public.sucursales_cliente (
        cliente_id, direccion, punto_de_referencia,
        telefono_contacto, nombre_contacto,
        instruccion_nota, cita, dias_semana, hora_entrega
    )
    SELECT
        p_cliente_id,
        s.direccion,
        COALESCE(s.punto_de_referencia, ''),
        s.telefono_contacto,
        s.nombre_contacto,
        s.instruccion_nota,
        COALESCE(s.cita, false),
        s.dias_semana,
        CASE
            WHEN s.hora_entrega IS NOT NULL AND s.hora_entrega <> ''
            THEN s.hora_entrega::time without time zone
            ELSE NULL
        END
    FROM jsonb_to_recordset(p_sucursales) AS s(
        direccion text,
        punto_de_referencia text,
        telefono_contacto character varying(20),
        nombre_contacto text,
        instruccion_nota text,
        cita boolean,
        dias_semana text,
        hora_entrega text
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.obtener_sucursales_cliente(p_cliente_id uuid)
RETURNS TABLE(
    id uuid,
    direccion text,
    punto_de_referencia text,
    telefono_contacto character varying(20),
    nombre_contacto text,
    instruccion_nota text,
    cita boolean,
    dias_semana text,
    hora_entrega time without time zone
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
    SELECT
        s.id, s.direccion, s.punto_de_referencia,
        s.telefono_contacto, s.nombre_contacto,
        s.instruccion_nota, s.cita, s.dias_semana,
        s.hora_entrega
    FROM public.sucursales_cliente s
    WHERE s.cliente_id = p_cliente_id
    ORDER BY s.id;
$$;
