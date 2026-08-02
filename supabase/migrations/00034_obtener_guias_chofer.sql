-- ==========================================
-- RPCs para la vista móvil del chofer
-- Las políticas RLS de guias_carga/facturas no
-- permiten SELECT al rol Chofer, por eso se
-- exponen funciones SECURITY DEFINER que
-- filtran por el usuario autenticado.
-- ==========================================

-- ==========================================
-- 1) obtener_guias_chofer()
--    Devuelve todas las guías asignadas al
--    chofer autenticado, con sus facturas
--    enriquecidas (cliente, sucursal, estado).
-- ==========================================
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
            g.estado_guia,
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
-- 2) finalizar_entrega(p_id_factura, p_observacion)
--    Marca una factura como finalizado y, si
--    todas las facturas de la guía están
--    finalizadas, marca la guía como FINALIZADO.
--    Registra historial en ambas tablas.
-- ==========================================
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
    v_estado_guia varchar(50);
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

    IF v_pendientes = 0 THEN
        SELECT g.estado_guia INTO v_estado_guia
        FROM public.guias_carga g
        WHERE g.id_guia = v_id_guia
        FOR UPDATE OF g;

        IF v_estado_guia IS DISTINCT FROM 'FINALIZADO' THEN
            INSERT INTO public.historial_estados_guia
                (id_guia, estado_anterior, estado_nuevo, id_usuario, observacion)
            VALUES
                (v_id_guia, v_estado_guia, 'FINALIZADO', v_uid, p_observacion);

            UPDATE public.guias_carga
            SET estado_guia = 'FINALIZADO'
            WHERE id_guia = v_id_guia;
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'ok', true,
        'id_factura', p_id_factura,
        'id_guia', v_id_guia,
        'guia_finalizada', v_pendientes = 0
    );
END;
$$;
