-- Cambia guardar_sucursales_cliente de DELETE+INSERT a UPSERT
-- para evitar violaciones de FK cuando facturas referencian sucursales.

DROP FUNCTION IF EXISTS public.guardar_sucursales_cliente(uuid, jsonb);

CREATE OR REPLACE FUNCTION public.guardar_sucursales_cliente(
    p_cliente_id uuid,
    p_sucursales jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
    v_incoming_ids uuid[];
BEGIN
    -- Collect incoming ids
    SELECT ARRAY_AGG(s.id::uuid)
    INTO v_incoming_ids
    FROM jsonb_to_recordset(p_sucursales) AS s(id text)
    WHERE s.id IS NOT NULL AND s.id <> '';

    -- UPSERT incoming rows
    INSERT INTO public.sucursales_cliente (
        id, cliente_id, direccion, punto_de_referencia,
        telefono_contacto, nombre_contacto,
        instruccion_nota, cita, dias_semana,
        hora_desde, hora_hasta,
        id_municipio, latitud, longitud
    )
    SELECT
        COALESCE(s.id::uuid, gen_random_uuid()),
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
        id text,
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
    )
    ON CONFLICT (id) DO UPDATE SET
        direccion          = EXCLUDED.direccion,
        punto_de_referencia = EXCLUDED.punto_de_referencia,
        telefono_contacto  = EXCLUDED.telefono_contacto,
        nombre_contacto    = EXCLUDED.nombre_contacto,
        instruccion_nota   = EXCLUDED.instruccion_nota,
        cita               = EXCLUDED.cita,
        dias_semana        = EXCLUDED.dias_semana,
        hora_desde         = EXCLUDED.hora_desde,
        hora_hasta         = EXCLUDED.hora_hasta,
        id_municipio       = EXCLUDED.id_municipio,
        latitud            = EXCLUDED.latitud,
        longitud           = EXCLUDED.longitud;

    -- Delete rows NOT in incoming list AND not referenced by facturas
    DELETE FROM public.sucursales_cliente s
    WHERE s.cliente_id = p_cliente_id
      AND (v_incoming_ids IS NULL OR s.id <> ALL (v_incoming_ids))
      AND NOT EXISTS (
          SELECT 1 FROM public.facturas f
          WHERE f.id_sucursal = s.id
      );
END;
$$;
