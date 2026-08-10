-- ==========================================
-- 00052: guardar_ruta_viaje — persiste la ruta por calles calculada
-- con Google en viajes.ruta_detallada, para no llamar a la API cada vez.
--
-- El chofer optimiza la ruta en /driver/ruta (getRutaDetallada: path +
-- pasos + distancia + duración) y la guarda aquí. /driver/mapa y cualquier
-- otra vista futura leen ese JSONB y dibujan/ navegan sin consumir Google.
--
-- ruta_detallada: JSONB con la forma del front
--   { path: [{lat,lng}], distancia: number(m), duracion: number(s),
--     pasos: [{ legIndex, stepIndex, instruccion, maniobra,
--               distancia, duracion, inicio:{lat,lng}, fin:{lat,lng} }] }
-- ==========================================

ALTER TABLE public.viajes
    ADD COLUMN IF NOT EXISTS ruta_detallada JSONB;

-- ==========================================
-- guardar_ruta_viaje: actualiza ruta_detallada + distancia/duración
-- ==========================================
CREATE OR REPLACE FUNCTION public.guardar_ruta_viaje(
    p_id_viaje UUID,
    p_ruta_detallada JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id_chofer UUID;
    v_rol TEXT;
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
        RAISE EXCEPTION 'No tienes permiso para modificar este viaje';
    END IF;

    IF p_ruta_detallada IS NOT NULL THEN
        UPDATE viajes
        SET ruta_detallada = p_ruta_detallada,
            distancia_total_km = COALESCE((p_ruta_detallada->>'distancia')::numeric / 1000, distancia_total_km),
            duracion_total_min = COALESCE((p_ruta_detallada->>'duracion')::numeric / 60, duracion_total_min)
        WHERE id_viaje = p_id_viaje;
    END IF;

    RETURN jsonb_build_object(
        'id_viaje', p_id_viaje,
        'guardada', p_ruta_detallada IS NOT NULL
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.guardar_ruta_viaje(UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.guardar_ruta_viaje(UUID, JSONB) TO authenticated;

-- ==========================================
-- obtener_viaje_chofer: incluir v.ruta_detallada
-- ==========================================
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
                    'latitud', s.latitud,
                    'longitud', s.longitud,
                    'monto_dolares', f.monto_dolares,
                    'estado_factura', e.nombre_estado
                ) ORDER BY i.orden_visita)
                FROM itinerario_viaje i
                JOIN facturas f ON f.id_factura = i.id_factura
                LEFT JOIN guias_carga g ON g.id_guia = f.id_guia
                LEFT JOIN sucursales_cliente s ON s.id = f.id_sucursal
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

-- ==========================================
-- obtener_viajes (admin): incluir v.ruta_detallada
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
BEGIN
    SELECT id_estado INTO v_embarque FROM estados WHERE LOWER(nombre_estado) = 'embarque';
    SELECT id_estado INTO v_proceso FROM estados WHERE LOWER(nombre_estado) = 'proceso';

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
                SELECT jsonb_agg(jsonb_build_object(
                    'orden_visita', i.orden_visita,
                    'id_factura', i.id_factura,
                    'numero_factura', f.num_factura,
                    'id_guia', f.id_guia,
                    'codigo_guia', g.codigo_guia,
                    'nombre_cliente', c.nombre_comercial,
                    'direccion', s.direccion,
                    'latitud', s.latitud,
                    'longitud', s.longitud,
                    'estado_factura', e.nombre_estado
                ) ORDER BY i.orden_visita)
                FROM itinerario_viaje i
                JOIN facturas f ON f.id_factura = i.id_factura
                LEFT JOIN guias_carga g ON g.id_guia = f.id_guia
                LEFT JOIN sucursales_cliente s ON s.id = f.id_sucursal
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

GRANT EXECUTE ON FUNCTION public.obtener_viaje_chofer() TO authenticated;
GRANT EXECUTE ON FUNCTION public.obtener_viajes() TO authenticated;
