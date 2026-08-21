-- ============================================================
-- 00077: fix finalizar_entrega — registrar el historial de estado
-- tras la evaluación continua (→ 'finalizado' o → 'incidencia').
-- Antes no se insertaba historial, lo que rompía el cálculo de
-- "estado al cierre" en obtener_viajes.
-- ============================================================
CREATE OR REPLACE FUNCTION public.finalizar_entrega(
    p_id_factura uuid,
    p_observacion text DEFAULT NULL::text,
    p_firma text DEFAULT NULL::text
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
    v_estado_final uuid;
    v_pendientes integer;
    v_pend_inc integer;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Sesión no válida' USING ERRCODE = 'P0002';
    END IF;

    SELECT f.id_guia, f.id_estado
    INTO v_id_guia, v_id_estado_anterior
    FROM public.facturas f
    JOIN public.guias_carga g ON g.id_guia = f.id_guia
    WHERE f.id_factura = p_id_factura
      AND g.id_chofer = v_uid
    FOR UPDATE OF f;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Factura no encontrada o no asignada al chofer' USING ERRCODE = 'P0002';
    END IF;

    SELECT nombre_estado INTO v_estado_anterior
    FROM public.estados WHERE id_estado = v_id_estado_anterior;

    IF v_estado_anterior = 'finalizado' THEN
        RETURN jsonb_build_object('ok', true, 'ya_finalizado', true, 'id_factura', p_id_factura);
    END IF;

    -- Guardar la firma (la entrega del chofer).
    UPDATE public.facturas
    SET firma = COALESCE(p_firma, firma)
    WHERE id_factura = p_id_factura;

    -- Marcar resueltas las incidencias recuperables pendientes (las que
    -- motivaron la re-entrega). Las terminales (DANADO) quedan pendientes.
    UPDATE public.incidencias
    SET resuelta = true
    WHERE id_detalle_fact = p_id_factura
      AND recuperable = true
      AND resuelta = false;

    -- Evaluación continua: todas resueltas → finalizado; alguna pendiente → incidencia.
    PERFORM public.recalcular_estado_factura(p_id_factura);

    SELECT id_estado INTO v_estado_final FROM public.facturas WHERE id_factura = p_id_factura;

    -- Registrar el historial de estado según el resultado (si cambió).
    IF v_estado_final <> v_id_estado_anterior THEN
        INSERT INTO public.historial_estados_factura
            (id_factura, id_estado_anterior, id_estado_nuevo, id_usuario, observacion)
        VALUES (p_id_factura, v_id_estado_anterior, v_estado_final, v_uid, p_observacion);
    END IF;

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

GRANT EXECUTE ON FUNCTION public.finalizar_entrega(uuid, text, text) TO authenticated;