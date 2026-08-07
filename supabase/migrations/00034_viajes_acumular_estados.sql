-- ==========================================
-- 00034: Viajes acumulables + cierre desde el chofer
--
-- 1) Se elimina municipio de viajes (no se controla ahí).
-- 2) crear_viaje acumula facturas en el viaje abierto ('programado')
--    del chofer, o crea uno nuevo si no existe.
-- 3) iniciar_viaje cierra el viaje desde el chofer: reordena itinerario
--    (ruta optimizada persistida) y pasa facturas a 'proceso'.
-- ==========================================

-- 1) Drop municipio de viajes
ALTER TABLE public.viajes DROP COLUMN IF EXISTS municipio;

-- 2) Asegurar columnas necesarias (auto-sana derivas del esquema)
ALTER TABLE public.viajes ADD COLUMN IF NOT EXISTS fecha_viaje DATE DEFAULT CURRENT_DATE;
ALTER TABLE public.viajes ALTER COLUMN estado SET DEFAULT 'programado';
ALTER TABLE public.itinerario_viaje ADD COLUMN IF NOT EXISTS id_factura uuid;
ALTER TABLE public.itinerario_viaje ADD COLUMN IF NOT EXISTS orden_visita integer;

-- 3) Normalizar estado: 'activo' -> 'programado' (abierto)
UPDATE public.viajes SET estado = 'programado' WHERE estado IN ('activo', 'PROGRAMADO');

-- ==========================================
-- crear_viaje: agregar facturas a viaje (acumula o crea)
-- ==========================================
CREATE OR REPLACE FUNCTION public.crear_viaje(
    p_id_chofer UUID,
    p_id_vehiculo TEXT,
    p_fecha_viaje DATE DEFAULT CURRENT_DATE,
    p_ids_facturas UUID[] DEFAULT '{}',
    p_distancia_total_km NUMERIC DEFAULT NULL,
    p_duracion_total_min NUMERIC DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id_viaje UUID;
    v_nuevo BOOLEAN := true;
    v_id_estado_embarque UUID;
    v_id_estado_nuevo UUID;
    v_orden INTEGER;
    v_factura_id UUID;
    v_total_facturas INTEGER := 0;
    v_max_orden INTEGER;
BEGIN
    SELECT id_estado INTO v_id_estado_embarque FROM estados WHERE LOWER(nombre_estado) = 'embarque';
    SELECT id_estado INTO v_id_estado_nuevo FROM estados WHERE LOWER(nombre_estado) = 'nuevo';

    IF v_id_estado_embarque IS NULL THEN
        RAISE EXCEPTION 'Estado "embarque" no encontrado en la tabla estados';
    END IF;

    -- Reutilizar el viaje abierto del chofer, si existe
    SELECT v.id_viaje INTO v_id_viaje
    FROM viajes v
    WHERE v.id_chofer = p_id_chofer
      AND v.estado = 'programado'
    ORDER BY v.fecha_creacion DESC NULLS LAST
    LIMIT 1;

    IF v_id_viaje IS NULL THEN
        INSERT INTO viajes (id_chofer, id_vehiculo, fecha_viaje, distancia_total_km, duracion_total_min)
        VALUES (p_id_chofer, p_id_vehiculo, p_fecha_viaje, p_distancia_total_km, p_duracion_total_min)
        RETURNING id_viaje INTO v_id_viaje;
    ELSE
        v_nuevo := false;
        UPDATE viajes
        SET id_vehiculo = p_id_vehiculo,
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

        UPDATE facturas
        SET id_estado = v_id_estado_embarque
        WHERE id_factura = v_factura_id AND id_estado = v_id_estado_nuevo;

        IF FOUND THEN
            v_total_facturas := v_total_facturas + 1;
            INSERT INTO historial_estados_factura
                (id_factura, id_estado_anterior, id_estado_nuevo, id_usuario, observacion)
            VALUES (v_factura_id, v_id_estado_nuevo, v_id_estado_embarque, auth.uid(), 'Agregada a viaje');
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'id_viaje', v_id_viaje,
        'nuevo', v_nuevo,
        'total_facturas', v_total_facturas,
        'id_chofer', p_id_chofer
    );
END;
$$;

-- ==========================================
-- iniciar_viaje: cierra el viaje desde el chofer
-- ==========================================
CREATE OR REPLACE FUNCTION public.iniciar_viaje(
    p_id_viaje UUID,
    p_ids_facturas_ordenadas UUID[] DEFAULT NULL
)
RETURNS JSONB
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

    -- Persistir el orden óptimo de la ruta
    IF p_ids_facturas_ordenadas IS NOT NULL AND array_length(p_ids_facturas_ordenadas, 1) > 0 THEN
        v_orden := 0;
        FOREACH v_factura_id IN ARRAY p_ids_facturas_ordenadas
        LOOP
            v_orden := v_orden + 1;
            UPDATE itinerario_viaje SET orden_visita = v_orden
            WHERE id_viaje = p_id_viaje AND id_factura = v_factura_id;
        END LOOP;
    END IF;

    -- Cerrar viaje y marcar facturas en proceso
    UPDATE viajes SET estado = 'proceso' WHERE id_viaje = p_id_viaje;

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

    RETURN jsonb_build_object(
        'id_viaje', p_id_viaje,
        'total_facturas', v_total,
        'id_chofer', v_id_chofer
    );
END;
$$;

-- ==========================================
-- obtener_viaje_chofer: viaje(s) activo(s) del chofer con paradas ordenadas
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
        LEFT JOIN vehiculos veh ON veh.id_vehiculo::text = v.id_vehiculo
        WHERE v.id_chofer = auth.uid()
          AND v.estado IN ('programado', 'proceso')
        ORDER BY v.fecha_creacion DESC
    ) v;

    RETURN v_result;
END;
$$;

-- ==========================================
-- obtener_viajes (admin): todos los viajes con paradas y conteos
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
        LEFT JOIN vehiculos veh ON veh.id_vehiculo::text = v.id_vehiculo
        ORDER BY v.fecha_creacion DESC
    ) t;

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.crear_viaje(uuid, text, date, uuid[], numeric, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.iniciar_viaje(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.obtener_viaje_chofer() TO authenticated;
GRANT EXECUTE ON FUNCTION public.obtener_viajes() TO authenticated;
