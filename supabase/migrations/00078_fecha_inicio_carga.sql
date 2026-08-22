-- ============================================================
-- 00078: obtener_guias_chofer — exponer fecha_inicio_carga por
-- factura (momento en que la factura entró a 'embarque', desde
-- historial_estados_factura). Se usa para calcular el tiempo real
-- de carga del chofer (getTiempoCarga).
-- ============================================================
CREATE OR REPLACE FUNCTION public.obtener_guias_chofer()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
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
                    WHEN bool_or(st2.nombre_estado = 'entrega') THEN 'EN_ENTREGA'
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
                            'nombre_prioridad', pr.nombre_prioridad,
                            -- Momento en que la factura entró a 'embarque'
                            -- (inicio de la carga). Fallback a fecha_registro.
                            'fecha_inicio_carga', COALESCE((
                                SELECT h.fecha_cambio
                                FROM public.historial_estados_factura h
                                JOIN public.estados he ON he.id_estado = h.id_estado_nuevo
                                WHERE h.id_factura = f.id_factura
                                  AND LOWER(he.nombre_estado) = 'embarque'
                                ORDER BY h.fecha_cambio ASC
                                LIMIT 1
                            ), g.fecha_registro)
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

GRANT EXECUTE ON FUNCTION public.obtener_guias_chofer() TO authenticated;