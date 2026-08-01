-- Reemplaza hora_entrega por intervalo hora_desde / hora_hasta en sucursales_cliente

ALTER TABLE public.sucursales_cliente
    ADD COLUMN IF NOT EXISTS hora_desde time without time zone,
    ADD COLUMN IF NOT EXISTS hora_hasta time without time zone;

UPDATE public.sucursales_cliente
    SET hora_desde = hora_entrega
    WHERE hora_entrega IS NOT NULL;

ALTER TABLE public.sucursales_cliente
    DROP COLUMN IF EXISTS hora_entrega;

DROP FUNCTION IF EXISTS public.guardar_sucursales_cliente(uuid, jsonb);
DROP FUNCTION IF EXISTS public.obtener_sucursales_cliente(uuid);

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
        instruccion_nota, cita, dias_semana,
        hora_desde, hora_hasta,
        id_municipio, latitud, longitud
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
            WHEN s.hora_desde IS NOT NULL AND s.hora_desde <> ''
            THEN s.hora_desde::time without time zone
            ELSE NULL
        END,
        CASE
            WHEN s.hora_hasta IS NOT NULL AND s.hora_hasta <> ''
            THEN s.hora_hasta::time without time zone
            ELSE NULL
        END,
        s.id_municipio::uuid,
        s.latitud::double precision,
        s.longitud::double precision
    FROM jsonb_to_recordset(p_sucursales) AS s(
        direccion text,
        punto_de_referencia text,
        telefono_contacto character varying(20),
        nombre_contacto text,
        instruccion_nota text,
        cita boolean,
        dias_semana text,
        hora_desde text,
        hora_hasta text,
        id_municipio text,
        latitud text,
        longitud text
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
    hora_desde time without time zone,
    hora_hasta time without time zone,
    id_municipio uuid,
    latitud double precision,
    longitud double precision
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
        s.hora_desde, s.hora_hasta,
        s.id_municipio, s.latitud, s.longitud
    FROM public.sucursales_cliente s
    WHERE s.cliente_id = p_cliente_id
    ORDER BY s.id;
$$;
