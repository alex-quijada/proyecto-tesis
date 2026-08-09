-- ==========================================
-- 00049: fix RPCs del chofer que referencian esquema eliminado
--
-- La migración 00035 creó obtener_guias_chofer() y finalizar_entrega()
-- referenciando `guias_carga.estado_guia` (columna) e
-- `historial_estados_guia` (tabla), ambos eliminados por la 00021.
-- El cuerpo plpgsql se valida en runtime, así que las funciones
-- existen pero revientan al invocarse → el home del chofer no recibe
-- guías.
--
-- Fix: obtener_guias_chofer() deriva `estado_guia` desde las facturas
-- (misma lógica que el front admin), y finalizar_entrega() deja de
-- escribir historial/estado de guía (el estado se calcula de las facturas).
-- ==========================================

-- ==========================================
-- 1) obtener_guias_chofer()
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
                            'reglas', c.reglas,
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
-- 2) finalizar_entrega()
-- ==========================================
DROP FUNCTION IF EXISTS public.finalizar_entrega(uuid, text);

CREATE OR REPLACE FUNCTION public.finalizar_entrega(
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

    -- La factura debe pertenecer a una guía del chofer autenticado
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
    SET id_estado = v_id_estado_finalizado
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
