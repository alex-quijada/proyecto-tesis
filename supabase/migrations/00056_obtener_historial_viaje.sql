-- ============================================================
-- 00056: Historial de estados del viaje (línea de tiempo Monitoreo)
-- Devuelve cada transición de estado de todas las facturas del
-- viaje (uno por registro de historial), con datos de la factura
-- y la fecha. Solo personal interno (Administrador/Analista/Coordinador).
-- ============================================================

CREATE OR REPLACE FUNCTION public.obtener_historial_viaje(p_id_viaje uuid)
RETURNS TABLE(
    id_factura uuid,
    numero_factura varchar(50),
    nombre_cliente varchar(200),
    orden_visita integer,
    estado varchar(50),
    observacion text,
    fecha_cambio timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_rol text;
BEGIN
    SELECT COALESCE(LOWER(r.nombre_rol), '') INTO v_rol
    FROM public.usuarios u
    LEFT JOIN public.roles r ON r.id_rol = u.id_rol
    WHERE u.id_usuario = auth.uid();

    IF v_rol NOT IN ('administrador', 'coordinador', 'analista') THEN
        RAISE EXCEPTION 'Solo el personal interno puede consultar el historial de un viaje';
    END IF;

    RETURN QUERY
    SELECT
        f.id_factura,
        f.num_factura::varchar(50) AS numero_factura,
        c.nombre_comercial AS nombre_cliente,
        i.orden_visita,
        e.nombre_estado::varchar(50) AS estado,
        h.observacion,
        h.fecha_cambio
    FROM public.historial_estados_factura h
    JOIN public.facturas f ON f.id_factura = h.id_factura
    JOIN public.itinerario_viaje i ON i.id_factura = f.id_factura
    JOIN public.estados e ON e.id_estado = h.id_estado_nuevo
    LEFT JOIN public.sucursales_cliente s ON s.id = f.id_sucursal
    LEFT JOIN public.clientes c ON c.id_cliente = s.cliente_id
    WHERE i.id_viaje = p_id_viaje
    ORDER BY h.fecha_cambio ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.obtener_historial_viaje(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.obtener_historial_viaje(uuid) TO authenticated;