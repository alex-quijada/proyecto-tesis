-- ============================================================
-- 00090: Clientes fuera de tiempo (hora de volver al almacén).
--
-- 1) obtener_viaje_chofer expone ventana_inicio / ventana_fin para
--    que el chofer pueda evaluar cuándo es hora de volver.
-- 2) finalizar_viaje_fuera_horario: marca las facturas pendientes
--    (proceso/espera/entrega/embarque/nuevo) como incidencia
--    FUERA_HORARIO con recuperable=true (re-despachables) y
--    finaliza el viaje. La dispara el chofer al decidir volver.
-- ============================================================

-- ============================================================
-- 1) obtener_viaje_chofer: + ventana laboral
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
            v.ventana_inicio,
            v.ventana_fin,
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
-- 2) finalizar_viaje_fuera_horario: pendientes → FUERA_HORARIO
--    (recuperable=true) y cierra el viaje.
-- ============================================================
CREATE OR REPLACE FUNCTION public.finalizar_viaje_fuera_horario(p_id_viaje uuid)
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
    v_id_estado_incidencia uuid;
    v_total integer := 0;
    v_factura uuid;
    v_anterior uuid;
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

    SELECT id_estado INTO v_id_estado_incidencia
    FROM public.estados WHERE LOWER(nombre_estado) = 'incidencia';
    IF v_id_estado_incidencia IS NULL THEN
        RAISE EXCEPTION 'Estado incidencia no encontrado';
    END IF;

    -- Marcar como FUERA_HORARIO (recuperable) cada factura pendiente del viaje.
    FOR v_factura IN
        SELECT i.id_factura
        FROM public.itinerario_viaje i
        JOIN public.facturas f ON f.id_factura = i.id_factura
        JOIN public.estados e ON e.id_estado = f.id_estado
        WHERE i.id_viaje = p_id_viaje
          AND e.nombre_estado NOT IN ('finalizado', 'incidencia')
    LOOP
        SELECT id_estado INTO v_anterior FROM public.facturas WHERE id_factura = v_factura;

        INSERT INTO public.incidencias
            (id_detalle_fact, tipo_incidencia, descripcion, foto_evidencia_url, recuperable, resuelta)
        VALUES
            (v_factura, 'FUERA_HORARIO',
             'No entregado — hora de volver al almacén', NULL, true, false);

        INSERT INTO public.historial_estados_factura
            (id_factura, id_estado_anterior, id_estado_nuevo, id_usuario, observacion)
        VALUES
            (v_factura, v_anterior, v_id_estado_incidencia, v_uid,
             '[FUERA_HORARIO] No entregado al finalizar la jornada');

        UPDATE public.facturas
        SET id_estado = v_id_estado_incidencia
        WHERE id_factura = v_factura;

        v_total := v_total + 1;
    END LOOP;

    UPDATE public.viajes
    SET estado = 'finalizado',
        fecha_finalizacion = now()
    WHERE id_viaje = p_id_viaje;

    RETURN jsonb_build_object(
        'id_viaje', p_id_viaje,
        'estado', 'finalizado',
        'total_fuera_horario', v_total
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.finalizar_viaje_fuera_horario(uuid) TO authenticated;