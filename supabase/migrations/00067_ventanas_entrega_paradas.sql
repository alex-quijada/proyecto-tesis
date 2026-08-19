-- ============================================================
-- 00067: Exponer ventana de recepción (hora_desde / hora_hasta)
-- por parada en obtener_viaje_chofer y obtener_viajes.
-- Se usa para el ordenamiento VRPTW (tiempo de entrega) en el front.
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
        LEFT JOIN vehiculos veh ON veh.id_vehiculo = v.id_vehiculo
        WHERE v.id_chofer = auth.uid()
          AND v.estado IN ('programado', 'proceso')
        ORDER BY v.fecha_creacion DESC
    ) v;

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.obtener_viaje_chofer() TO authenticated;

-- obtener_viajes: añadir hora_desde / hora_hasta por parada
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

GRANT EXECUTE ON FUNCTION public.obtener_viajes(uuid) TO authenticated;
