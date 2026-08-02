-- Corrige guardar_sucursales_cliente:
-- 1) Maneja id vacío ('') generando un nuevo UUID en vez de lanzar 22P02.
-- 2) Solo elimina sucursales PREEXISTENTES que el usuario quitó de la lista,
--    evitando borrar las recién creadas en la misma llamada.

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
    v_existing_ids uuid[];
BEGIN
    -- Sucursales ya existentes para este cliente (antes del upsert)
    SELECT ARRAY_AGG(id)
    INTO v_existing_ids
    FROM public.sucursales_cliente
    WHERE cliente_id = p_cliente_id;

    -- Ids entrantes (los vacíos representan sucursales nuevas)
    SELECT ARRAY_AGG(s.id::uuid)
    INTO v_incoming_ids
    FROM jsonb_to_recordset(p_sucursales) AS s(id text)
    WHERE s.id IS NOT NULL AND s.id <> '';

    -- UPSERT de las filas entrantes
    INSERT INTO public.sucursales_cliente (
        id, cliente_id, direccion, punto_de_referencia,
        telefono_contacto, nombre_contacto,
        instruccion_nota, cita, dias_semana,
        hora_desde, hora_hasta,
        id_municipio, latitud, longitud
    )
    SELECT
        COALESCE(NULLIF(s.id, '')::uuid, gen_random_uuid()),
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

    -- Elimina SOLO sucursales preexistentes que no estén en la lista entrante
    -- y no estén referenciadas por facturas (las nuevas sobreviven).
    DELETE FROM public.sucursales_cliente s
    WHERE s.cliente_id = p_cliente_id
      AND v_existing_ids IS NOT NULL
      AND s.id = ANY (v_existing_ids)
      AND (v_incoming_ids IS NULL OR s.id <> ALL (v_incoming_ids))
      AND NOT EXISTS (
          SELECT 1 FROM public.facturas f
          WHERE f.id_sucursal = s.id
      );
END;
$$;
