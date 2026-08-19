-- ============================================================
-- 00065: Re-entrega con parada extra en el MISMO viaje en curso.
-- - obtener_viaje_chofer expone incidencia_recuperable / incidencia_id.
-- - RPC reagregar_factura_reenvio (chofer del viaje o staff):
--   factura 'incidencia' recuperable -> 'proceso' (parada navegable).
-- - Realtime: incidencias agregada a la publicación supabase_realtime.
-- ============================================================

-- ============================================================
-- 1) obtener_viaje_chofer: exponer la última incidencia por parada
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

-- El default de recuperable pasa a false SIEMPRE: ninguna incidencia se
-- re-entrega sin aprobación explícita del admin (decide caso a caso).
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

    -- La incidencia NO es recuperable por defecto: la aprueba el admin.
    INSERT INTO public.incidencias
        (id_detalle_fact, tipo_incidencia, descripcion, foto_evidencia_url, recuperable)
    VALUES
        (p_id_factura, p_tipo, COALESCE(p_descripcion, ''), p_foto_url, false)
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
        'id_factura', p_id_factura, 'recuperable', false
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.reportar_incidencia(uuid, text, text, text) TO authenticated;

-- ============================================================
-- 2) reagregar_factura_reenvio: incidencia recuperable -> proceso
--    Solo para el viaje en 'proceso'. La dispara el chofer del
--    viaje (o staff) cuando el admin autorizó la re-entrega.
-- ============================================================
CREATE OR REPLACE FUNCTION public.reagregar_factura_reenvio(
    p_id_viaje uuid,
    p_ids_facturas uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_rol text;
    v_es_chofer boolean;
    v_id_estado_proceso uuid;
    v_id_estado_incidencia uuid;
    v_es_transicion boolean;
    v_factura uuid;
    v_total integer := 0;
    v_viaje_estado text;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Sesión no válida' USING ERRCODE = 'P0002';
    END IF;

    SELECT v.estado INTO v_viaje_estado
    FROM public.viajes v
    WHERE v.id_viaje = p_id_viaje;
    IF v_viaje_estado IS NULL THEN
        RAISE EXCEPTION 'Viaje no encontrado' USING ERRCODE = 'P0002';
    END IF;
    IF v_viaje_estado <> 'proceso' THEN
        RAISE EXCEPTION 'La re-entrega solo aplica a un viaje en proceso' USING ERRCODE = 'P0001';
    END IF;

    SELECT v.id_chofer = v_uid INTO v_es_chofer
    FROM public.viajes v
    WHERE v.id_viaje = p_id_viaje;

    SELECT COALESCE(LOWER(r.nombre_rol), '') INTO v_rol
    FROM public.usuarios u
    LEFT JOIN public.roles r ON r.id_rol = u.id_rol
    WHERE u.id_usuario = v_uid;

    IF NOT (v_es_chofer OR v_rol IN ('administrador', 'coordinador', 'analista')) THEN
        RAISE EXCEPTION 'No autorizado para re-agregar facturas a este viaje' USING ERRCODE = 'P0001';
    END IF;

    SELECT id_estado INTO v_id_estado_proceso FROM public.estados WHERE LOWER(nombre_estado) = 'proceso';
    SELECT id_estado INTO v_id_estado_incidencia FROM public.estados WHERE LOWER(nombre_estado) = 'incidencia';
    IF v_id_estado_proceso IS NULL OR v_id_estado_incidencia IS NULL THEN
        RAISE EXCEPTION 'Estados de factura no encontrados';
    END IF;

    FOREACH v_factura IN ARRAY p_ids_facturas
    LOOP
        -- Debe pertenecer al viaje y estar en 'incidencia' con la última
        -- incidencia marcada como recuperable.
        IF NOT EXISTS (
            SELECT 1 FROM public.itinerario_viaje i
            WHERE i.id_viaje = p_id_viaje AND i.id_factura = v_factura
        ) THEN
            CONTINUE;
        END IF;

        SELECT es_transicion_valida_factura('incidencia', 'proceso') INTO v_es_transicion;
        IF NOT COALESCE(v_es_transicion, false) THEN
            CONTINUE;
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM public.facturas f
            WHERE f.id_factura = v_factura AND f.id_estado = v_id_estado_incidencia
        ) THEN
            CONTINUE;
        END IF;

        IF NOT COALESCE((
            SELECT i.recuperable FROM public.incidencias i
            WHERE i.id_detalle_fact = v_factura
            ORDER BY i.hora_reporte DESC
            LIMIT 1
        ), false) THEN
            CONTINUE;
        END IF;

        UPDATE public.facturas
        SET id_estado = v_id_estado_proceso
        WHERE id_factura = v_factura;

        INSERT INTO public.historial_estados_factura
            (id_factura, id_estado_anterior, id_estado_nuevo, id_usuario, observacion)
        VALUES (v_factura, v_id_estado_incidencia, v_id_estado_proceso, v_uid, 'Re-entrega autorizada');

        v_total := v_total + 1;
    END LOOP;

    RETURN jsonb_build_object('id_viaje', p_id_viaje, 'total_reactivadas', v_total);
END;
$$;

GRANT EXECUTE ON FUNCTION public.reagregar_factura_reenvio(uuid, uuid[]) TO authenticated;

-- ============================================================
-- 3) Realtime: agregar incidencias a la publicación
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.incidencias;
