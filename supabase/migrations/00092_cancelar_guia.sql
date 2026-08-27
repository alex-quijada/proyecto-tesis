-- ============================================================
-- 00092: Cancelación de guías.
--
-- - Nuevo estado 'cancelada' en public.estados.
-- - Columna facturas.activa + índice único parcial sobre num_factura
--   (solo facturas activas): una factura cancelada libera su número
--   para poder re-registrarse en el futuro.
-- - es_transicion_valida_factura: permitir nuevo/embarque -> cancelada.
-- - RPC cancelar_guia (staff): valida que todas las facturas estén en
--   nuevo/embarque, las marca cancelada + activa=false con historial,
--   y las saca de cualquier viaje (itinerario_viaje) para que no le
--   aparezcan al chofer ni en optimización.
-- - obtener_guias_chofer: estado de guía derivado 'CANCELADO'.
-- ============================================================

INSERT INTO public.estados (nombre_estado, descripcion)
VALUES ('cancelada', 'Factura cancelada — no se entrega; puede re-registrarse')
ON CONFLICT (nombre_estado) DO NOTHING;

-- ============================================================
-- 1) facturas.activa + índice único parcial
-- ============================================================
ALTER TABLE public.facturas
    ADD COLUMN IF NOT EXISTS activa boolean NOT NULL DEFAULT true;

ALTER TABLE public.facturas
    DROP CONSTRAINT IF EXISTS facturas_num_factura_key;

CREATE UNIQUE INDEX IF NOT EXISTS facturas_num_factura_activa_key
    ON public.facturas (num_factura)
    WHERE activa;

-- ============================================================
-- 2) es_transicion_valida_factura: nuevo/embarque -> cancelada
-- ============================================================
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
        WHEN 'nuevo'       THEN p_nuevo IN ('embarque', 'incidencia', 'cancelada')
        WHEN 'embarque'    THEN p_nuevo IN ('proceso', 'incidencia', 'cancelada')
        WHEN 'proceso'     THEN p_nuevo IN ('espera', 'incidencia')
        WHEN 'espera'      THEN p_nuevo IN ('entrega', 'incidencia')
        WHEN 'entrega'     THEN p_nuevo IN ('finalizado', 'incidencia')
        WHEN 'incidencia'  THEN p_nuevo IN ('proceso', 'espera', 'entrega')
        WHEN 'finalizado'  THEN false
        WHEN 'cancelada'   THEN false
        ELSE false
    END;
END;
$$;

-- ============================================================
-- 3) cancelar_guia (staff)
-- ============================================================
CREATE OR REPLACE FUNCTION public.cancelar_guia(p_id_guia uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_rol text;
    v_id_estado_cancelada uuid;
    v_factura uuid;
    v_anterior uuid;
    v_total integer := 0;
    v_no_cancelable integer;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Sesión no válida' USING ERRCODE = 'P0002';
    END IF;

    SELECT COALESCE(LOWER(r.nombre_rol), '') INTO v_rol
    FROM public.usuarios u
    LEFT JOIN public.roles r ON r.id_rol = u.id_rol
    WHERE u.id_usuario = v_uid;

    IF v_rol NOT IN ('administrador', 'coordinador', 'analista') THEN
        RAISE EXCEPTION 'Solo el personal interno puede cancelar guías' USING ERRCODE = 'P0001';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.guias_carga WHERE id_guia = p_id_guia) THEN
        RAISE EXCEPTION 'Guía no encontrada' USING ERRCODE = 'P0002';
    END IF;

    SELECT id_estado INTO v_id_estado_cancelada
    FROM public.estados WHERE LOWER(nombre_estado) = 'cancelada';
    IF v_id_estado_cancelada IS NULL THEN
        RAISE EXCEPTION 'Estado cancelada no encontrado';
    END IF;

    -- Solo se puede cancelar si TODAS las facturas están en nuevo o embarque.
    SELECT count(*) INTO v_no_cancelable
    FROM public.facturas f
    JOIN public.estados e ON e.id_estado = f.id_estado
    WHERE f.id_guia = p_id_guia
      AND e.nombre_estado NOT IN ('nuevo', 'embarque');
    IF v_no_cancelable > 0 THEN
        RAISE EXCEPTION 'La guía no puede cancelarse: tiene facturas en un estado avanzado (proceso, entrega, incidencia o finalizado)';
    END IF;

    -- Marcar cada factura como cancelada + inactiva, con historial.
    FOR v_factura IN
        SELECT f.id_factura FROM public.facturas f WHERE f.id_guia = p_id_guia
    LOOP
        SELECT f.id_estado INTO v_anterior FROM public.facturas f WHERE f.id_factura = v_factura;

        INSERT INTO public.historial_estados_factura
            (id_factura, id_estado_anterior, id_estado_nuevo, id_usuario, observacion)
        VALUES
            (v_factura, v_anterior, v_id_estado_cancelada, v_uid, 'Guía cancelada');

        UPDATE public.facturas
        SET id_estado = v_id_estado_cancelada,
            activa = false
        WHERE id_factura = v_factura;

        v_total := v_total + 1;
    END LOOP;

    -- Sacar las facturas de cualquier viaje (itinerario_viaje): así no le
    -- aparecen al chofer ni en optimización.
    DELETE FROM public.itinerario_viaje
    WHERE id_factura IN (
        SELECT f.id_factura FROM public.facturas f WHERE f.id_guia = p_id_guia
    );

    RETURN jsonb_build_object(
        'id_guia', p_id_guia,
        'total_facturas', v_total
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancelar_guia(uuid) TO authenticated;

-- ============================================================
-- 4) obtener_guias_chofer: derivar estado 'CANCELADO'
-- ============================================================
CREATE OR REPLACE FUNCTION public.obtener_guias_chofer()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
                    WHEN bool_and(st2.nombre_estado = 'cancelada') THEN 'CANCELADO'
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
$function$;

GRANT EXECUTE ON FUNCTION public.obtener_guias_chofer() TO authenticated;