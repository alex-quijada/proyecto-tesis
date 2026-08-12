-- ==========================================
-- 00055: Flujo de entrega con estado "entrega" + firma persistida + reinicio.
--
-- Ciclo de factura:
--   nuevo → embarque → proceso → espera → entrega → finalizado
--                       (iniciar   (llegada  (inicio de  (firma)
--                        viaje)     GPS)      entrega)      ↘ incidencia
--
-- 1) Nuevo estado `entrega` ("Entregando mercancía en el destino").
-- 2) Transiciones válidas actualizadas (espera→entrega→finalizado/incidencia).
-- 3) facturas.firma (base64 PNG de la firma digital, persistida al finalizar).
-- 4) RPCs del chofer: llegar_a_parada, iniciar_entrega, reportar_incidencia,
--    finalizar_entrega (ahora con p_firma).
-- 5) reiniciar_viaje (solo staff): vuelve el viaje a 'programado' y sus
--    facturas a 'embarque' (limpia firma) — permite re-probar el flujo.
-- 6) Derivaciones/conteos: obtener_guias_chofer → EN_ENTREGA;
--    obtener_viajes → facturas_espera / facturas_entrega.
-- ==========================================

-- ==========================================
-- 1) Estado nuevo
-- ==========================================
INSERT INTO public.estados (nombre_estado, descripcion) VALUES
  ('entrega', 'Entrega de mercancía en curso en el destino')
ON CONFLICT (nombre_estado) DO NOTHING;

-- ==========================================
-- 2) Transiciones válidas
-- ==========================================
CREATE OR REPLACE FUNCTION public.es_transicion_valida_factura(
    p_anterior varchar,
    p_nuevo    varchar
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = 'public'
AS $$
BEGIN
    IF p_anterior IS NULL THEN
        RETURN p_nuevo = 'nuevo';
    END IF;

    RETURN CASE p_anterior
        WHEN 'nuevo'       THEN p_nuevo IN ('embarque', 'incidencia')
        WHEN 'embarque'    THEN p_nuevo IN ('proceso', 'incidencia')
        WHEN 'proceso'     THEN p_nuevo IN ('espera', 'incidencia')
        WHEN 'espera'      THEN p_nuevo IN ('entrega', 'incidencia')
        WHEN 'entrega'     THEN p_nuevo IN ('finalizado', 'incidencia')
        WHEN 'incidencia'  THEN p_nuevo IN ('proceso', 'espera', 'entrega')
        WHEN 'finalizado'  THEN false
        ELSE false
    END;
END;
$$;

-- ==========================================
-- 3) Firma digital en facturas
-- ==========================================
ALTER TABLE public.facturas ADD COLUMN IF NOT EXISTS firma text;

-- ==========================================
-- 4) llegar_a_parada — llegada GPS al punto: proceso → espera
-- ==========================================
CREATE OR REPLACE FUNCTION public.llegar_a_parada(
    p_ids_facturas uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_id_estado_espera uuid;
    v_id_estado_proceso uuid;
    v_factura uuid;
    v_anterior uuid;
    v_total integer := 0;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Sesión no válida'
            USING ERRCODE = 'P0002';
    END IF;

    SELECT id_estado INTO v_id_estado_espera FROM public.estados WHERE LOWER(nombre_estado) = 'espera';
    SELECT id_estado INTO v_id_estado_proceso FROM public.estados WHERE LOWER(nombre_estado) = 'proceso';
    IF v_id_estado_espera IS NULL OR v_id_estado_proceso IS NULL THEN
        RAISE EXCEPTION 'Estado espera/proceso no encontrado';
    END IF;

    FOREACH v_factura IN ARRAY p_ids_facturas
    LOOP
        SELECT f.id_estado INTO v_anterior
        FROM public.facturas f
        JOIN public.itinerario_viaje i ON i.id_factura = f.id_factura
        JOIN public.viajes v ON v.id_viaje = i.id_viaje
        WHERE f.id_factura = v_factura
          AND v.id_chofer = v_uid
          AND v.estado = 'proceso'
        FOR UPDATE OF f;

        IF NOT FOUND OR v_anterior IS NULL THEN
            CONTINUE;
        END IF;

        IF v_anterior = v_id_estado_proceso THEN
            INSERT INTO public.historial_estados_factura
                (id_factura, id_estado_anterior, id_estado_nuevo, id_usuario, observacion)
            VALUES (v_factura, v_anterior, v_id_estado_espera, v_uid, 'Llegada al punto de entrega');

            UPDATE public.facturas
            SET id_estado = v_id_estado_espera
            WHERE id_factura = v_factura;

            v_total := v_total + 1;
        END IF;
    END LOOP;

    RETURN jsonb_build_object('total_actualizadas', v_total);
END;
$$;

-- ==========================================
-- iniciar_entrega — botón "Iniciar entrega": espera → entrega
-- ==========================================
CREATE OR REPLACE FUNCTION public.iniciar_entrega(
    p_ids_facturas uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_id_estado_espera uuid;
    v_id_estado_entrega uuid;
    v_factura uuid;
    v_anterior uuid;
    v_total integer := 0;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Sesión no válida'
            USING ERRCODE = 'P0002';
    END IF;

    SELECT id_estado INTO v_id_estado_espera FROM public.estados WHERE LOWER(nombre_estado) = 'espera';
    SELECT id_estado INTO v_id_estado_entrega FROM public.estados WHERE LOWER(nombre_estado) = 'entrega';
    IF v_id_estado_espera IS NULL OR v_id_estado_entrega IS NULL THEN
        RAISE EXCEPTION 'Estado espera/entrega no encontrado';
    END IF;

    FOREACH v_factura IN ARRAY p_ids_facturas
    LOOP
        SELECT f.id_estado INTO v_anterior
        FROM public.facturas f
        JOIN public.itinerario_viaje i ON i.id_factura = f.id_factura
        JOIN public.viajes v ON v.id_viaje = i.id_viaje
        WHERE f.id_factura = v_factura
          AND v.id_chofer = v_uid
          AND v.estado = 'proceso'
        FOR UPDATE OF f;

        IF NOT FOUND OR v_anterior IS NULL THEN
            CONTINUE;
        END IF;

        IF v_anterior = v_id_estado_espera THEN
            INSERT INTO public.historial_estados_factura
                (id_factura, id_estado_anterior, id_estado_nuevo, id_usuario, observacion)
            VALUES (v_factura, v_anterior, v_id_estado_entrega, v_uid, 'Inicio de entrega de mercancía');

            UPDATE public.facturas
            SET id_estado = v_id_estado_entrega
            WHERE id_factura = v_factura;

            v_total := v_total + 1;
        END IF;
    END LOOP;

    RETURN jsonb_build_object('total_actualizadas', v_total);
END;
$$;

-- ==========================================
-- reportar_incidencia — proceso/espera/entrega → incidencia
-- ==========================================
CREATE OR REPLACE FUNCTION public.reportar_incidencia(
    p_id_factura uuid,
    p_observacion text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_id_estado_incidencia uuid;
    v_anterior uuid;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Sesión no válida'
            USING ERRCODE = 'P0002';
    END IF;

    SELECT id_estado INTO v_id_estado_incidencia FROM public.estados WHERE LOWER(nombre_estado) = 'incidencia';
    IF v_id_estado_incidencia IS NULL THEN
        RAISE EXCEPTION 'Estado incidencia no encontrado';
    END IF;

    SELECT f.id_estado INTO v_anterior
    FROM public.facturas f
    JOIN public.itinerario_viaje i ON i.id_factura = f.id_factura
    JOIN public.viajes v ON v.id_viaje = i.id_viaje
    WHERE f.id_factura = p_id_factura
      AND v.id_chofer = v_uid
      AND v.estado = 'proceso'
    FOR UPDATE OF f;

    IF NOT FOUND OR v_anterior IS NULL THEN
        RAISE EXCEPTION 'Factura no encontrada o no asignada al chofer'
            USING ERRCODE = 'P0002';
    END IF;

    INSERT INTO public.historial_estados_factura
        (id_factura, id_estado_anterior, id_estado_nuevo, id_usuario, observacion)
    VALUES (p_id_factura, v_anterior, v_id_estado_incidencia, v_uid, COALESCE(p_observacion, 'Incidencia reportada'));

    UPDATE public.facturas
    SET id_estado = v_id_estado_incidencia
    WHERE id_factura = p_id_factura;

    RETURN jsonb_build_object('ok', true, 'id_factura', p_id_factura);
END;
$$;

-- ==========================================
-- finalizar_entrega — ahora persiste la firma (base64 PNG)
-- ==========================================
DROP FUNCTION IF EXISTS public.finalizar_entrega(uuid, text);

CREATE OR REPLACE FUNCTION public.finalizar_entrega(
    p_id_factura uuid,
    p_observacion text DEFAULT NULL,
    p_firma text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_id_guia uuid;
    v_id_estado_anterior uuid;
    v_estado_anterior varchar(50);
    v_id_estado_finalizado uuid;
    v_pendientes integer;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Sesión no válida'
            USING ERRCODE = 'P0002';
    END IF;

    SELECT f.id_guia, f.id_estado
    INTO v_id_guia, v_id_estado_anterior
    FROM public.facturas f
    JOIN public.guias_carga g ON g.id_guia = f.id_guia
    WHERE f.id_factura = p_id_factura
      AND g.id_chofer = v_uid
    FOR UPDATE OF f;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Factura no encontrada o no asignada al chofer'
            USING ERRCODE = 'P0002';
    END IF;

    SELECT nombre_estado INTO v_estado_anterior
    FROM public.estados
    WHERE id_estado = v_id_estado_anterior;

    IF v_estado_anterior = 'finalizado' THEN
        RETURN jsonb_build_object('ok', true, 'ya_finalizado', true, 'id_factura', p_id_factura);
    END IF;

    SELECT id_estado INTO v_id_estado_finalizado
    FROM public.estados
    WHERE nombre_estado = 'finalizado';

    INSERT INTO public.historial_estados_factura
        (id_factura, id_estado_anterior, id_estado_nuevo, id_usuario, observacion)
    VALUES
        (p_id_factura, v_id_estado_anterior, v_id_estado_finalizado, v_uid, p_observacion);

    UPDATE public.facturas
    SET id_estado = v_id_estado_finalizado,
        firma = COALESCE(p_firma, firma)
    WHERE id_factura = p_id_factura;

    SELECT count(*)
    INTO v_pendientes
    FROM public.facturas f
    JOIN public.estados st ON st.id_estado = f.id_estado
    WHERE f.id_guia = v_id_guia
      AND st.nombre_estado <> 'finalizado';

    RETURN jsonb_build_object(
        'ok', true,
        'id_factura', p_id_factura,
        'id_guia', v_id_guia,
        'guia_finalizada', v_pendientes = 0
    );
END;
$$;

-- ==========================================
-- 5) reiniciar_viaje — SOLO staff: reabre el viaje para re-probar
-- ==========================================
CREATE OR REPLACE FUNCTION public.reiniciar_viaje(
    p_id_viaje uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_rol text;
    v_id_estado_embarque uuid;
    v_factura uuid;
    v_anterior uuid;
    v_total integer := 0;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Sesión no válida'
            USING ERRCODE = 'P0002';
    END IF;

    SELECT COALESCE(LOWER(r.nombre_rol), '') INTO v_rol
    FROM public.usuarios u
    LEFT JOIN public.roles r ON r.id_rol = u.id_rol
    WHERE u.id_usuario = v_uid;

    IF v_rol NOT IN ('administrador', 'coordinador', 'analista') THEN
        RAISE EXCEPTION 'No tienes permiso para reiniciar viajes'
            USING ERRCODE = 'P0001';
    END IF;

    SELECT id_estado INTO v_id_estado_embarque FROM public.estados WHERE LOWER(nombre_estado) = 'embarque';
    IF v_id_estado_embarque IS NULL THEN
        RAISE EXCEPTION 'Estado embarque no encontrado';
    END IF;

    FOR v_factura IN
        SELECT i.id_factura FROM public.itinerario_viaje i WHERE i.id_viaje = p_id_viaje
    LOOP
        SELECT id_estado INTO v_anterior FROM public.facturas WHERE id_factura = v_factura;

        INSERT INTO public.historial_estados_factura
            (id_factura, id_estado_anterior, id_estado_nuevo, id_usuario, observacion)
        VALUES (v_factura, v_anterior, v_id_estado_embarque, v_uid, 'Viaje reiniciado');

        UPDATE public.facturas
        SET id_estado = v_id_estado_embarque, firma = NULL
        WHERE id_factura = v_factura;

        v_total := v_total + 1;
    END LOOP;

    UPDATE public.viajes SET estado = 'programado' WHERE id_viaje = p_id_viaje;

    RETURN jsonb_build_object(
        'id_viaje', p_id_viaje,
        'estado', 'programado',
        'total_facturas', v_total
    );
END;
$$;

-- ==========================================
-- 6a) obtener_guias_chofer: estado_guia → EN_ENTREGA
-- ==========================================
DROP FUNCTION IF EXISTS public.obtener_guias_chofer();

CREATE OR REPLACE FUNCTION public.obtener_guias_chofer()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_resultado jsonb;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Sesión no válida'
            USING ERRCODE = 'P0002';
    END IF;

    SELECT COALESCE(jsonb_agg(g ORDER BY g.fecha_despacho, g.fecha_registro), '[]'::jsonb)
    INTO v_resultado
    FROM (
        SELECT
            g.id_guia,
            g.codigo_guia,
            g.fecha_despacho,
            g.fecha_registro,
            (
                SELECT CASE
                    WHEN count(*) = 0 THEN 'NUEVO'
                    WHEN bool_or(st2.nombre_estado = 'incidencia') THEN 'INCIDENCIAS'
                    WHEN bool_or(st2.nombre_estado = 'entrega') THEN 'EN_ENTREGA'
                    WHEN bool_or(st2.nombre_estado = 'proceso') THEN 'EN_PROCESO'
                    WHEN bool_or(st2.nombre_estado = 'espera') THEN 'EN_ESPERA'
                    WHEN bool_or(st2.nombre_estado = 'embarque') THEN 'EN_CARGA_MERCANCIA'
                    WHEN bool_and(st2.nombre_estado = 'finalizado') THEN 'FINALIZADO'
                    ELSE 'NUEVO'
                END
                FROM public.facturas f2
                LEFT JOIN public.estados st2 ON st2.id_estado = f2.id_estado
                WHERE f2.id_guia = g.id_guia
            ) AS estado_guia,
            g.observaciones,
            g.id_vehiculo,
            v.placa AS placa_vehiculo,
            v.marca AS marca_vehiculo,
            v.modelo AS modelo_vehiculo,
            g.id_chofer,
            ch.nombre_completo AS nombre_chofer,
            g.id_ayudante,
            ay.nombre_completo AS nombre_ayudante,
            g.id_empresa,
            e.empresa AS nombre_empresa,
            g.id_municipio,
            m.nombre AS nombre_municipio,
            COALESCE(
                (
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'id_factura', f.id_factura,
                            'numero_factura', f.num_factura,
                            'id_sucursal', f.id_sucursal,
                            'monto_dolares', f.monto_dolares,
                            'monto_bss', f.monto_bss,
                            'incidencia', f.incidencia,
                            'id_estado', f.id_estado,
                            'nombre_estado', st.nombre_estado,
                            'direccion_sucursal', s.direccion,
                            'punto_de_referencia', s.punto_de_referencia,
                            'latitud', s.latitud,
                            'longitud', s.longitud,
                            'nombre_contacto', s.nombre_contacto,
                            'telefono_contacto', s.telefono_contacto,
                            'cita', s.cita,
                            'dias_semana', s.dias_semana,
                            'hora_desde', s.hora_desde,
                            'hora_hasta', s.hora_hasta,
                            'id_cliente', c.id_cliente,
                            'nombre_cliente', c.nombre_comercial,
                            'rif_cliente',
                                CASE
                                    WHEN pd.prefijo IS NOT NULL AND c.numero_doc IS NOT NULL
                                    THEN pd.prefijo || c.numero_doc
                                    ELSE NULL
                                END,
                            'telefono_cliente', c.telefono,
                            'persona_contacto', c.persona_contacto,
                            'nombre_prioridad', pr.nombre_prioridad
                        )
                        ORDER BY f.num_factura
                    )
                    FROM public.facturas f
                    LEFT JOIN public.estados st ON st.id_estado = f.id_estado
                    LEFT JOIN public.sucursales_cliente s ON s.id = f.id_sucursal
                    LEFT JOIN public.clientes c ON c.id_cliente = s.cliente_id
                    LEFT JOIN public.prefijos_documento pd ON pd.id_prefijo = c.id_prefijo
                    LEFT JOIN public.prioridades_clientes pr ON pr.id_prioridad = c.id_prioridad
                    WHERE f.id_guia = g.id_guia
                ),
                '[]'::jsonb
            ) AS facturas
        FROM public.guias_carga g
        LEFT JOIN public.vehiculos v ON v.id_vehiculo = g.id_vehiculo
        LEFT JOIN public.usuarios ch ON ch.id_usuario = g.id_chofer
        LEFT JOIN public.usuarios ay ON ay.id_usuario = g.id_ayudante
        LEFT JOIN public.empresas e ON e.id_empresa = g.id_empresa
        LEFT JOIN public.municipios m ON m.id_municipio = g.id_municipio
        WHERE g.id_chofer = v_uid
    ) g;

    RETURN v_resultado;
END;
$$;

-- ==========================================
-- 6b) obtener_viajes: conteos por estado (espera/entrega)
-- ==========================================
CREATE OR REPLACE FUNCTION public.obtener_viajes()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_result JSONB;
    v_embarque UUID;
    v_proceso UUID;
    v_espera UUID;
    v_entrega UUID;
BEGIN
    SELECT id_estado INTO v_embarque FROM estados WHERE LOWER(nombre_estado) = 'embarque';
    SELECT id_estado INTO v_proceso FROM estados WHERE LOWER(nombre_estado) = 'proceso';
    SELECT id_estado INTO v_espera FROM estados WHERE LOWER(nombre_estado) = 'espera';
    SELECT id_estado INTO v_entrega FROM estados WHERE LOWER(nombre_estado) = 'entrega';

    SELECT COALESCE(jsonb_agg(t), '[]'::jsonb)
    INTO v_result
    FROM (
        SELECT
            v.id_viaje,
            v.id_chofer,
            ch.nombre_completo AS chofer,
            v.id_vehiculo,
            veh.placa AS placa_vehiculo,
            v.fecha_viaje,
            v.estado,
            v.fecha_creacion,
            v.ruta_detallada,
            (SELECT count(*) FROM itinerario_viaje i WHERE i.id_viaje = v.id_viaje) AS total_facturas,
            COALESCE((
                SELECT count(*) FROM itinerario_viaje i
                JOIN facturas f ON f.id_factura = i.id_factura
                WHERE i.id_viaje = v.id_viaje AND f.id_estado = v_embarque
            ), 0) AS facturas_embarque,
            COALESCE((
                SELECT count(*) FROM itinerario_viaje i
                JOIN facturas f ON f.id_factura = i.id_factura
                WHERE i.id_viaje = v.id_viaje AND f.id_estado = v_proceso
            ), 0) AS facturas_proceso,
            COALESCE((
                SELECT count(*) FROM itinerario_viaje i
                JOIN facturas f ON f.id_factura = i.id_factura
                WHERE i.id_viaje = v.id_viaje AND f.id_estado = v_espera
            ), 0) AS facturas_espera,
            COALESCE((
                SELECT count(*) FROM itinerario_viaje i
                JOIN facturas f ON f.id_factura = i.id_factura
                WHERE i.id_viaje = v.id_viaje AND f.id_estado = v_entrega
            ), 0) AS facturas_entrega,
            COALESCE((
                SELECT jsonb_agg(jsonb_build_object(
                    'orden_visita', i.orden_visita,
                    'id_factura', i.id_factura,
                    'numero_factura', f.num_factura,
                    'id_guia', f.id_guia,
                    'codigo_guia', g.codigo_guia,
                    'nombre_cliente', c.nombre_comercial,
                    'direccion', s.direccion,
                    'municipio', m.nombre,
                    'latitud', s.latitud,
                    'longitud', s.longitud,
                    'estado_factura', e.nombre_estado
                ) ORDER BY i.orden_visita)
                FROM itinerario_viaje i
                JOIN facturas f ON f.id_factura = i.id_factura
                LEFT JOIN guias_carga g ON g.id_guia = f.id_guia
                LEFT JOIN sucursales_cliente s ON s.id = f.id_sucursal
                LEFT JOIN municipios m ON m.id_municipio = s.id_municipio
                LEFT JOIN clientes c ON c.id_cliente = s.cliente_id
                LEFT JOIN estados e ON e.id_estado = f.id_estado
                WHERE i.id_viaje = v.id_viaje
            ), '[]'::jsonb) AS paradas
        FROM viajes v
        LEFT JOIN usuarios ch ON ch.id_usuario = v.id_chofer
        LEFT JOIN vehiculos veh ON veh.id_vehiculo = v.id_vehiculo
        ORDER BY v.fecha_creacion DESC
    ) t;

    RETURN v_result;
END;
$$;

-- ==========================================
-- Grants
-- ==========================================
REVOKE EXECUTE ON FUNCTION public.llegar_a_parada(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.llegar_a_parada(uuid[]) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.iniciar_entrega(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iniciar_entrega(uuid[]) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.reportar_incidencia(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reportar_incidencia(uuid, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.finalizar_entrega(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalizar_entrega(uuid, text, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.reiniciar_viaje(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reiniciar_viaje(uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.obtener_guias_chofer() TO authenticated;
GRANT EXECUTE ON FUNCTION public.obtener_viajes() TO authenticated;
