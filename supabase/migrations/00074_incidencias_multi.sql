-- ============================================================
-- 00074a: múltiples incidencias por factura (parte 1)
--  - incidencias.resuelta boolean (default false)
--  - recalcular_estado_factura + trigger
--  - reportar_incidencias (multi, cada una con tipo/desc/foto)
-- ============================================================

ALTER TABLE public.incidencias
    ADD COLUMN IF NOT EXISTS resuelta boolean NOT NULL DEFAULT false;

-- ============================================================
-- recalcular_estado_factura: si quedan incidencias pendientes
-- → 'incidencia'; si todas resueltas → 'finalizado'.
-- ============================================================
CREATE OR REPLACE FUNCTION public.recalcular_estado_factura(p_id_factura uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_pendientes integer;
    v_id_finalizado uuid;
BEGIN
    SELECT id_estado INTO v_id_finalizado FROM public.estados WHERE LOWER(nombre_estado) = 'finalizado';
    IF v_id_finalizado IS NULL THEN
        RETURN;
    END IF;

    SELECT count(*) INTO v_pendientes
    FROM public.incidencias
    WHERE id_detalle_fact = p_id_factura AND resuelta = false;

    IF v_pendientes = 0 THEN
        UPDATE public.facturas
        SET id_estado = v_id_finalizado
        WHERE id_factura = p_id_factura;
    END IF;
END;
$$;

-- ============================================================
-- Trigger: al marcar una incidencia resuelta → recalcular
-- ============================================================
CREATE OR REPLACE FUNCTION public.trg_incidencia_resuelta_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.resuelta AND NOT OLD.resuelta THEN
        PERFORM public.recalcular_estado_factura(NEW.id_detalle_fact);
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_incidencia_resuelta ON public.incidencias;
CREATE TRIGGER trg_incidencia_resuelta
AFTER UPDATE OF resuelta ON public.incidencias
FOR EACH ROW
EXECUTE FUNCTION public.trg_incidencia_resuelta_fn();

-- ============================================================
-- reportar_incidencias: cada elemento de p_incidencias es jsonb
-- {'tipo','descripcion','foto'}. Inserta una fila por incidencia.
-- ============================================================
CREATE OR REPLACE FUNCTION public.reportar_incidencias(
    p_id_factura uuid,
    p_incidencias jsonb[]
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
    v_item jsonb;
    v_tipo text;
    v_descripcion text;
    v_foto text;
    v_total integer := 0;
    v_observacion text;
    v_tipos text[];
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

    FOREACH v_item IN ARRAY p_incidencias
    LOOP
        v_tipo := COALESCE(v_item->>'tipo', '');
        IF v_tipo = '' THEN
            CONTINUE;
        END IF;
        v_descripcion := COALESCE(v_item->>'descripcion', '');
        v_foto := NULLIF(v_item->>'foto', '');

        INSERT INTO public.incidencias
            (id_detalle_fact, tipo_incidencia, descripcion, foto_evidencia_url, recuperable, resuelta)
        VALUES
            (p_id_factura, v_tipo, v_descripcion, v_foto, false, false);

        v_tipos := array_append(v_tipos, v_tipo);
        v_total := v_total + 1;
    END LOOP;

    IF v_total = 0 THEN
        RAISE EXCEPTION 'No se indicó ninguna incidencia válida';
    END IF;

    v_observacion := '[' || array_to_string(v_tipos, ', ') || '] Incidencia(s) reportada(s)';

    INSERT INTO public.historial_estados_factura
        (id_factura, id_estado_anterior, id_estado_nuevo, id_usuario, observacion)
    VALUES (p_id_factura, v_anterior, v_id_estado_incidencia, v_uid, v_observacion);

    UPDATE public.facturas
    SET id_estado = v_id_estado_incidencia
    WHERE id_factura = p_id_factura;

    RETURN jsonb_build_object('ok', true, 'total', v_total, 'id_factura', p_id_factura);
END;
$$;

GRANT EXECUTE ON FUNCTION public.reportar_incidencias(uuid, jsonb[]) TO authenticated;

-- ============================================================
-- 00074b: múltiples incidencias (parte 2)
--  - finalizar_entrega: marca resuelta las recuperables y delega
--    en recalcular_estado_factura.
--  - obtener_incidencias_factura (array).
-- ============================================================

CREATE OR REPLACE FUNCTION public.finalizar_entrega(
    p_id_factura uuid,
    p_observacion text DEFAULT NULL::text,
    p_firma text DEFAULT NULL::text
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
    v_pendientes integer;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Sesión no válida' USING ERRCODE = 'P0002';
    END IF;

    SELECT f.id_guia, f.id_estado
    INTO v_id_guia, v_id_estado_anterior
    FROM public.facturas f
    JOIN public.guias_carga g ON g.id_guia = f.id_guia
    WHERE f.id_factura = p_id_factura
      AND g.id_chofer = v_uid
    FOR UPDATE OF f;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Factura no encontrada o no asignada al chofer' USING ERRCODE = 'P0002';
    END IF;

    SELECT nombre_estado INTO v_estado_anterior
    FROM public.estados WHERE id_estado = v_id_estado_anterior;

    IF v_estado_anterior = 'finalizado' THEN
        RETURN jsonb_build_object('ok', true, 'ya_finalizado', true, 'id_factura', p_id_factura);
    END IF;

    UPDATE public.facturas
    SET firma = COALESCE(p_firma, firma)
    WHERE id_factura = p_id_factura;

    -- Marcar resueltas las incidencias recuperables pendientes (las que
    -- motivaron la re-entrega). Las terminales (DANADO) quedan pendientes
    -- → la factura seguirá en 'incidencia'.
    UPDATE public.incidencias
    SET resuelta = true
    WHERE id_detalle_fact = p_id_factura
      AND recuperable = true
      AND resuelta = false;

    PERFORM public.recalcular_estado_factura(p_id_factura);

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

GRANT EXECUTE ON FUNCTION public.finalizar_entrega(uuid, text, text) TO authenticated;

-- ============================================================
-- obtener_incidencias_factura: array de incidencias de una factura
-- ============================================================
CREATE OR REPLACE FUNCTION public.obtener_incidencias_factura(p_id_factura uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_result jsonb;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Sesión no válida' USING ERRCODE = 'P0002';
    END IF;
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id_incidencia', i.id_incidencia,
        'id_factura', i.id_detalle_fact,
        'tipo', i.tipo_incidencia,
        'descripcion', i.descripcion,
        'foto_url', i.foto_evidencia_url,
        'hora_reporte', i.hora_reporte,
        'recuperable', i.recuperable,
        'resuelta', i.resuelta
    ) ORDER BY i.hora_reporte DESC), '[]'::jsonb)
    INTO v_result
    FROM public.incidencias i
    WHERE i.id_detalle_fact = p_id_factura;
    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.obtener_incidencias_factura(uuid) TO authenticated;

-- ============================================================
-- 00074c: múltiples incidencias (parte 3)
--  - crear_viaje (ambos overloads): re-despachable si existe ≥1
--    incidencia recuperable y pendiente (resuelta = false).
--  - finalizar_viaje: CERRADO/FUERA_HORARIO → recuperable = true,
--    y quedan resuelta = false (pendientes de re-despacho).
-- ============================================================

-- ============================================================
-- crear_viaje (overload p_id_vehiculo text)
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
    v_redespachable BOOLEAN;
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
            SELECT EXISTS (
                SELECT 1 FROM incidencias i
                WHERE i.id_detalle_fact = v_factura_id
                  AND i.recuperable = true
                  AND i.resuelta = false
            ) INTO v_redespachable;
            IF v_redespachable THEN
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
-- crear_viaje (overload p_id_vehiculo uuid + municipio)
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
    v_redespachable BOOLEAN;
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
            SELECT EXISTS (
                SELECT 1 FROM incidencias i
                WHERE i.id_detalle_fact = v_factura_id
                  AND i.recuperable = true
                  AND i.resuelta = false
            ) INTO v_redespachable;
            IF v_redespachable THEN
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

GRANT EXECUTE ON FUNCTION public.crear_viaje(uuid, text, date, uuid[], numeric, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crear_viaje(uuid, uuid, text, date, uuid[], numeric, numeric) TO authenticated;

-- ============================================================
-- finalizar_viaje: CERRADO/FUERA_HORARIO → recuperable = true,
-- quedan resuelta = false (pendientes de re-despacho).
-- ============================================================
CREATE OR REPLACE FUNCTION public.finalizar_viaje(p_id_viaje uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_id_chofer uuid;
    v_rol text;
    v_estado text;
    v_pendientes integer;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Sesión no válida' USING ERRCODE = 'P0002';
    END IF;

    SELECT id_chofer INTO v_id_chofer FROM public.viajes WHERE id_viaje = p_id_viaje;
    IF v_id_chofer IS NULL THEN
        RAISE EXCEPTION 'Viaje no encontrado';
    END IF;

    SELECT COALESCE(LOWER(r.nombre_rol), '') INTO v_rol
    FROM public.usuarios u
    LEFT JOIN public.roles r ON r.id_rol = u.id_rol
    WHERE u.id_usuario = v_uid;

    IF v_uid <> v_id_chofer AND v_rol NOT IN ('administrador', 'coordinador', 'analista') THEN
        RAISE EXCEPTION 'No tienes permiso para finalizar este viaje';
    END IF;

    SELECT estado INTO v_estado FROM public.viajes WHERE id_viaje = p_id_viaje;
    IF v_estado <> 'proceso' THEN
        RAISE EXCEPTION 'El viaje no está en proceso';
    END IF;

    SELECT count(*) INTO v_pendientes
    FROM public.itinerario_viaje i
    JOIN public.facturas f ON f.id_factura = i.id_factura
    JOIN public.estados e ON e.id_estado = f.id_estado
    WHERE i.id_viaje = p_id_viaje
      AND e.nombre_estado NOT IN ('finalizado', 'incidencia');
    IF v_pendientes > 0 THEN
        RAISE EXCEPTION 'Hay % entrega(s) sin finalizar', v_pendientes;
    END IF;

    UPDATE public.viajes
    SET estado = 'finalizado',
        fecha_finalizacion = now()
    WHERE id_viaje = p_id_viaje;

    -- CERRADO/FUERA_HORARIO se vuelven recuperables (el negocio recién puede
    -- recibir en otro viaje) y quedan pendientes (resuelta = false) para que
    -- el admin las re-despache.
    UPDATE public.incidencias
    SET recuperable = true
    WHERE id_detalle_fact IN (
        SELECT it.id_factura FROM public.itinerario_viaje it WHERE it.id_viaje = p_id_viaje
    )
      AND tipo_incidencia IN ('CERRADO', 'FUERA_HORARIO');

    RETURN jsonb_build_object('id_viaje', p_id_viaje, 'estado', 'finalizado');
END;
$$;

GRANT EXECUTE ON FUNCTION public.finalizar_viaje(uuid) TO authenticated;

-- ============================================================
-- 00074d: múltiples incidencias (parte 4)
--  - obtener_viaje_chofer / obtener_viajes: exponen por parada
--    incidencias[] (array) y tiene_incidencia_pendiente.
-- ============================================================

CREATE OR REPLACE FUNCTION public.obtener_viaje_chofer()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_result JSONB;
BEGIN
    SELECT COALESCE(jsonb_agg(v), '[]'::jsonb)
    INTO v_result
    FROM (
        SELECT
            v.id_viaje,
            v.id_chofer,
            v.id_vehiculo,
            veh.placa AS placa_vehiculo,
            v.fecha_viaje,
            v.estado,
            v.distancia_total_km,
            v.duracion_total_min,
            v.fecha_creacion,
            v.ruta_detallada,
            COALESCE((
                SELECT jsonb_agg(jsonb_build_object(
                    'orden_visita', i.orden_visita,
                    'id_factura', i.id_factura,
                    'numero_factura', f.num_factura,
                    'id_guia', f.id_guia,
                    'codigo_guia', g.codigo_guia,
                    'nombre_cliente', c.nombre_comercial,
                    'direccion', s.direccion,
                    'referencia', s.punto_de_referencia,
                    'contacto', s.nombre_contacto,
                    'telefono', s.telefono_contacto,
                    'nota_sucursal', s.instruccion_nota,
                    'municipio', m.nombre,
                    'latitud', s.latitud,
                    'longitud', s.longitud,
                    'monto_dolares', f.monto_dolares,
                    'estado_factura', e.nombre_estado,
                    'hora_desde', s.hora_desde,
                    'hora_hasta', s.hora_hasta,
                    'incidencia_tipo', (
                        SELECT inc.tipo_incidencia
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
                    ),
                    'tiene_incidencia_pendiente', EXISTS (
                        SELECT 1 FROM incidencias inc
                        WHERE inc.id_detalle_fact = f.id_factura AND inc.resuelta = false
                    ),
                    'incidencias', COALESCE((
                        SELECT jsonb_agg(jsonb_build_object(
                            'id_incidencia', inc.id_incidencia,
                            'tipo', inc.tipo_incidencia,
                            'descripcion', inc.descripcion,
                            'foto', inc.foto_evidencia_url,
                            'hora_reporte', inc.hora_reporte,
                            'recuperable', inc.recuperable,
                            'resuelta', inc.resuelta
                        ) ORDER BY inc.hora_reporte DESC)
                        FROM incidencias inc
                        WHERE inc.id_detalle_fact = f.id_factura
                    ), '[]'::jsonb)
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
        LEFT JOIN vehiculos veh ON veh.id_vehiculo = v.id_vehiculo
        WHERE v.id_chofer = auth.uid()
          AND v.estado IN ('programado', 'proceso')
        ORDER BY v.fecha_creacion DESC
    ) v;

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.obtener_viaje_chofer() TO authenticated;

-- ============================================================
-- obtener_viajes
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
                    'referencia', s.punto_de_referencia,
                    'contacto', s.nombre_contacto,
                    'telefono', s.telefono_contacto,
                    'nota_sucursal', s.instruccion_nota,
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
                    'hora_desde', s.hora_desde,
                    'hora_hasta', s.hora_hasta,
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
                    ),
                    'tiene_incidencia_pendiente', EXISTS (
                        SELECT 1 FROM incidencias inc
                        WHERE inc.id_detalle_fact = f.id_factura AND inc.resuelta = false
                    ),
                    'incidencias', COALESCE((
                        SELECT jsonb_agg(jsonb_build_object(
                            'id_incidencia', inc.id_incidencia,
                            'tipo', inc.tipo_incidencia,
                            'descripcion', inc.descripcion,
                            'foto', inc.foto_evidencia_url,
                            'hora_reporte', inc.hora_reporte,
                            'recuperable', inc.recuperable,
                            'resuelta', inc.resuelta
                        ) ORDER BY inc.hora_reporte DESC)
                        FROM incidencias inc
                        WHERE inc.id_detalle_fact = f.id_factura
                    ), '[]'::jsonb)
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

GRANT EXECUTE ON FUNCTION public.obtener_viajes(uuid) TO authenticated;