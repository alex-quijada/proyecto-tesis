-- ============================================================
-- 00087: Tiempos por viaje para el Historial de Entregas.
--
-- Devuelve, para todos los viajes finalizados, un resumen de
-- tiempos calculado desde historial_estados_factura:
--   - tiempo_total_min: desde el primer cambio de cualquier factura
--     hasta el último (o fecha_finalizacion si existe).
--   - llegada_primera_parada_min: minutos desde el inicio hasta que
--     la parada con menor orden_visita entró a 'espera'.
--   - minutos_por_estado: minutos acumulados en cada estado
--     (embarque/proceso/espera/entrega/incidencia) sumando la
--     diferencia entre cada cambio y el siguiente de la factura.
--
-- Solo personal interno. Una sola llamada para todo el historial.
-- ============================================================

CREATE OR REPLACE FUNCTION public.obtener_tiempos_viajes()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_resultado jsonb;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Sesión no válida' USING ERRCODE = 'P0002';
    END IF;

    IF NOT public.es_personal_interno() THEN
        RAISE EXCEPTION 'No tienes permiso para consultar tiempos' USING ERRCODE = 'P0001';
    END IF;

    WITH cambios AS (
        SELECT
            h.id_factura,
            i.id_viaje,
            i.orden_visita,
            he.nombre_estado,
            h.fecha_cambio,
            LEAD(h.fecha_cambio) OVER (
                PARTITION BY h.id_factura ORDER BY h.fecha_cambio
            ) AS fecha_salida
        FROM public.historial_estados_factura h
        JOIN public.itinerario_viaje i ON i.id_factura = h.id_factura
        JOIN public.estados he ON he.id_estado = h.id_estado_nuevo
        JOIN public.viajes v ON v.id_viaje = i.id_viaje
        WHERE v.estado = 'finalizado'
    ),
    por_viaje AS (
        SELECT
            c.id_viaje,
            -- Inicio = primer cambio de la factura más antigua del viaje.
            COALESCE(
                EXTRACT(EPOCH FROM (
                    COALESCE(
                        (SELECT max(c2.fecha_cambio) FROM cambios c2 WHERE c2.id_viaje = c.id_viaje),
                        now()
                    )
                    - (SELECT min(c3.fecha_cambio) FROM cambios c3 WHERE c3.id_viaje = c.id_viaje)
                )) / 60,
                0
            ) AS tiempo_total_min
        FROM (SELECT DISTINCT id_viaje FROM cambios) c
    ),
    primera_parada AS (
        SELECT DISTINCT ON (c.id_viaje)
            c.id_viaje,
            c.fecha_cambio
        FROM cambios c
        WHERE LOWER(c.nombre_estado) = 'espera'
        ORDER BY c.id_viaje, c.orden_visita ASC, c.fecha_cambio ASC
    ),
    por_estado AS (
        SELECT
            c.id_viaje,
            LOWER(c.nombre_estado) AS estado,
            COALESCE(sum(
                EXTRACT(EPOCH FROM (c.fecha_salida - c.fecha_cambio)) / 60
            ), 0)::numeric AS minutos
        FROM cambios c
        WHERE c.fecha_salida IS NOT NULL
          AND LOWER(c.nombre_estado) IN ('embarque', 'proceso', 'espera', 'entrega', 'incidencia')
        GROUP BY c.id_viaje, LOWER(c.nombre_estado)
    ),
    agregado AS (
        SELECT
            pv.id_viaje,
            round(pv.tiempo_total_min::numeric, 1) AS tiempo_total_min,
            round(
                COALESCE(EXTRACT(EPOCH FROM (
                    pp.fecha_cambio - (
                        SELECT min(c.fecha_cambio) FROM cambios c WHERE c.id_viaje = pv.id_viaje
                    )
                )) / 60, 0)::numeric, 1
            ) AS llegada_primera_parada_min,
            COALESCE(jsonb_object_agg(pe.estado, pe.minutos), '{}'::jsonb) AS minutos_por_estado
        FROM por_viaje pv
        LEFT JOIN primera_parada pp ON pp.id_viaje = pv.id_viaje
        LEFT JOIN por_estado pe ON pe.id_viaje = pv.id_viaje
        GROUP BY pv.id_viaje, pv.tiempo_total_min, pp.fecha_cambio
    )
    SELECT COALESCE(jsonb_agg(a ORDER BY a.id_viaje), '[]'::jsonb)
    INTO v_resultado
    FROM agregado a;

    RETURN v_resultado;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.obtener_tiempos_viajes() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.obtener_tiempos_viajes() TO authenticated;