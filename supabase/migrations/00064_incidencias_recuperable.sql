-- ============================================================
-- 00063: Incidencias con flag `recuperable` (decidido por staff).
-- - incidencias.recuperable boolean (default false).
-- - reportar_incidencia setea un default por tipo.
-- - RPC set_incidencia_recuperable (staff).
-- - crear_viaje acepta incidencias con recuperable = true.
-- - obtener_viajes expone incidencia_recuperable / incidencia_id.
-- ============================================================

ALTER TABLE public.incidencias
    ADD COLUMN IF NOT EXISTS recuperable boolean NOT NULL DEFAULT false;

-- ============================================================
-- reportar_incidencia: default recuperable según el tipo
-- ============================================================
CREATE OR REPLACE FUNCTION public.reportar_incidencia(
    p_id_factura uuid,
    p_tipo text,
    p_descripcion text DEFAULT NULL,
    p_foto_url text DEFAULT NULL
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
    v_id_incidencia uuid;
    v_observacion text;
    v_recuperable boolean;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Sesión no válida' USING ERRCODE = 'P0002';
    END IF;

    SELECT id_estado INTO v_id_estado_incidencia
    FROM public.estados WHERE LOWER(nombre_estado) = 'incidencia';
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
        RAISE EXCEPTION 'Factura no encontrada o no asignada al chofer' USING ERRCODE = 'P0002';
    END IF;

    -- Default recuperable según el tipo (el staff puede cambiarlo después).
    v_recuperable := p_tipo IN ('FUERA_HORARIO', 'CERRADO', 'FALTANTE', 'DANADO');

    INSERT INTO public.incidencias
        (id_detalle_fact, tipo_incidencia, descripcion, foto_evidencia_url, recuperable)
    VALUES
        (p_id_factura, p_tipo, COALESCE(p_descripcion, ''), p_foto_url, v_recuperable)
    RETURNING id_incidencia INTO v_id_incidencia;

    v_observacion := '[' || COALESCE(p_tipo, 'INCIDENCIA') || '] ' || COALESCE(p_descripcion, 'Incidencia reportada');

    INSERT INTO public.historial_estados_factura
        (id_factura, id_estado_anterior, id_estado_nuevo, id_usuario, observacion)
    VALUES (p_id_factura, v_anterior, v_id_estado_incidencia, v_uid, v_observacion);

    UPDATE public.facturas
    SET id_estado = v_id_estado_incidencia
    WHERE id_factura = p_id_factura;

    RETURN jsonb_build_object(
        'ok', true, 'id_incidencia', v_id_incidencia,
        'id_factura', p_id_factura, 'recuperable', v_recuperable
    );
END;
$$;

-- ============================================================
-- set_incidencia_recuperable (staff)
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_incidencia_recuperable(p_id_incidencia uuid, p_recuperable boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_rol text;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Sesión no válida' USING ERRCODE = 'P0002';
    END IF;
    SELECT COALESCE(LOWER(r.nombre_rol), '') INTO v_rol
    FROM public.usuarios u
    LEFT JOIN public.roles r ON r.id_rol = u.id_rol
    WHERE u.id_usuario = v_uid;
    IF v_rol NOT IN ('administrador', 'coordinador', 'analista') THEN
        RAISE EXCEPTION 'Solo el personal interno puede marcar una incidencia como recuperable' USING ERRCODE = 'P0001';
    END IF;
    UPDATE public.incidencias
    SET recuperable = p_recuperable
    WHERE id_incidencia = p_id_incidencia;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Incidencia no encontrada' USING ERRCODE = 'P0002';
    END IF;
    RETURN jsonb_build_object('ok', true, 'id_incidencia', p_id_incidencia, 'recuperable', p_recuperable);
END;
$$;

-- ============================================================
-- crear_viaje (overload con p_id_vehiculo text)
-- ============================================================
CREATE OR REPLACE FUNCTION public.crear_viaje(
    p_id_chofer uuid,
    p_id_vehiculo text,
    p_fecha_viaje date DEFAULT CURRENT_DATE,
    p_ids_facturas uuid[] DEFAULT '{}'::uuid[],
    p_distancia_total_km numeric DEFAULT NULL::numeric,
    p_duracion_total_min numeric DEFAULT NULL::numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id_viaje UUID;
    v_nuevo BOOLEAN := true;
    v_id_estado_embarque UUID;
    v_id_estado_nuevo UUID;
    v_id_estado_incidencia UUID;
    v_estado_anterior UUID;
    v_orden INTEGER;
    v_factura_id UUID;
    v_total_facturas INTEGER := 0;
    v_max_orden INTEGER;
BEGIN
    SELECT id_estado INTO v_id_estado_embarque FROM estados WHERE LOWER(nombre_estado) = 'embarque';
    SELECT id_estado INTO v_id_estado_nuevo FROM estados WHERE LOWER(nombre_estado) = 'nuevo';
    SELECT id_estado INTO v_id_estado_incidencia FROM estados WHERE LOWER(nombre_estado) = 'incidencia';
    IF v_id_estado_embarque IS NULL THEN
        RAISE EXCEPTION 'Estado "embarque" no encontrado en la tabla estados';
    END IF;
    SELECT v.id_viaje INTO v_id_viaje
    FROM viajes v
    WHERE v.id_chofer = p_id_chofer
      AND v.estado = 'programado'
    ORDER BY v.fecha_creacion DESC NULLS LAST
    LIMIT 1;
    IF v_id_viaje IS NULL THEN
        INSERT INTO viajes (id_chofer, id_vehiculo, fecha_viaje, distancia_total_km, duracion_total_min,
                            ventana_inicio, ventana_fin)
        VALUES (p_id_chofer, p_id_vehiculo::uuid, p_fecha_viaje, p_distancia_total_km, p_duracion_total_min,
                '08:00', '16:30')
        RETURNING id_viaje INTO v_id_viaje;
    ELSE
        v_nuevo := false;
        UPDATE viajes
        SET id_vehiculo = p_id_vehiculo::uuid,
            fecha_viaje = p_fecha_viaje,
            distancia_total_km = COALESCE(p_distancia_total_km, distancia_total_km),
            duracion_total_min = COALESCE(p_duracion_total_min, duracion_total_min)
        WHERE id_viaje = v_id_viaje;
    END IF;
    SELECT COALESCE(MAX(orden_visita), 0) INTO v_max_orden
    FROM itinerario_viaje WHERE id_viaje = v_id_viaje;
    v_orden := v_max_orden;
    FOREACH v_factura_id IN ARRAY p_ids_facturas
    LOOP
        v_orden := v_orden + 1;
        INSERT INTO itinerario_viaje (id_viaje, id_factura, orden_visita)
        VALUES (v_id_viaje, v_factura_id, v_orden)
        ON CONFLICT DO NOTHING;

        SELECT id_estado INTO v_estado_anterior
        FROM facturas WHERE id_factura = v_factura_id;

        IF v_estado_anterior = v_id_estado_nuevo THEN
            UPDATE facturas SET id_estado = v_id_estado_embarque WHERE id_factura = v_factura_id;
            v_total_facturas := v_total_facturas + 1;
            INSERT INTO historial_estados_factura
                (id_factura, id_estado_anterior, id_estado_nuevo, id_usuario, observacion)
            VALUES (v_factura_id, v_estado_anterior, v_id_estado_embarque, auth.uid(), 'Agregada a viaje');
        ELSIF v_estado_anterior = v_id_estado_incidencia THEN
            IF COALESCE((
                SELECT i.recuperable FROM incidencias i
                WHERE i.id_detalle_fact = v_factura_id
                ORDER BY i.hora_reporte DESC LIMIT 1
            ), false) THEN
                UPDATE facturas SET id_estado = v_id_estado_embarque WHERE id_factura = v_factura_id;
                v_total_facturas := v_total_facturas + 1;
                INSERT INTO historial_estados_factura
                    (id_factura, id_estado_anterior, id_estado_nuevo, id_usuario, observacion)
                VALUES (v_factura_id, v_estado_anterior, v_id_estado_embarque, auth.uid(), 'Reagendada por incidencia');
            END IF;
        END IF;
    END LOOP;
    RETURN jsonb_build_object(
        'id_viaje', v_id_viaje, 'nuevo', v_nuevo,
        'total_facturas', v_total_facturas, 'id_chofer', p_id_chofer
    );
END;
$$;

-- ============================================================
-- crear_viaje (overload con p_municipio)
-- ============================================================
CREATE OR REPLACE FUNCTION public.crear_viaje(
    p_id_chofer uuid,
    p_id_vehiculo uuid,
    p_municipio text,
    p_fecha_viaje date DEFAULT CURRENT_DATE,
    p_ids_facturas uuid[] DEFAULT '{}'::uuid[],
    p_distancia_total_km numeric DEFAULT NULL::numeric,
    p_duracion_total_min numeric DEFAULT NULL::numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id_viaje UUID;
    v_id_estado_embarque UUID;
    v_id_estado_nuevo UUID;
    v_id_estado_incidencia UUID;
    v_estado_anterior UUID;
    v_orden INTEGER;
    v_factura_id UUID;
    v_total_facturas INTEGER := 0;
BEGIN
    SELECT id_estado INTO v_id_estado_embarque FROM estados WHERE nombre_estado = 'embarque';
    SELECT id_estado INTO v_id_estado_nuevo FROM estados WHERE nombre_estado = 'nuevo';
    SELECT id_estado INTO v_id_estado_incidencia FROM estados WHERE nombre_estado = 'incidencia';
    IF v_id_estado_embarque IS NULL THEN
        RAISE EXCEPTION 'Estado "embarque" no encontrado en la tabla estados';
    END IF;
    INSERT INTO viajes (id_chofer, id_vehiculo, municipio, fecha_viaje, distancia_total_km, duracion_total_min,
                        ventana_inicio, ventana_fin)
    VALUES (p_id_chofer, p_id_vehiculo, p_municipio, p_fecha_viaje, p_distancia_total_km, p_duracion_total_min,
            '08:00', '16:30')
    RETURNING id_viaje INTO v_id_viaje;
    v_orden := 0;
    FOREACH v_factura_id IN ARRAY p_ids_facturas
    LOOP
        v_orden := v_orden + 1;
        INSERT INTO itinerario_viaje (id_viaje, id_factura, orden_visita)
        VALUES (v_id_viaje, v_factura_id, v_orden);
        SELECT id_estado INTO v_estado_anterior
        FROM facturas WHERE id_factura = v_factura_id;
        IF v_estado_anterior = v_id_estado_nuevo THEN
            UPDATE facturas SET id_estado = v_id_estado_embarque WHERE id_factura = v_factura_id;
            v_total_facturas := v_total_facturas + 1;
            INSERT INTO historial_estados_factura
                (id_factura, id_estado_anterior, id_estado_nuevo, id_usuario, observacion)
            VALUES (v_factura_id, v_estado_anterior, v_id_estado_embarque, auth.uid(), 'Agregada a viaje');
        ELSIF v_estado_anterior = v_id_estado_incidencia THEN
            IF COALESCE((
                SELECT i.recuperable FROM incidencias i
                WHERE i.id_detalle_fact = v_factura_id
                ORDER BY i.hora_reporte DESC LIMIT 1
            ), false) THEN
                UPDATE facturas SET id_estado = v_id_estado_embarque WHERE id_factura = v_factura_id;
                v_total_facturas := v_total_facturas + 1;
                INSERT INTO historial_estados_factura
                    (id_factura, id_estado_anterior, id_estado_nuevo, id_usuario, observacion)
                VALUES (v_factura_id, v_estado_anterior, v_id_estado_embarque, auth.uid(), 'Reagendada por incidencia');
            END IF;
        END IF;
    END LOOP;
    RETURN jsonb_build_object(
        'id_viaje', v_id_viaje, 'total_facturas', v_total_facturas,
        'id_chofer', p_id_chofer, 'municipio', p_municipio
    );
END;
$$;

-- ============================================================
-- obtener_viajes: expone incidencia_recuperable / incidencia_id
-- ============================================================
CREATE OR REPLACE FUNCTION public.obtener_viajes(p_id_chofer uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
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
            v.fecha_finalizacion,
            v.ventana_inicio,
            v.ventana_fin,
            v.ruta_detallada,
            (SELECT count(*) FROM itinerario_viaje i WHERE i.id_viaje = v.id_viaje) AS total_facturas,
            COALESCE((SELECT count(*) FROM itinerario_viaje i JOIN facturas f ON f.id_factura = i.id_factura
                WHERE i.id_viaje = v.id_viaje AND f.id_estado = v_embarque), 0) AS facturas_embarque,
            COALESCE((SELECT count(*) FROM itinerario_viaje i JOIN facturas f ON f.id_factura = i.id_factura
                WHERE i.id_viaje = v.id_viaje AND f.id_estado = v_proceso), 0) AS facturas_proceso,
            COALESCE((SELECT count(*) FROM itinerario_viaje i JOIN facturas f ON f.id_factura = i.id_factura
                WHERE i.id_viaje = v.id_viaje AND f.id_estado = v_espera), 0) AS facturas_espera,
            COALESCE((SELECT count(*) FROM itinerario_viaje i JOIN facturas f ON f.id_factura = i.id_factura
                WHERE i.id_viaje = v.id_viaje AND f.id_estado = v_entrega), 0) AS facturas_entrega,
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
                    'estado_factura', CASE
                        WHEN v.estado = 'finalizado' AND v.fecha_finalizacion IS NOT NULL THEN
                            COALESCE((
                                SELECT e2.nombre_estado
                                FROM historial_estados_factura h
                                JOIN estados e2 ON e2.id_estado = h.id_estado_nuevo
                                WHERE h.id_factura = f.id_factura
                                  AND h.fecha_cambio < v.fecha_finalizacion
                                ORDER BY h.fecha_cambio DESC
                                LIMIT 1
                            ), e.nombre_estado)
                        ELSE e.nombre_estado
                    END,
                    'incidencia_tipo', (
                        SELECT inc.tipo_incidencia
                        FROM incidencias inc
                        WHERE inc.id_detalle_fact = f.id_factura
                        ORDER BY inc.hora_reporte DESC
                        LIMIT 1
                    ),
                    'incidencia_descripcion', (
                        SELECT inc.descripcion
                        FROM incidencias inc
                        WHERE inc.id_detalle_fact = f.id_factura
                        ORDER BY inc.hora_reporte DESC
                        LIMIT 1
                    ),
                    'incidencia_foto', (
                        SELECT inc.foto_evidencia_url
                        FROM incidencias inc
                        WHERE inc.id_detalle_fact = f.id_factura
                        ORDER BY inc.hora_reporte DESC
                        LIMIT 1
                    ),
                    'incidencia_recuperable', (
                        SELECT inc.recuperable
                        FROM incidencias inc
                        WHERE inc.id_detalle_fact = f.id_factura
                        ORDER BY inc.hora_reporte DESC
                        LIMIT 1
                    ),
                    'incidencia_id', (
                        SELECT inc.id_incidencia
                        FROM incidencias inc
                        WHERE inc.id_detalle_fact = f.id_factura
                        ORDER BY inc.hora_reporte DESC
                        LIMIT 1
                    )
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
        WHERE (p_id_chofer IS NULL OR v.id_chofer = p_id_chofer)
        ORDER BY v.fecha_creacion DESC
    ) t;
    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reportar_incidencia(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_incidencia_recuperable(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crear_viaje(uuid, text, date, uuid[], numeric, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crear_viaje(uuid, uuid, text, date, uuid[], numeric, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.obtener_viajes(uuid) TO authenticated;
