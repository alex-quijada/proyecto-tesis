-- ============================================================
-- 00076: fix recalcular_estado_factura — si quedan incidencias
-- pendientes la factura vuelve a 'incidencia'; si todas resueltas
-- pasa a 'finalizado'. Antes solo pasaba a 'finalizado' cuando
-- había 0 pendientes y dejaba la factura en 'entrega'/'proceso'
-- si quedaba una terminal (DANADO) pendiente.
-- ============================================================
CREATE OR REPLACE FUNCTION public.recalcular_estado_factura(p_id_factura uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_pendientes integer;
    v_id_finalizado uuid;
    v_id_incidencia uuid;
BEGIN
    SELECT id_estado INTO v_id_finalizado FROM public.estados WHERE LOWER(nombre_estado) = 'finalizado';
    SELECT id_estado INTO v_id_incidencia FROM public.estados WHERE LOWER(nombre_estado) = 'incidencia';
    IF v_id_finalizado IS NULL OR v_id_incidencia IS NULL THEN
        RETURN;
    END IF;

    SELECT count(*) INTO v_pendientes
    FROM public.incidencias
    WHERE id_detalle_fact = p_id_factura AND resuelta = false;

    IF v_pendientes = 0 THEN
        UPDATE public.facturas
        SET id_estado = v_id_finalizado
        WHERE id_factura = p_id_factura;
    ELSE
        UPDATE public.facturas
        SET id_estado = v_id_incidencia
        WHERE id_factura = p_id_factura;
    END IF;
END;
$$;