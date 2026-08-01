


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."grado_licencia" AS ENUM (
    '2da',
    '3ra',
    '4ta',
    '5ta'
);


ALTER TYPE "public"."grado_licencia" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."actualizar_cliente"("p_id_cliente" "uuid", "p_id_prefijo" "uuid", "p_numero_doc" character varying, "p_nombre_comercial" character varying, "p_telefono" character varying, "p_correo" "text", "p_persona_contacto" character varying, "p_id_prioridad" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."actualizar_cliente"("p_id_cliente" "uuid", "p_id_prefijo" "uuid", "p_numero_doc" character varying, "p_nombre_comercial" character varying, "p_telefono" character varying, "p_correo" "text", "p_persona_contacto" character varying, "p_id_prioridad" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."actualizar_vehiculo"("p_id_vehiculo" "uuid", "p_placa" character varying, "p_marca" character varying, "p_modelo" character varying, "p_anio" integer, "p_tipo_nombre" character varying, "p_caja_nombre" character varying, "p_capacidad_pallets" integer, "p_peso_maximo" numeric, "p_estado_nombre" character varying, "p_imagen_url" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_id_tipo_vehiculo uuid;
    v_id_tipo_caja uuid;
    v_id_estado_vehiculo uuid;
BEGIN
    SELECT id_tipo_vehiculo INTO v_id_tipo_vehiculo
    FROM public.tipos_vehiculos WHERE LOWER(nombre_tipo) = LOWER(p_tipo_nombre);

    SELECT id_tipo_caja INTO v_id_tipo_caja
    FROM public.tipos_cajas WHERE LOWER(nombre_caja) = LOWER(p_caja_nombre);

    SELECT id_estado_vehiculo INTO v_id_estado_vehiculo
    FROM public.estados_vehiculos WHERE LOWER(nombre_estado) = LOWER(p_estado_nombre);

    UPDATE public.vehiculos SET
        placa = UPPER(p_placa),
        marca = p_marca,
        modelo = p_modelo,
        anio = p_anio,
        id_tipo_vehiculo = v_id_tipo_vehiculo,
        id_tipo_caja = v_id_tipo_caja,
        capacidad_pallets = p_capacidad_pallets,
        peso_maximo = p_peso_maximo,
        id_estado_vehiculo = v_id_estado_vehiculo,
        imagen_url = COALESCE(p_imagen_url, imagen_url)
    WHERE id_vehiculo = p_id_vehiculo;
END;
$$;


ALTER FUNCTION "public"."actualizar_vehiculo"("p_id_vehiculo" "uuid", "p_placa" character varying, "p_marca" character varying, "p_modelo" character varying, "p_anio" integer, "p_tipo_nombre" character varying, "p_caja_nombre" character varying, "p_capacidad_pallets" integer, "p_peso_maximo" numeric, "p_estado_nombre" character varying, "p_imagen_url" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cambiar_estado_factura"("p_id_factura" "uuid", "p_estado_nuevo" character varying, "p_id_usuario" "uuid", "p_observacion" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_id_estado_anterior uuid;
    v_nombre_anterior    varchar(50);
    v_id_estado_nuevo    uuid;
    v_historial_id       uuid;
BEGIN
    -- Lock row to prevent race conditions
    SELECT f.id_estado, e.nombre_estado
      INTO v_id_estado_anterior, v_nombre_anterior
    FROM public.facturas f
    JOIN public.estados e ON f.id_estado = e.id_estado
    WHERE f.id_factura = p_id_factura
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Factura no encontrada'
            USING ERRCODE = 'P0002';
    END IF;

    -- Lookup new estado id
    SELECT e.id_estado INTO v_id_estado_nuevo
    FROM public.estados e
    WHERE e.nombre_estado = p_estado_nuevo;

    IF v_id_estado_nuevo IS NULL THEN
        RAISE EXCEPTION 'Estado "%" no encontrado', p_estado_nuevo
            USING ERRCODE = 'P0002';
    END IF;

    -- Validate transition
    IF NOT public.es_transicion_valida_factura(v_nombre_anterior, p_estado_nuevo) THEN
        RAISE EXCEPTION 'Transición inválida: % → %', v_nombre_anterior, p_estado_nuevo
            USING ERRCODE = 'P0003';
    END IF;

    -- Insert historial entry
    INSERT INTO public.historial_estados_factura
        (id_factura, id_estado_anterior, id_estado_nuevo, id_usuario, observacion)
    VALUES
        (p_id_factura, v_id_estado_anterior, v_id_estado_nuevo, p_id_usuario, p_observacion)
    RETURNING id_historial INTO v_historial_id;

    -- Update current state on factura
    UPDATE public.facturas
    SET id_estado = v_id_estado_nuevo
    WHERE id_factura = p_id_factura;

    RETURN jsonb_build_object(
        'ok', true,
        'id_historial', v_historial_id,
        'id_estado_anterior', v_id_estado_anterior,
        'id_estado_nuevo', v_id_estado_nuevo
    );
END;
$$;


ALTER FUNCTION "public"."cambiar_estado_factura"("p_id_factura" "uuid", "p_estado_nuevo" character varying, "p_id_usuario" "uuid", "p_observacion" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."crear_cliente"("p_id_prefijo" "uuid", "p_numero_doc" character varying, "p_nombre_comercial" character varying, "p_telefono" character varying, "p_correo" "text", "p_persona_contacto" character varying, "p_id_prioridad" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."crear_cliente"("p_id_prefijo" "uuid", "p_numero_doc" character varying, "p_nombre_comercial" character varying, "p_telefono" character varying, "p_correo" "text", "p_persona_contacto" character varying, "p_id_prioridad" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."crear_vehiculo"("p_placa" character varying, "p_marca" character varying, "p_modelo" character varying, "p_anio" integer, "p_tipo_nombre" character varying, "p_caja_nombre" character varying, "p_peso_maximo" numeric, "p_capacidad_pallets" integer DEFAULT 0, "p_estado_nombre" character varying DEFAULT 'OPERATIVO'::character varying, "p_imagen_url" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_id_vehiculo uuid;
    v_id_tipo_vehiculo uuid;
    v_id_tipo_caja uuid;
    v_id_estado_vehiculo uuid;
BEGIN
    SELECT id_tipo_vehiculo INTO v_id_tipo_vehiculo
    FROM public.tipos_vehiculos WHERE LOWER(nombre_tipo) = LOWER(p_tipo_nombre);

    SELECT id_tipo_caja INTO v_id_tipo_caja
    FROM public.tipos_cajas WHERE LOWER(nombre_caja) = LOWER(p_caja_nombre);

    SELECT id_estado_vehiculo INTO v_id_estado_vehiculo
    FROM public.estados_vehiculos WHERE LOWER(nombre_estado) = LOWER(p_estado_nombre);

    INSERT INTO public.vehiculos (
        placa, marca, modelo, anio,
        id_tipo_vehiculo, id_tipo_caja,
        capacidad_pallets, peso_maximo,
        id_estado_vehiculo, imagen_url
    ) VALUES (
        UPPER(p_placa), p_marca, p_modelo, p_anio,
        v_id_tipo_vehiculo, v_id_tipo_caja,
        p_capacidad_pallets, p_peso_maximo,
        v_id_estado_vehiculo, p_imagen_url
    )
    RETURNING id_vehiculo INTO v_id_vehiculo;

    RETURN v_id_vehiculo;
END;
$$;


ALTER FUNCTION "public"."crear_vehiculo"("p_placa" character varying, "p_marca" character varying, "p_modelo" character varying, "p_anio" integer, "p_tipo_nombre" character varying, "p_caja_nombre" character varying, "p_peso_maximo" numeric, "p_capacidad_pallets" integer, "p_estado_nombre" character varying, "p_imagen_url" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."crear_viaje"("p_id_chofer" "uuid", "p_id_vehiculo" "text", "p_municipio" "text", "p_ids_guias" "uuid"[], "p_distancia_total_km" numeric DEFAULT NULL::numeric, "p_duracion_total_min" numeric DEFAULT NULL::numeric) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_id_viaje UUID;
    v_id_estado_embarque UUID;
    v_id_estado_nuevo UUID;
    v_orden INTEGER;
    v_guia_id UUID;
    v_total_guias INTEGER;
BEGIN
    SELECT id_estado INTO v_id_estado_embarque FROM estados WHERE nombre_estado = 'embarque';
    SELECT id_estado INTO v_id_estado_nuevo FROM estados WHERE nombre_estado = 'nuevo';

    IF v_id_estado_embarque IS NULL THEN
        RAISE EXCEPTION 'Estado "embarque" no encontrado en la tabla estados';
    END IF;

    INSERT INTO viajes (id_chofer, id_vehiculo, municipio, distancia_total_km, duracion_total_min)
    VALUES (p_id_chofer, p_id_vehiculo, p_municipio, p_distancia_total_km, p_duracion_total_min)
    RETURNING id_viaje INTO v_id_viaje;

    v_total_guias := 0;
    v_orden := 0;

    FOREACH v_guia_id IN ARRAY p_ids_guias
    LOOP
        v_orden := v_orden + 1;

        INSERT INTO itinerario_viaje (id_viaje, id_guia, orden)
        VALUES (v_id_viaje, v_guia_id, v_orden);

        UPDATE facturas
        SET id_estado = v_id_estado_embarque
        WHERE id_guia = v_guia_id AND id_estado = v_id_estado_nuevo;

        IF FOUND THEN
            v_total_guias := v_total_guias + 1;
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'id_viaje', v_id_viaje,
        'total_guias', v_total_guias,
        'id_chofer', p_id_chofer,
        'municipio', p_municipio
    );
END;
$$;


ALTER FUNCTION "public"."crear_viaje"("p_id_chofer" "uuid", "p_id_vehiculo" "text", "p_municipio" "text", "p_ids_guias" "uuid"[], "p_distancia_total_km" numeric, "p_duracion_total_min" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."eliminar_cliente"("p_id_cliente" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
    DELETE FROM public.clientes WHERE id_cliente = p_id_cliente;
END;
$$;


ALTER FUNCTION "public"."eliminar_cliente"("p_id_cliente" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."eliminar_vehiculo"("p_id_vehiculo" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
    DELETE FROM public.vehiculos WHERE id_vehiculo = p_id_vehiculo;
END;
$$;


ALTER FUNCTION "public"."eliminar_vehiculo"("p_id_vehiculo" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."es_transicion_valida_factura"("p_anterior" character varying, "p_nuevo" character varying) RETURNS boolean
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $$
BEGIN
    IF p_anterior IS NULL THEN
        RETURN p_nuevo = 'nuevo';
    END IF;

    RETURN CASE p_anterior
        WHEN 'nuevo'       THEN p_nuevo IN ('embarque', 'incidencia')
        WHEN 'embarque'    THEN p_nuevo IN ('proceso', 'incidencia')
        WHEN 'proceso'     THEN p_nuevo IN ('espera', 'incidencia')
        WHEN 'espera'      THEN p_nuevo IN ('finalizado', 'incidencia')
        WHEN 'incidencia'  THEN p_nuevo IN ('proceso', 'espera')
        WHEN 'finalizado'  THEN false
        ELSE false
    END;
END;
$$;


ALTER FUNCTION "public"."es_transicion_valida_factura"("p_anterior" character varying, "p_nuevo" character varying) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_role_name"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT r.nombre_rol::text
  FROM public.usuarios u
  JOIN public.roles r ON r.id_rol = u.id_rol
  WHERE u.id_usuario = auth.uid()
  LIMIT 1;
$$;


ALTER FUNCTION "public"."get_user_role_name"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guardar_sucursales_cliente"("p_cliente_id" "uuid", "p_sucursales" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."guardar_sucursales_cliente"("p_cliente_id" "uuid", "p_sucursales" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  default_role_id uuid;
BEGIN
  SELECT id_rol INTO default_role_id 
  FROM public.roles 
  WHERE nombre_rol = COALESCE(new.raw_user_meta_data->>'nombre_rol', 'Chofer') 
  LIMIT 1;

  INSERT INTO public.usuarios (id_usuario, email, id_rol, nombre_completo, cedula, prefijo_doc)
  VALUES (
    new.id,
    new.email,
    default_role_id,
    COALESCE(new.raw_user_meta_data->>'nombre_completo', 'Usuario Nuevo'),
    (new.raw_user_meta_data->>'cedula')::integer,
    COALESCE(new.raw_user_meta_data->>'prefijo_doc', 'V')
  );
  return new;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."obtener_catalogos_vehiculos"() RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_tipos json;
    v_cajas json;
    v_estados json;
BEGIN
    SELECT json_agg(json_build_object('label',
        CASE LOWER(tv.nombre_tipo)
            WHEN 'carro' THEN 'Automóvil'
            WHEN 'moto' THEN 'Motocicleta'
            WHEN 'camion' THEN 'Camión de Carga'
            ELSE tv.nombre_tipo
        END, 'value', tv.nombre_tipo) ORDER BY tv.nombre_tipo)
    INTO v_tipos
    FROM public.tipos_vehiculos tv;

    SELECT json_agg(json_build_object('label',
        CASE LOWER(tc.nombre_caja)
            WHEN 'seca' THEN 'Caja Seca'
            WHEN 'plataforma' THEN 'Plataforma Abierta'
            WHEN 'refrigerado' THEN 'Refrigerados'
            WHEN 'articulado' THEN 'Articulado'
            ELSE tc.nombre_caja
        END, 'value', tc.nombre_caja) ORDER BY tc.nombre_caja)
    INTO v_cajas
    FROM public.tipos_cajas tc;

    SELECT json_agg(json_build_object('label',
        CASE LOWER(ev.nombre_estado)
            WHEN 'operativo' THEN 'Operativo'
            WHEN 'mantenimiento' THEN 'En Mantenimiento'
            WHEN 'inactivo' THEN 'Inactivo'
            ELSE ev.nombre_estado
        END, 'value', ev.nombre_estado) ORDER BY ev.nombre_estado)
    INTO v_estados
    FROM public.estados_vehiculos ev;

    RETURN json_build_object(
        'tiposVehiculo', COALESCE(v_tipos, '[]'::json),
        'tiposCaja', COALESCE(v_cajas, '[]'::json),
        'estados', COALESCE(v_estados, '[]'::json)
    );
END;
$$;


ALTER FUNCTION "public"."obtener_catalogos_vehiculos"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."obtener_choferes"() RETURNS TABLE("id_usuario" "uuid", "nombre_completo" character varying, "cedula" integer, "prefijo_doc" character, "nombre_rol" character varying, "certificado_numero" character varying, "certificado_expedicion" "date", "certificado_vencimiento" "date", "licencia_numero" character varying, "licencia_grado" character varying, "licencia_expedicion" "date", "licencia_vencimiento" "date")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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
    WHERE r.nombre_rol IN ('chofer', 'ayudante')
    ORDER BY u.nombre_completo;
END;
$$;


ALTER FUNCTION "public"."obtener_choferes"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."obtener_clientes"() RETURNS TABLE("id_cliente" "uuid", "nombre_comercial" character varying, "prefijo" character, "numero_doc" character varying, "telefono" character varying, "correo" "text", "persona_contacto" character varying, "id_prioridad" "uuid", "nombre_prioridad" character varying)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."obtener_clientes"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."obtener_datos_adicionales_usuarios"("usuario_ids" "uuid"[]) RETURNS TABLE("usuario_id" "uuid", "licencia_numero" character varying, "licencia_grado" character varying, "licencia_expedicion" "date", "licencia_vencimiento" "date", "certificado_numero" character varying, "certificado_expedicion" "date", "certificado_vencimiento" "date", "prefijo_doc" character)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        u.id_usuario,
        lc.licencia_numero,
        lc.licencia_grado::varchar,
        lc.licencia_expedicion,
        lc.licencia_vencimiento,
        cm.certificado_numero,
        cm.certificado_expedicion,
        cm.certificado_vencimiento,
        u.prefijo_doc
    FROM usuarios u
    LEFT JOIN licencias_conducir lc ON lc.usuario_id = u.id_usuario
    LEFT JOIN certificados_medicos cm ON cm.usuario_id = u.id_usuario
    WHERE u.id_usuario = ANY(usuario_ids);
END;
$$;


ALTER FUNCTION "public"."obtener_datos_adicionales_usuarios"("usuario_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."obtener_historial_estados_factura"("p_id_factura" "uuid") RETURNS TABLE("id_historial" "uuid", "estado_anterior" character varying, "estado_nuevo" character varying, "nombre_usuario" character varying, "observacion" "text", "fecha_cambio" timestamp with time zone)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
    RETURN QUERY
    SELECT h.id_historial,
           ea.nombre_estado AS estado_anterior,
           en.nombre_estado AS estado_nuevo,
           u.nombre_completo AS nombre_usuario,
           h.observacion,
           h.fecha_cambio
    FROM public.historial_estados_factura h
    LEFT JOIN public.estados ea ON h.id_estado_anterior = ea.id_estado
    JOIN public.estados en ON h.id_estado_nuevo = en.id_estado
    LEFT JOIN public.usuarios u ON h.id_usuario = u.id_usuario
    WHERE h.id_factura = p_id_factura
    ORDER BY h.fecha_cambio DESC;
END;
$$;


ALTER FUNCTION "public"."obtener_historial_estados_factura"("p_id_factura" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."obtener_municipios"() RETURNS TABLE("id_municipio" "uuid", "nombre" character varying, "capital" character varying)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    SELECT id_municipio, nombre, capital
    FROM public.municipios
    ORDER BY nombre;
$$;


ALTER FUNCTION "public"."obtener_municipios"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."obtener_prefijos_documento"() RETURNS TABLE("id_prefijo" "uuid", "prefijo" character varying, "descripcion" character varying)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    SELECT id_prefijo, prefijo, descripcion
    FROM public.prefijos_documento
    ORDER BY prefijo;
$$;


ALTER FUNCTION "public"."obtener_prefijos_documento"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."obtener_prioridades_clientes"() RETURNS TABLE("id_prioridad" "uuid", "nombre_prioridad" character varying)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    SELECT id_prioridad, nombre_prioridad
    FROM public.prioridades_clientes
    ORDER BY nombre_prioridad;
$$;


ALTER FUNCTION "public"."obtener_prioridades_clientes"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."obtener_sucursales_cliente"("p_cliente_id" "uuid") RETURNS TABLE("id" "uuid", "direccion" "text", "punto_de_referencia" "text", "telefono_contacto" character varying, "nombre_contacto" "text", "instruccion_nota" "text", "cita" boolean, "dias_semana" "text", "hora_desde" time without time zone, "hora_hasta" time without time zone, "id_municipio" "uuid", "latitud" double precision, "longitud" double precision)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."obtener_sucursales_cliente"("p_cliente_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."obtener_vehiculos"() RETURNS TABLE("id_vehiculo" "uuid", "placa" character varying, "marca" character varying, "modelo" character varying, "anio" integer, "tipo_nombre" character varying, "caja_nombre" character varying, "capacidad_pallets" integer, "peso_maximo" numeric, "estado_nombre" character varying, "imagen_url" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
    RETURN QUERY
    SELECT
        v.id_vehiculo,
        v.placa::varchar,
        v.marca::varchar,
        v.modelo::varchar,
        v.anio,
        tv.nombre_tipo::varchar,
        tc.nombre_caja::varchar,
        v.capacidad_pallets,
        v.peso_maximo,
        ev.nombre_estado::varchar,
        v.imagen_url
    FROM public.vehiculos v
    JOIN public.tipos_vehiculos tv ON v.id_tipo_vehiculo = tv.id_tipo_vehiculo
    JOIN public.tipos_cajas tc ON v.id_tipo_caja = tc.id_tipo_caja
    JOIN public.estados_vehiculos ev ON v.id_estado_vehiculo = ev.id_estado_vehiculo
    ORDER BY v.placa;
END;
$$;


ALTER FUNCTION "public"."obtener_vehiculos"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."certificados_medicos" (
    "usuario_id" "uuid" NOT NULL,
    "certificado_numero" character varying(50) NOT NULL,
    "certificado_vencimiento" "date" NOT NULL,
    "certificado_expedicion" "date"
);


ALTER TABLE "public"."certificados_medicos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."clientes" (
    "id_cliente" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "nombre_comercial" character varying(150) NOT NULL,
    "id_prioridad" "uuid" NOT NULL,
    "correo" "text",
    "persona_contacto" "text",
    "telefono" character varying(20),
    "id_prefijo" "uuid",
    "prefijo_doc" character(1) DEFAULT 'J'::"bpchar" NOT NULL,
    "numero_doc" character varying(20) DEFAULT ''::character varying NOT NULL,
    CONSTRAINT "clientes_prefijo_doc_check" CHECK (("prefijo_doc" = ANY (ARRAY['V'::"bpchar", 'E'::"bpchar", 'J'::"bpchar", 'P'::"bpchar", 'G'::"bpchar"])))
);


ALTER TABLE "public"."clientes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."empresas" (
    "id_empresa" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "empresa" "text" NOT NULL
);


ALTER TABLE "public"."empresas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."estados" (
    "id_estado" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nombre_estado" character varying(50) NOT NULL,
    "descripcion" "text"
);


ALTER TABLE "public"."estados" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."estados_vehiculos" (
    "id_estado_vehiculo" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "nombre_estado" character varying(50) NOT NULL
);


ALTER TABLE "public"."estados_vehiculos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."facturas" (
    "id_factura" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "id_guia" "uuid" NOT NULL,
    "num_factura" character varying(100) NOT NULL,
    "id_sucursal" "uuid" NOT NULL,
    "monto_dolares" numeric(12,2) DEFAULT 0.00 NOT NULL,
    "monto_bss" numeric(10,2) DEFAULT 0.00 NOT NULL,
    "incidencia" "uuid",
    "id_estado" "uuid" NOT NULL
);


ALTER TABLE "public"."facturas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."guias_carga" (
    "id_guia" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "fecha_despacho" "date" DEFAULT CURRENT_DATE NOT NULL,
    "id_vehiculo" "uuid" NOT NULL,
    "id_chofer" "uuid" NOT NULL,
    "id_ayudante" "uuid",
    "id_analista" "uuid" NOT NULL,
    "id_empresa" "uuid" DEFAULT "gen_random_uuid"(),
    "id_municipio" "uuid" NOT NULL,
    "observaciones" "text",
    "fecha_registro" timestamp with time zone DEFAULT "now"() NOT NULL,
    "codigo_guia" "text" NOT NULL
);


ALTER TABLE "public"."guias_carga" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."historial_estados_factura" (
    "id_historial" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "id_factura" "uuid" NOT NULL,
    "id_estado_anterior" "uuid",
    "id_estado_nuevo" "uuid" NOT NULL,
    "id_usuario" "uuid",
    "observacion" "text",
    "fecha_cambio" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."historial_estados_factura" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."incidencias" (
    "id_incidencia" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "id_detalle_guia" "uuid" NOT NULL,
    "tipo_incidencia" character varying(100) NOT NULL,
    "descripcion" "text" NOT NULL,
    "foto_evidencia_url" "text",
    "hora_reporte" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE "public"."incidencias" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."itinerario_viaje" (
    "id_parada" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "id_viaje" "uuid" NOT NULL,
    "id_factura" "uuid" NOT NULL,
    "orden_visita" integer NOT NULL,
    "estimado_arribo" time without time zone
);


ALTER TABLE "public"."itinerario_viaje" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."licencias_conducir" (
    "usuario_id" "uuid" NOT NULL,
    "licencia_numero" character varying(50) NOT NULL,
    "licencia_grado" "public"."grado_licencia" NOT NULL,
    "licencia_vencimiento" "date" NOT NULL,
    "licencia_expedicion" "date"
);


ALTER TABLE "public"."licencias_conducir" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."municipios" (
    "id_municipio" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nombre" character varying(100) NOT NULL,
    "capital" character varying(100) NOT NULL,
    "dia_salida_num" smallint
);


ALTER TABLE "public"."municipios" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."municipios_cronograma" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "id_municipio" "uuid" NOT NULL,
    "dia_semana" integer NOT NULL,
    "orden" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "municipios_cronograma_dia_semana_check" CHECK ((("dia_semana" >= 1) AND ("dia_semana" <= 7)))
);


ALTER TABLE "public"."municipios_cronograma" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."prefijos_documento" (
    "id_prefijo" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "prefijo" character varying(1) NOT NULL,
    "descripcion" character varying(50) NOT NULL
);


ALTER TABLE "public"."prefijos_documento" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."prioridades_clientes" (
    "id_prioridad" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "nombre_prioridad" character varying(50) NOT NULL
);


ALTER TABLE "public"."prioridades_clientes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."roles" (
    "id_rol" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "nombre_rol" character varying(50) NOT NULL
);


ALTER TABLE "public"."roles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sucursales_cliente" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cliente_id" "uuid",
    "punto_de_referencia" character varying(100) NOT NULL,
    "direccion" "text" NOT NULL,
    "telefono_contacto" character varying(20),
    "nombre_contacto" "text",
    "instruccion_nota" "text",
    "cita" boolean,
    "dias_semana" "text",
    "id_municipio" "uuid",
    "latitud" double precision,
    "longitud" double precision,
    "hora_desde" time without time zone,
    "hora_hasta" time without time zone
);


ALTER TABLE "public"."sucursales_cliente" OWNER TO "postgres";


COMMENT ON COLUMN "public"."sucursales_cliente"."cita" IS 'un dato booleano que indica si el cliente requiere cita previa antes del envio';



COMMENT ON COLUMN "public"."sucursales_cliente"."dias_semana" IS 'selecion de un dia de la semana para el dia de entrega de mercancia';



CREATE TABLE IF NOT EXISTS "public"."tipos_cajas" (
    "id_tipo_caja" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "nombre_caja" character varying(50) NOT NULL
);


ALTER TABLE "public"."tipos_cajas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tipos_vehiculos" (
    "id_tipo_vehiculo" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "nombre_tipo" character varying(50) NOT NULL
);


ALTER TABLE "public"."tipos_vehiculos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."usuarios" (
    "id_usuario" "uuid" NOT NULL,
    "email" character varying NOT NULL,
    "id_rol" "uuid" NOT NULL,
    "nombre_completo" character varying(150) NOT NULL,
    "cedula" integer NOT NULL,
    "activo" boolean DEFAULT true NOT NULL,
    "prefijo_doc" character(1) DEFAULT 'V'::"bpchar" NOT NULL,
    CONSTRAINT "usuarios_prefijo_doc_check" CHECK (("prefijo_doc" = ANY (ARRAY['V'::"bpchar", 'E'::"bpchar", 'J'::"bpchar", 'P'::"bpchar", 'G'::"bpchar"])))
);


ALTER TABLE "public"."usuarios" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vehiculos" (
    "id_vehiculo" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "placa" character varying(20) NOT NULL,
    "marca" character varying(50) NOT NULL,
    "modelo" character varying(50) NOT NULL,
    "anio" integer NOT NULL,
    "id_tipo_vehiculo" "uuid" NOT NULL,
    "id_tipo_caja" "uuid" DEFAULT '4c50b09d-82c5-40f3-877a-729df9e400c7'::"uuid" NOT NULL,
    "capacidad_pallets" integer DEFAULT 0,
    "peso_maximo" numeric(10,2) NOT NULL,
    "id_estado_vehiculo" "uuid" NOT NULL,
    "imagen_url" "text"
);


ALTER TABLE "public"."vehiculos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."viajes" (
    "id_viaje" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "id_chofer" "uuid" NOT NULL,
    "id_vehiculo" "uuid" NOT NULL,
    "id_ayudante" "uuid",
    "fecha_viaje" "date" DEFAULT CURRENT_DATE NOT NULL,
    "estado_viaje" character varying(50) DEFAULT 'PROGRAMADO'::character varying NOT NULL,
    "observaciones" "text",
    "mapa_polyline" "text",
    "fecha_registro" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."viajes" OWNER TO "postgres";


ALTER TABLE ONLY "public"."certificados_medicos"
    ADD CONSTRAINT "certificados_medicos_certificado_numero_key" UNIQUE ("certificado_numero");



ALTER TABLE ONLY "public"."certificados_medicos"
    ADD CONSTRAINT "certificados_medicos_pkey" PRIMARY KEY ("usuario_id");



ALTER TABLE ONLY "public"."clientes"
    ADD CONSTRAINT "clientes_pkey" PRIMARY KEY ("id_cliente");



ALTER TABLE ONLY "public"."guias_carga"
    ADD CONSTRAINT "despachos_pkey" PRIMARY KEY ("id_guia");



ALTER TABLE ONLY "public"."facturas"
    ADD CONSTRAINT "detalle_guia_despacho_pkey" PRIMARY KEY ("id_factura");



ALTER TABLE ONLY "public"."empresas"
    ADD CONSTRAINT "empresa_pkey" PRIMARY KEY ("id_empresa");



ALTER TABLE ONLY "public"."estados"
    ADD CONSTRAINT "estados_nombre_estado_key" UNIQUE ("nombre_estado");



ALTER TABLE ONLY "public"."estados"
    ADD CONSTRAINT "estados_pkey" PRIMARY KEY ("id_estado");



ALTER TABLE ONLY "public"."estados_vehiculos"
    ADD CONSTRAINT "estados_vehiculos_nombre_estado_key" UNIQUE ("nombre_estado");



ALTER TABLE ONLY "public"."estados_vehiculos"
    ADD CONSTRAINT "estados_vehiculos_pkey" PRIMARY KEY ("id_estado_vehiculo");



ALTER TABLE ONLY "public"."historial_estados_factura"
    ADD CONSTRAINT "historial_estados_factura_pkey" PRIMARY KEY ("id_historial");



ALTER TABLE ONLY "public"."incidencias"
    ADD CONSTRAINT "incidencias_pkey" PRIMARY KEY ("id_incidencia");



ALTER TABLE ONLY "public"."itinerario_viaje"
    ADD CONSTRAINT "itinerario_viaje_pkey" PRIMARY KEY ("id_parada");



ALTER TABLE ONLY "public"."licencias_conducir"
    ADD CONSTRAINT "licencias_conducir_licencia_numero_key" UNIQUE ("licencia_numero");



ALTER TABLE ONLY "public"."licencias_conducir"
    ADD CONSTRAINT "licencias_conducir_pkey" PRIMARY KEY ("usuario_id");



ALTER TABLE ONLY "public"."municipios_cronograma"
    ADD CONSTRAINT "municipios_cronograma_id_municipio_dia_semana_key" UNIQUE ("id_municipio", "dia_semana");



ALTER TABLE ONLY "public"."municipios_cronograma"
    ADD CONSTRAINT "municipios_cronograma_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."municipios"
    ADD CONSTRAINT "municipios_nombre_key" UNIQUE ("nombre");



ALTER TABLE ONLY "public"."municipios"
    ADD CONSTRAINT "municipios_pkey" PRIMARY KEY ("id_municipio");



ALTER TABLE ONLY "public"."prefijos_documento"
    ADD CONSTRAINT "prefijos_documento_pkey" PRIMARY KEY ("id_prefijo");



ALTER TABLE ONLY "public"."prefijos_documento"
    ADD CONSTRAINT "prefijos_documento_prefijo_key" UNIQUE ("prefijo");



ALTER TABLE ONLY "public"."prioridades_clientes"
    ADD CONSTRAINT "prioridades_clientes_nombre_prioridad_key" UNIQUE ("nombre_prioridad");



ALTER TABLE ONLY "public"."prioridades_clientes"
    ADD CONSTRAINT "prioridades_clientes_pkey" PRIMARY KEY ("id_prioridad");



ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_nombre_rol_key" UNIQUE ("nombre_rol");



ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_pkey" PRIMARY KEY ("id_rol");



ALTER TABLE ONLY "public"."sucursales_cliente"
    ADD CONSTRAINT "sucursales_cliente_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tipos_cajas"
    ADD CONSTRAINT "tipos_cajas_nombre_caja_key" UNIQUE ("nombre_caja");



ALTER TABLE ONLY "public"."tipos_cajas"
    ADD CONSTRAINT "tipos_cajas_pkey" PRIMARY KEY ("id_tipo_caja");



ALTER TABLE ONLY "public"."tipos_vehiculos"
    ADD CONSTRAINT "tipos_vehiculos_nombre_tipo_key" UNIQUE ("nombre_tipo");



ALTER TABLE ONLY "public"."tipos_vehiculos"
    ADD CONSTRAINT "tipos_vehiculos_pkey" PRIMARY KEY ("id_tipo_vehiculo");



ALTER TABLE ONLY "public"."usuarios"
    ADD CONSTRAINT "usuarios_cedula_key" UNIQUE ("cedula");



ALTER TABLE ONLY "public"."usuarios"
    ADD CONSTRAINT "usuarios_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."usuarios"
    ADD CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id_usuario");



ALTER TABLE ONLY "public"."vehiculos"
    ADD CONSTRAINT "vehiculos_pkey" PRIMARY KEY ("id_vehiculo");



ALTER TABLE ONLY "public"."vehiculos"
    ADD CONSTRAINT "vehiculos_placa_key" UNIQUE ("placa");



ALTER TABLE ONLY "public"."viajes"
    ADD CONSTRAINT "viajes_pkey" PRIMARY KEY ("id_viaje");



CREATE INDEX "idx_historial_factura_fecha" ON "public"."historial_estados_factura" USING "btree" ("id_factura", "fecha_cambio" DESC);



CREATE INDEX "idx_itinerario_viaje_orden" ON "public"."itinerario_viaje" USING "btree" ("id_viaje", "orden_visita");



ALTER TABLE ONLY "public"."guias_carga"
    ADD CONSTRAINT "asignacion_carga_id_municipio_fkey" FOREIGN KEY ("id_municipio") REFERENCES "public"."municipios"("id_municipio");



ALTER TABLE ONLY "public"."certificados_medicos"
    ADD CONSTRAINT "certificados_medicos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id_usuario") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."clientes"
    ADD CONSTRAINT "clientes_id_prefijo_fkey" FOREIGN KEY ("id_prefijo") REFERENCES "public"."prefijos_documento"("id_prefijo") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."clientes"
    ADD CONSTRAINT "clientes_id_prioridad_fkey" FOREIGN KEY ("id_prioridad") REFERENCES "public"."prioridades_clientes"("id_prioridad") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."guias_carga"
    ADD CONSTRAINT "despachos_id_analista_fkey" FOREIGN KEY ("id_analista") REFERENCES "public"."usuarios"("id_usuario") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."guias_carga"
    ADD CONSTRAINT "despachos_id_ayudante_fkey" FOREIGN KEY ("id_ayudante") REFERENCES "public"."usuarios"("id_usuario") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."guias_carga"
    ADD CONSTRAINT "despachos_id_chofer_fkey" FOREIGN KEY ("id_chofer") REFERENCES "public"."usuarios"("id_usuario") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."guias_carga"
    ADD CONSTRAINT "despachos_id_empresa_fkey" FOREIGN KEY ("id_empresa") REFERENCES "public"."empresas"("id_empresa");



ALTER TABLE ONLY "public"."guias_carga"
    ADD CONSTRAINT "despachos_id_vehiculo_fkey" FOREIGN KEY ("id_vehiculo") REFERENCES "public"."vehiculos"("id_vehiculo") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."facturas"
    ADD CONSTRAINT "factura_id_guia_fkey" FOREIGN KEY ("id_guia") REFERENCES "public"."guias_carga"("id_guia");



ALTER TABLE ONLY "public"."facturas"
    ADD CONSTRAINT "factura_id_sucursal_fkey" FOREIGN KEY ("id_sucursal") REFERENCES "public"."sucursales_cliente"("id");



ALTER TABLE ONLY "public"."facturas"
    ADD CONSTRAINT "factura_incidencia_fkey" FOREIGN KEY ("incidencia") REFERENCES "public"."incidencias"("id_incidencia");



ALTER TABLE ONLY "public"."facturas"
    ADD CONSTRAINT "facturas_id_estado_fkey" FOREIGN KEY ("id_estado") REFERENCES "public"."estados"("id_estado");



ALTER TABLE ONLY "public"."historial_estados_factura"
    ADD CONSTRAINT "historial_estados_factura_id_estado_anterior_fkey" FOREIGN KEY ("id_estado_anterior") REFERENCES "public"."estados"("id_estado");



ALTER TABLE ONLY "public"."historial_estados_factura"
    ADD CONSTRAINT "historial_estados_factura_id_estado_nuevo_fkey" FOREIGN KEY ("id_estado_nuevo") REFERENCES "public"."estados"("id_estado");



ALTER TABLE ONLY "public"."historial_estados_factura"
    ADD CONSTRAINT "historial_estados_factura_id_factura_fkey" FOREIGN KEY ("id_factura") REFERENCES "public"."facturas"("id_factura") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."historial_estados_factura"
    ADD CONSTRAINT "historial_estados_factura_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "public"."usuarios"("id_usuario") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."itinerario_viaje"
    ADD CONSTRAINT "itinerario_id_factura_fkey" FOREIGN KEY ("id_factura") REFERENCES "public"."facturas"("id_factura") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."itinerario_viaje"
    ADD CONSTRAINT "itinerario_id_viaje_fkey" FOREIGN KEY ("id_viaje") REFERENCES "public"."viajes"("id_viaje") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."licencias_conducir"
    ADD CONSTRAINT "licencias_conducir_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id_usuario") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."municipios_cronograma"
    ADD CONSTRAINT "municipios_cronograma_id_municipio_fkey" FOREIGN KEY ("id_municipio") REFERENCES "public"."municipios"("id_municipio") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sucursales_cliente"
    ADD CONSTRAINT "sucursales_cliente_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id_cliente") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sucursales_cliente"
    ADD CONSTRAINT "sucursales_cliente_id_municipio_fkey" FOREIGN KEY ("id_municipio") REFERENCES "public"."municipios"("id_municipio") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."usuarios"
    ADD CONSTRAINT "usuarios_id_rol_fkey" FOREIGN KEY ("id_rol") REFERENCES "public"."roles"("id_rol") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."usuarios"
    ADD CONSTRAINT "usuarios_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vehiculos"
    ADD CONSTRAINT "vehiculos_id_estado_vehiculo_fkey" FOREIGN KEY ("id_estado_vehiculo") REFERENCES "public"."estados_vehiculos"("id_estado_vehiculo") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."vehiculos"
    ADD CONSTRAINT "vehiculos_id_tipo_caja_fkey" FOREIGN KEY ("id_tipo_caja") REFERENCES "public"."tipos_cajas"("id_tipo_caja") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."vehiculos"
    ADD CONSTRAINT "vehiculos_id_tipo_vehiculo_fkey" FOREIGN KEY ("id_tipo_vehiculo") REFERENCES "public"."tipos_vehiculos"("id_tipo_vehiculo") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."viajes"
    ADD CONSTRAINT "viajes_id_ayudante_fkey" FOREIGN KEY ("id_ayudante") REFERENCES "public"."usuarios"("id_usuario") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."viajes"
    ADD CONSTRAINT "viajes_id_chofer_fkey" FOREIGN KEY ("id_chofer") REFERENCES "public"."usuarios"("id_usuario") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."viajes"
    ADD CONSTRAINT "viajes_id_vehiculo_fkey" FOREIGN KEY ("id_vehiculo") REFERENCES "public"."vehiculos"("id_vehiculo") ON DELETE RESTRICT;



CREATE POLICY "Admin y Analista pueden DELETE vehiculos" ON "public"."vehiculos" FOR DELETE TO "authenticated" USING ((("auth"."jwt"() ->> 'nombre_rol'::"text") = ANY (ARRAY['Administrador'::"text", 'Analista'::"text"])));



CREATE POLICY "Admin y Analista pueden INSERT vehiculos" ON "public"."vehiculos" FOR INSERT TO "authenticated" WITH CHECK ((("auth"."jwt"() ->> 'nombre_rol'::"text") = ANY (ARRAY['Administrador'::"text", 'Analista'::"text"])));



CREATE POLICY "Admin y Analista pueden SELECT vehiculos" ON "public"."vehiculos" FOR SELECT TO "authenticated" USING ((("auth"."jwt"() ->> 'nombre_rol'::"text") = ANY (ARRAY['Administrador'::"text", 'Analista'::"text"])));



CREATE POLICY "Admin y Analista pueden UPDATE vehiculos" ON "public"."vehiculos" FOR UPDATE TO "authenticated" USING ((("auth"."jwt"() ->> 'nombre_rol'::"text") = ANY (ARRAY['Administrador'::"text", 'Analista'::"text"]))) WITH CHECK ((("auth"."jwt"() ->> 'nombre_rol'::"text") = ANY (ARRAY['Administrador'::"text", 'Analista'::"text"])));



CREATE POLICY "Admin/Coord/Analista todo itinerario" ON "public"."itinerario_viaje" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."usuarios" "u"
     JOIN "public"."roles" "r" ON (("u"."id_rol" = "r"."id_rol")))
  WHERE (("u"."id_usuario" = "auth"."uid"()) AND (("r"."nombre_rol")::"text" = ANY ((ARRAY['Administrador'::character varying, 'Coordinador'::character varying, 'Analista'::character varying])::"text"[]))))));



CREATE POLICY "Admin/Coord/Analista todo viajes" ON "public"."viajes" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."usuarios" "u"
     JOIN "public"."roles" "r" ON (("u"."id_rol" = "r"."id_rol")))
  WHERE (("u"."id_usuario" = "auth"."uid"()) AND (("r"."nombre_rol")::"text" = ANY ((ARRAY['Administrador'::character varying, 'Coordinador'::character varying, 'Analista'::character varying])::"text"[]))))));



CREATE POLICY "Admins and Coordinators can view all" ON "public"."usuarios" FOR SELECT USING (("public"."get_user_role_name"() = ANY (ARRAY['administrador'::"text", 'coordinador'::"text"])));



CREATE POLICY "Admins and Coordinators can view certificados" ON "public"."certificados_medicos" FOR SELECT USING (("public"."get_user_role_name"() = ANY (ARRAY['administrador'::"text", 'coordinador'::"text"])));



CREATE POLICY "Admins and Coordinators can view licencias" ON "public"."licencias_conducir" FOR SELECT USING (("public"."get_user_role_name"() = ANY (ARRAY['administrador'::"text", 'coordinador'::"text"])));



CREATE POLICY "Admins can delete" ON "public"."usuarios" FOR DELETE USING (("public"."get_user_role_name"() = 'administrador'::"text"));



CREATE POLICY "Admins can insert" ON "public"."usuarios" FOR INSERT WITH CHECK (("public"."get_user_role_name"() = 'Administrador'::"text"));



CREATE POLICY "Admins can insert certificados" ON "public"."certificados_medicos" FOR INSERT WITH CHECK (((( SELECT "r"."nombre_rol"
   FROM ("public"."usuarios" "u"
     JOIN "public"."roles" "r" ON (("r"."id_rol" = "u"."id_rol")))
  WHERE ("u"."id_usuario" = "auth"."uid"())))::"text" = 'administrador'::"text"));



CREATE POLICY "Admins can insert licencias" ON "public"."licencias_conducir" FOR INSERT WITH CHECK (((( SELECT "r"."nombre_rol"
   FROM ("public"."usuarios" "u"
     JOIN "public"."roles" "r" ON (("r"."id_rol" = "u"."id_rol")))
  WHERE ("u"."id_usuario" = "auth"."uid"())))::"text" = 'administrador'::"text"));



CREATE POLICY "Admins can update" ON "public"."usuarios" FOR UPDATE USING (("public"."get_user_role_name"() = 'administrador'::"text"));



CREATE POLICY "Authenticated users can read empresas" ON "public"."empresas" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Chofer lectura itinerario" ON "public"."itinerario_viaje" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."viajes" "v"
  WHERE (("v"."id_viaje" = "itinerario_viaje"."id_viaje") AND ("v"."id_chofer" = "auth"."uid"())))));



CREATE POLICY "Chofer lectura viajes" ON "public"."viajes" FOR SELECT TO "authenticated" USING (("id_chofer" = "auth"."uid"()));



CREATE POLICY "INSERT desde RPC para historial_estados_factura" ON "public"."historial_estados_factura" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Permitir todo a usuarios autenticados en itinerario" ON "public"."itinerario_viaje" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Permitir todo a usuarios autenticados en viajes" ON "public"."viajes" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Roles visible for all authenticated" ON "public"."roles" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "SELECT para autenticados en estados_vehiculos" ON "public"."estados_vehiculos" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "SELECT para autenticados en historial_estados_factura" ON "public"."historial_estados_factura" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "SELECT para autenticados en tipos_cajas" ON "public"."tipos_cajas" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "SELECT para autenticados en tipos_vehiculos" ON "public"."tipos_vehiculos" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Solo analistas y administradores leen usuarios" ON "public"."usuarios" FOR SELECT USING (((("auth"."jwt"() -> 'user_metadata'::"text") ->> 'nombre_rol'::"text") = ANY (ARRAY['analista'::"text", 'administrador'::"text"])));



CREATE POLICY "Users can view own data" ON "public"."usuarios" FOR SELECT USING (("id_usuario" = "auth"."uid"()));



ALTER TABLE "public"."certificados_medicos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."clientes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "clientes_delete_policy" ON "public"."clientes" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "clientes_insert_policy" ON "public"."clientes" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "clientes_select_policy" ON "public"."clientes" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "clientes_update_policy" ON "public"."clientes" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "cronograma_delete" ON "public"."municipios_cronograma" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "cronograma_insert" ON "public"."municipios_cronograma" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "cronograma_select" ON "public"."municipios_cronograma" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "cronograma_update" ON "public"."municipios_cronograma" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."empresas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."estados_vehiculos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."facturas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "facturas_delete_policy" ON "public"."facturas" FOR DELETE TO "authenticated" USING ((COALESCE(("auth"."jwt"() ->> 'nombre_rol'::"text"), (("auth"."jwt"() -> 'user_metadata'::"text") ->> 'nombre_rol'::"text")) = ANY (ARRAY['Administrador'::"text", 'Analista'::"text"])));



CREATE POLICY "facturas_insert_policy" ON "public"."facturas" FOR INSERT TO "authenticated" WITH CHECK ((COALESCE(("auth"."jwt"() ->> 'nombre_rol'::"text"), (("auth"."jwt"() -> 'user_metadata'::"text") ->> 'nombre_rol'::"text")) = ANY (ARRAY['Administrador'::"text", 'Analista'::"text"])));



CREATE POLICY "facturas_select_policy" ON "public"."facturas" FOR SELECT TO "authenticated" USING ((COALESCE(("auth"."jwt"() ->> 'nombre_rol'::"text"), (("auth"."jwt"() -> 'user_metadata'::"text") ->> 'nombre_rol'::"text")) = ANY (ARRAY['Administrador'::"text", 'Analista'::"text", 'Coordinador'::"text"])));



CREATE POLICY "facturas_update_policy" ON "public"."facturas" FOR UPDATE TO "authenticated" USING ((COALESCE(("auth"."jwt"() ->> 'nombre_rol'::"text"), (("auth"."jwt"() -> 'user_metadata'::"text") ->> 'nombre_rol'::"text")) = ANY (ARRAY['Administrador'::"text", 'Analista'::"text"]))) WITH CHECK ((COALESCE(("auth"."jwt"() ->> 'nombre_rol'::"text"), (("auth"."jwt"() -> 'user_metadata'::"text") ->> 'nombre_rol'::"text")) = ANY (ARRAY['Administrador'::"text", 'Analista'::"text"])));



ALTER TABLE "public"."guias_carga" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "guias_carga_delete_policy" ON "public"."guias_carga" FOR DELETE TO "authenticated" USING ((COALESCE(("auth"."jwt"() ->> 'nombre_rol'::"text"), (("auth"."jwt"() -> 'user_metadata'::"text") ->> 'nombre_rol'::"text")) = ANY (ARRAY['Administrador'::"text", 'Analista'::"text"])));



CREATE POLICY "guias_carga_insert_policy" ON "public"."guias_carga" FOR INSERT TO "authenticated" WITH CHECK ((COALESCE(("auth"."jwt"() ->> 'nombre_rol'::"text"), (("auth"."jwt"() -> 'user_metadata'::"text") ->> 'nombre_rol'::"text")) = ANY (ARRAY['Administrador'::"text", 'Analista'::"text"])));



CREATE POLICY "guias_carga_select_policy" ON "public"."guias_carga" FOR SELECT TO "authenticated" USING ((COALESCE(("auth"."jwt"() ->> 'nombre_rol'::"text"), (("auth"."jwt"() -> 'user_metadata'::"text") ->> 'nombre_rol'::"text")) = ANY (ARRAY['Administrador'::"text", 'Analista'::"text", 'Coordinador'::"text"])));



CREATE POLICY "guias_carga_update_policy" ON "public"."guias_carga" FOR UPDATE TO "authenticated" USING ((COALESCE(("auth"."jwt"() ->> 'nombre_rol'::"text"), (("auth"."jwt"() -> 'user_metadata'::"text") ->> 'nombre_rol'::"text")) = ANY (ARRAY['Administrador'::"text", 'Analista'::"text"]))) WITH CHECK ((COALESCE(("auth"."jwt"() ->> 'nombre_rol'::"text"), (("auth"."jwt"() -> 'user_metadata'::"text") ->> 'nombre_rol'::"text")) = ANY (ARRAY['Administrador'::"text", 'Analista'::"text"])));



ALTER TABLE "public"."historial_estados_factura" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."incidencias" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."itinerario_viaje" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."licencias_conducir" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."municipios" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."municipios_cronograma" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "municipios_select_policy" ON "public"."municipios" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."prefijos_documento" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "prefijos_documento_select_policy" ON "public"."prefijos_documento" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."prioridades_clientes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "prioridades_clientes_select_policy" ON "public"."prioridades_clientes" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."roles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sucursales_cliente" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "sucursales_cliente_insert_policy" ON "public"."sucursales_cliente" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "sucursales_cliente_select_policy" ON "public"."sucursales_cliente" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "sucursales_cliente_update_policy" ON "public"."sucursales_cliente" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."tipos_cajas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tipos_vehiculos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."usuarios" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."vehiculos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."viajes" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."actualizar_cliente"("p_id_cliente" "uuid", "p_id_prefijo" "uuid", "p_numero_doc" character varying, "p_nombre_comercial" character varying, "p_telefono" character varying, "p_correo" "text", "p_persona_contacto" character varying, "p_id_prioridad" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."actualizar_cliente"("p_id_cliente" "uuid", "p_id_prefijo" "uuid", "p_numero_doc" character varying, "p_nombre_comercial" character varying, "p_telefono" character varying, "p_correo" "text", "p_persona_contacto" character varying, "p_id_prioridad" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."actualizar_cliente"("p_id_cliente" "uuid", "p_id_prefijo" "uuid", "p_numero_doc" character varying, "p_nombre_comercial" character varying, "p_telefono" character varying, "p_correo" "text", "p_persona_contacto" character varying, "p_id_prioridad" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."actualizar_vehiculo"("p_id_vehiculo" "uuid", "p_placa" character varying, "p_marca" character varying, "p_modelo" character varying, "p_anio" integer, "p_tipo_nombre" character varying, "p_caja_nombre" character varying, "p_capacidad_pallets" integer, "p_peso_maximo" numeric, "p_estado_nombre" character varying, "p_imagen_url" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."actualizar_vehiculo"("p_id_vehiculo" "uuid", "p_placa" character varying, "p_marca" character varying, "p_modelo" character varying, "p_anio" integer, "p_tipo_nombre" character varying, "p_caja_nombre" character varying, "p_capacidad_pallets" integer, "p_peso_maximo" numeric, "p_estado_nombre" character varying, "p_imagen_url" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."actualizar_vehiculo"("p_id_vehiculo" "uuid", "p_placa" character varying, "p_marca" character varying, "p_modelo" character varying, "p_anio" integer, "p_tipo_nombre" character varying, "p_caja_nombre" character varying, "p_capacidad_pallets" integer, "p_peso_maximo" numeric, "p_estado_nombre" character varying, "p_imagen_url" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."cambiar_estado_factura"("p_id_factura" "uuid", "p_estado_nuevo" character varying, "p_id_usuario" "uuid", "p_observacion" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."cambiar_estado_factura"("p_id_factura" "uuid", "p_estado_nuevo" character varying, "p_id_usuario" "uuid", "p_observacion" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cambiar_estado_factura"("p_id_factura" "uuid", "p_estado_nuevo" character varying, "p_id_usuario" "uuid", "p_observacion" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."crear_cliente"("p_id_prefijo" "uuid", "p_numero_doc" character varying, "p_nombre_comercial" character varying, "p_telefono" character varying, "p_correo" "text", "p_persona_contacto" character varying, "p_id_prioridad" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."crear_cliente"("p_id_prefijo" "uuid", "p_numero_doc" character varying, "p_nombre_comercial" character varying, "p_telefono" character varying, "p_correo" "text", "p_persona_contacto" character varying, "p_id_prioridad" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."crear_cliente"("p_id_prefijo" "uuid", "p_numero_doc" character varying, "p_nombre_comercial" character varying, "p_telefono" character varying, "p_correo" "text", "p_persona_contacto" character varying, "p_id_prioridad" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."crear_vehiculo"("p_placa" character varying, "p_marca" character varying, "p_modelo" character varying, "p_anio" integer, "p_tipo_nombre" character varying, "p_caja_nombre" character varying, "p_peso_maximo" numeric, "p_capacidad_pallets" integer, "p_estado_nombre" character varying, "p_imagen_url" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."crear_vehiculo"("p_placa" character varying, "p_marca" character varying, "p_modelo" character varying, "p_anio" integer, "p_tipo_nombre" character varying, "p_caja_nombre" character varying, "p_peso_maximo" numeric, "p_capacidad_pallets" integer, "p_estado_nombre" character varying, "p_imagen_url" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."crear_vehiculo"("p_placa" character varying, "p_marca" character varying, "p_modelo" character varying, "p_anio" integer, "p_tipo_nombre" character varying, "p_caja_nombre" character varying, "p_peso_maximo" numeric, "p_capacidad_pallets" integer, "p_estado_nombre" character varying, "p_imagen_url" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."crear_viaje"("p_id_chofer" "uuid", "p_id_vehiculo" "text", "p_municipio" "text", "p_ids_guias" "uuid"[], "p_distancia_total_km" numeric, "p_duracion_total_min" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."crear_viaje"("p_id_chofer" "uuid", "p_id_vehiculo" "text", "p_municipio" "text", "p_ids_guias" "uuid"[], "p_distancia_total_km" numeric, "p_duracion_total_min" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."crear_viaje"("p_id_chofer" "uuid", "p_id_vehiculo" "text", "p_municipio" "text", "p_ids_guias" "uuid"[], "p_distancia_total_km" numeric, "p_duracion_total_min" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."eliminar_cliente"("p_id_cliente" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."eliminar_cliente"("p_id_cliente" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."eliminar_cliente"("p_id_cliente" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."eliminar_vehiculo"("p_id_vehiculo" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."eliminar_vehiculo"("p_id_vehiculo" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."eliminar_vehiculo"("p_id_vehiculo" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."es_transicion_valida_factura"("p_anterior" character varying, "p_nuevo" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."es_transicion_valida_factura"("p_anterior" character varying, "p_nuevo" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."es_transicion_valida_factura"("p_anterior" character varying, "p_nuevo" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_role_name"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_role_name"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_role_name"() TO "service_role";



GRANT ALL ON FUNCTION "public"."guardar_sucursales_cliente"("p_cliente_id" "uuid", "p_sucursales" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."guardar_sucursales_cliente"("p_cliente_id" "uuid", "p_sucursales" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."guardar_sucursales_cliente"("p_cliente_id" "uuid", "p_sucursales" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."obtener_catalogos_vehiculos"() TO "anon";
GRANT ALL ON FUNCTION "public"."obtener_catalogos_vehiculos"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."obtener_catalogos_vehiculos"() TO "service_role";



GRANT ALL ON FUNCTION "public"."obtener_choferes"() TO "anon";
GRANT ALL ON FUNCTION "public"."obtener_choferes"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."obtener_choferes"() TO "service_role";



GRANT ALL ON FUNCTION "public"."obtener_clientes"() TO "anon";
GRANT ALL ON FUNCTION "public"."obtener_clientes"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."obtener_clientes"() TO "service_role";



GRANT ALL ON FUNCTION "public"."obtener_datos_adicionales_usuarios"("usuario_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."obtener_datos_adicionales_usuarios"("usuario_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."obtener_datos_adicionales_usuarios"("usuario_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."obtener_historial_estados_factura"("p_id_factura" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."obtener_historial_estados_factura"("p_id_factura" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."obtener_historial_estados_factura"("p_id_factura" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."obtener_municipios"() TO "anon";
GRANT ALL ON FUNCTION "public"."obtener_municipios"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."obtener_municipios"() TO "service_role";



GRANT ALL ON FUNCTION "public"."obtener_prefijos_documento"() TO "anon";
GRANT ALL ON FUNCTION "public"."obtener_prefijos_documento"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."obtener_prefijos_documento"() TO "service_role";



GRANT ALL ON FUNCTION "public"."obtener_prioridades_clientes"() TO "anon";
GRANT ALL ON FUNCTION "public"."obtener_prioridades_clientes"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."obtener_prioridades_clientes"() TO "service_role";



GRANT ALL ON FUNCTION "public"."obtener_sucursales_cliente"("p_cliente_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."obtener_sucursales_cliente"("p_cliente_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."obtener_sucursales_cliente"("p_cliente_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."obtener_vehiculos"() TO "anon";
GRANT ALL ON FUNCTION "public"."obtener_vehiculos"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."obtener_vehiculos"() TO "service_role";



GRANT ALL ON TABLE "public"."certificados_medicos" TO "anon";
GRANT ALL ON TABLE "public"."certificados_medicos" TO "authenticated";
GRANT ALL ON TABLE "public"."certificados_medicos" TO "service_role";



GRANT ALL ON TABLE "public"."clientes" TO "anon";
GRANT ALL ON TABLE "public"."clientes" TO "authenticated";
GRANT ALL ON TABLE "public"."clientes" TO "service_role";



GRANT ALL ON TABLE "public"."empresas" TO "anon";
GRANT ALL ON TABLE "public"."empresas" TO "authenticated";
GRANT ALL ON TABLE "public"."empresas" TO "service_role";



GRANT ALL ON TABLE "public"."estados" TO "anon";
GRANT ALL ON TABLE "public"."estados" TO "authenticated";
GRANT ALL ON TABLE "public"."estados" TO "service_role";



GRANT ALL ON TABLE "public"."estados_vehiculos" TO "anon";
GRANT ALL ON TABLE "public"."estados_vehiculos" TO "authenticated";
GRANT ALL ON TABLE "public"."estados_vehiculos" TO "service_role";



GRANT ALL ON TABLE "public"."facturas" TO "anon";
GRANT ALL ON TABLE "public"."facturas" TO "authenticated";
GRANT ALL ON TABLE "public"."facturas" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."guias_carga" TO "anon";
GRANT ALL ON TABLE "public"."guias_carga" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."guias_carga" TO "service_role";



GRANT ALL ON TABLE "public"."historial_estados_factura" TO "anon";
GRANT ALL ON TABLE "public"."historial_estados_factura" TO "authenticated";
GRANT ALL ON TABLE "public"."historial_estados_factura" TO "service_role";



GRANT ALL ON TABLE "public"."incidencias" TO "anon";
GRANT ALL ON TABLE "public"."incidencias" TO "authenticated";
GRANT ALL ON TABLE "public"."incidencias" TO "service_role";



GRANT ALL ON TABLE "public"."itinerario_viaje" TO "anon";
GRANT ALL ON TABLE "public"."itinerario_viaje" TO "authenticated";
GRANT ALL ON TABLE "public"."itinerario_viaje" TO "service_role";



GRANT ALL ON TABLE "public"."licencias_conducir" TO "anon";
GRANT ALL ON TABLE "public"."licencias_conducir" TO "authenticated";
GRANT ALL ON TABLE "public"."licencias_conducir" TO "service_role";



GRANT ALL ON TABLE "public"."municipios" TO "anon";
GRANT ALL ON TABLE "public"."municipios" TO "authenticated";
GRANT ALL ON TABLE "public"."municipios" TO "service_role";



GRANT ALL ON TABLE "public"."municipios_cronograma" TO "anon";
GRANT ALL ON TABLE "public"."municipios_cronograma" TO "authenticated";
GRANT ALL ON TABLE "public"."municipios_cronograma" TO "service_role";



GRANT ALL ON TABLE "public"."prefijos_documento" TO "anon";
GRANT ALL ON TABLE "public"."prefijos_documento" TO "authenticated";
GRANT ALL ON TABLE "public"."prefijos_documento" TO "service_role";



GRANT ALL ON TABLE "public"."prioridades_clientes" TO "anon";
GRANT ALL ON TABLE "public"."prioridades_clientes" TO "authenticated";
GRANT ALL ON TABLE "public"."prioridades_clientes" TO "service_role";



GRANT ALL ON TABLE "public"."roles" TO "anon";
GRANT ALL ON TABLE "public"."roles" TO "authenticated";
GRANT ALL ON TABLE "public"."roles" TO "service_role";



GRANT ALL ON TABLE "public"."sucursales_cliente" TO "anon";
GRANT ALL ON TABLE "public"."sucursales_cliente" TO "authenticated";
GRANT ALL ON TABLE "public"."sucursales_cliente" TO "service_role";



GRANT ALL ON TABLE "public"."tipos_cajas" TO "anon";
GRANT ALL ON TABLE "public"."tipos_cajas" TO "authenticated";
GRANT ALL ON TABLE "public"."tipos_cajas" TO "service_role";



GRANT ALL ON TABLE "public"."tipos_vehiculos" TO "anon";
GRANT ALL ON TABLE "public"."tipos_vehiculos" TO "authenticated";
GRANT ALL ON TABLE "public"."tipos_vehiculos" TO "service_role";



GRANT ALL ON TABLE "public"."usuarios" TO "anon";
GRANT ALL ON TABLE "public"."usuarios" TO "authenticated";
GRANT ALL ON TABLE "public"."usuarios" TO "service_role";



GRANT ALL ON TABLE "public"."vehiculos" TO "anon";
GRANT ALL ON TABLE "public"."vehiculos" TO "authenticated";
GRANT ALL ON TABLE "public"."vehiculos" TO "service_role";



GRANT ALL ON TABLE "public"."viajes" TO "anon";
GRANT ALL ON TABLE "public"."viajes" TO "authenticated";
GRANT ALL ON TABLE "public"."viajes" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







