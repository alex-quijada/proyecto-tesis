-- ============================================================
-- 00061: Incidencias plan B (re-despacho) + ventana laboral + cierre.
-- - viajes: fecha_finalizacion (momento de cierre), ventana laboral 08:00-16:30.
-- - finalizar_viaje marca fecha_finalizacion (las facturas con incidencia
--   quedan en 'incidencia'; el re-despacho lo decide crear_viaje).
-- - crear_viaje acepta facturas 'nuevo' O 'incidencia' recuperable
--   (FUERA_HORARIO, CERRADO, FALTANTE, DANADO) y setea la ventana laboral.
-- - iniciar_viaje / reiniciar_viaje limpian fecha_finalizacion.
-- - obtener_viajes devuelve el estado de cada parada AL MOMENTO DEL CIERRE
--   para viajes finalizados (compara historial vs fecha_finalizacion).
-- - RPCs nuevos: actualizar_ventana_viaje, resolver_incidencia.
-- ============================================================

-- 1) Columnas en viajes
ALTER TABLE public.viajes
    ADD COLUMN IF NOT EXISTS fecha_finalizacion timestamptz,
    ADD COLUMN IF NOT EXISTS ventana_inicio time NOT NULL DEFAULT '08:00',
    ADD COLUMN IF NOT EXISTS ventana_fin time NOT NULL DEFAULT '16:30';

-- ============================================================
-- finalizar_viaje: marca el momento de cierre (plan B no toca facturas)
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
    RETURN jsonb_build_object('id_viaje', p_id_viaje, 'estado', 'finalizado');
END;
$$;

-- ============================================================
-- iniciar_viaje: limpia fecha_finalizacion al reactivar
-- ============================================================
CREATE OR REPLACE FUNCTION public.iniciar_viaje(p_id_viaje uuid, p_ids_facturas_ordenadas uuid[] DEFAULT NULL::uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id_chofer UUID;
    v_rol TEXT;
    v_id_estado_proceso UUID;
    v_id_estado_embarque UUID;
    v_orden INTEGER;
    v_factura_id UUID;
    v_total INTEGER := 0;
BEGIN
    SELECT id_chofer INTO v_id_chofer FROM viajes WHERE id_viaje = p_id_viaje;
    IF v_id_chofer IS NULL THEN
        RAISE EXCEPTION 'Viaje no encontrado';
    END IF;
    SELECT COALESCE(r.nombre_rol, '') INTO v_rol
    FROM usuarios u
    LEFT JOIN roles r ON r.id_rol = u.id_rol
    WHERE u.id_usuario = auth.uid();
    IF auth.uid() <> v_id_chofer AND LOWER(v_rol) NOT IN ('administrador', 'coordinador', 'analista') THEN
        RAISE EXCEPTION 'No tienes permiso para iniciar este viaje';
    END IF;
    SELECT id_estado INTO v_id_estado_proceso FROM estados WHERE LOWER(nombre_estado) = 'proceso';
    SELECT id_estado INTO v_id_estado_embarque FROM estados WHERE LOWER(nombre_estado) = 'embarque';
    IF v_id_estado_proceso IS NULL THEN
        RAISE EXCEPTION 'Estado "proceso" no encontrado en la tabla estados';
    END IF;
    IF p_ids_facturas_ordenadas IS NOT NULL AND array_length(p_ids_facturas_ordenadas, 1) > 0 THEN
        v_orden := 0;
        FOREACH v_factura_id IN ARRAY p_ids_facturas_ordenadas
        LOOP
            v_orden := v_orden + 1;
            UPDATE itinerario_viaje SET orden_visita = v_orden
            WHERE id_viaje = p_id_viaje AND id_factura = v_factura_id;
        END LOOP;
    END IF;
    UPDATE viajes SET estado = 'proceso', fecha_finalizacion = NULL WHERE id_viaje = p_id_viaje;
    FOR v_factura_id IN
        SELECT i.id_factura FROM itinerario_viaje i WHERE i.id_viaje = p_id_viaje
    LOOP
        UPDATE facturas
        SET id_estado = v_id_estado_proceso
        WHERE id_factura = v_factura_id AND id_estado = v_id_estado_embarque;
        IF FOUND THEN
            v_total := v_total + 1;
            INSERT INTO historial_estados_factura
                (id_factura, id_estado_anterior, id_estado_nuevo, id_usuario, observacion)
            VALUES (v_factura_id, v_id_estado_embarque, v_id_estado_proceso, auth.uid(), 'Viaje iniciado');
        END IF;
    END LOOP;
    RETURN jsonb_build_object('id_viaje', p_id_viaje, 'total_facturas', v_total, 'id_chofer', v_id_chofer);
END;
$$;

-- ============================================================
-- reiniciar_viaje: limpia fecha_finalizacion
-- ============================================================
CREATE OR REPLACE FUNCTION public.reiniciar_viaje(p_id_viaje uuid)
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
        RAISE EXCEPTION 'Sesión no válida' USING ERRCODE = 'P0002';
    END IF;
    SELECT COALESCE(LOWER(r.nombre_rol), '') INTO v_rol
    FROM public.usuarios u
    LEFT JOIN public.roles r ON r.id_rol = u.id_rol
    WHERE u.id_usuario = v_uid;
    IF v_rol NOT IN ('administrador', 'coordinador', 'analista') THEN
        RAISE EXCEPTION 'No tienes permiso para reiniciar viajes' USING ERRCODE = 'P0001';
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
    UPDATE public.viajes
    SET estado = 'programado', fecha_finalizacion = NULL
    WHERE id_viaje = p_id_viaje;
    RETURN jsonb_build_object('id_viaje', p_id_viaje, 'estado', 'programado', 'total_facturas', v_total);
END;
$$;

-- ============================================================
-- crear_viaje (overload con p_id_vehiculo text): reutiliza viaje o crea.
-- Acepta 'nuevo' y 'incidencia' recuperable; setea ventana laboral.
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
                SELECT i.tipo_incidencia FROM incidencias i
                WHERE i.id_detalle_fact = v_factura_id
                ORDER BY i.hora_reporte DESC LIMIT 1
            ), '') IN ('FUERA_HORARIO', 'CERRADO', 'FALTANTE', 'DANADO') THEN
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
-- crear_viaje (overload con p_municipio): siempre crea. Misma lógica.
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
                SELECT i.tipo_incidencia FROM incidencias i
                WHERE i.id_detalle_fact = v_factura_id
                ORDER BY i.hora_reporte DESC LIMIT 1
            ), '') IN ('FUERA_HORARIO', 'CERRADO', 'FALTANTE', 'DANADO') THEN
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
-- obtener_viajes: incluye fecha_finalizacion y ventana laboral;
-- para viajes finalizados el estado de cada parada es el que tenía
-- AL MOMENTO DEL CIERRE (último historial < fecha_finalizacion).
-- ============================================================
CREATE OR REPLACE FUNCTION public.obtener_viajes()
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
                    END
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

-- ============================================================
-- actualizar_ventana_viaje: editar la ventana laboral (staff).
-- ============================================================
CREATE OR REPLACE FUNCTION public.actualizar_ventana_viaje(p_id_viaje uuid, p_inicio time, p_fin time)
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
        RAISE EXCEPTION 'Solo el personal interno puede editar la ventana laboral' USING ERRCODE = 'P0001';
    END IF;
    UPDATE public.viajes
    SET ventana_inicio = p_inicio,
        ventana_fin = p_fin
    WHERE id_viaje = p_id_viaje;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Viaje no encontrado' USING ERRCODE = 'P0002';
    END IF;
    RETURN jsonb_build_object('id_viaje', p_id_viaje, 'ventana_inicio', p_inicio, 'ventana_fin', p_fin);
END;
$$;

-- ============================================================
-- resolver_incidencia: el admin resuelve la incidencia de una factura
-- (la vuelve a 'nuevo' para re-despacharla).
-- ============================================================
CREATE OR REPLACE FUNCTION public.resolver_incidencia(p_id_factura uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_rol text;
    v_id_estado_incidencia uuid;
    v_id_estado_nuevo uuid;
    v_anterior uuid;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Sesión no válida' USING ERRCODE = 'P0002';
    END IF;
    SELECT COALESCE(LOWER(r.nombre_rol), '') INTO v_rol
    FROM public.usuarios u
    LEFT JOIN public.roles r ON r.id_rol = u.id_rol
    WHERE u.id_usuario = v_uid;
    IF v_rol NOT IN ('administrador', 'coordinador', 'analista') THEN
        RAISE EXCEPTION 'Solo el personal interno puede resolver incidencias' USING ERRCODE = 'P0001';
    END IF;
    SELECT id_estado INTO v_id_estado_incidencia FROM estados WHERE LOWER(nombre_estado) = 'incidencia';
    SELECT id_estado INTO v_id_estado_nuevo FROM estados WHERE LOWER(nombre_estado) = 'nuevo';
    SELECT id_estado INTO v_anterior
    FROM public.facturas WHERE id_factura = p_id_factura FOR UPDATE;
    IF v_anterior IS NULL THEN
        RAISE EXCEPTION 'Factura no encontrada' USING ERRCODE = 'P0002';
    END IF;
    IF v_anterior = v_id_estado_nuevo THEN
        RETURN jsonb_build_object('ok', true, 'id_factura', p_id_factura, 'ya_nuevo', true);
    END IF;
    INSERT INTO public.historial_estados_factura
        (id_factura, id_estado_anterior, id_estado_nuevo, id_usuario, observacion)
    VALUES (p_id_factura, v_anterior, v_id_estado_nuevo, v_uid, 'Incidencia resuelta');
    UPDATE public.facturas SET id_estado = v_id_estado_nuevo WHERE id_factura = p_id_factura;
    RETURN jsonb_build_object('ok', true, 'id_factura', p_id_factura);
END;
$$;

GRANT EXECUTE ON FUNCTION public.finalizar_viaje(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.iniciar_viaje(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reiniciar_viaje(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crear_viaje(uuid, text, date, uuid[], numeric, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crear_viaje(uuid, uuid, text, date, uuid[], numeric, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.obtener_viajes() TO authenticated;
GRANT EXECUTE ON FUNCTION public.actualizar_ventana_viaje(uuid, time, time) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolver_incidencia(uuid) TO authenticated;
