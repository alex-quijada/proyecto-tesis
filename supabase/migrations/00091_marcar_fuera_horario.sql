-- ============================================================
-- 00091: "Volver al almacén" en dos pasos.
--
-- marcar_fuera_horario: marca las facturas pendientes como
-- incidencia FUERA_HORARIO (recuperable=true) pero NO cierra el
-- viaje. El viaje se finaliza recién cuando el chofer llega al
-- almacén (finalizar_viaje). Se elimina finalizar_viaje_fuera_horario
-- (cierre inmediato, ya no se usa).
-- ============================================================

DROP FUNCTION IF EXISTS public.finalizar_viaje_fuera_horario(uuid);

CREATE OR REPLACE FUNCTION public.marcar_fuera_horario(p_id_viaje uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_id_chofer uuid;
    v_rol text;
    v_estado text;
    v_id_estado_incidencia uuid;
    v_total integer := 0;
    v_factura uuid;
    v_anterior uuid;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Sesión no válida' USING ERRCODE = 'P0002';
    END IF;

    SELECT id_chofer INTO v_id_chofer FROM public.viajes WHERE id_viaje = p_id_viaje;
    IF v_id_chofer IS NULL THEN
        RAISE EXCEPTION 'Viaje no encontrado';
    END IF;

    SELECT COALESCE(LOWER(r.nombre_rol), '') INTO v_rol
    FROM public.usuarios u
    LEFT JOIN public.roles r ON r.id_rol = u.id_rol
    WHERE u.id_usuario = v_uid;

    IF v_uid <> v_id_chofer AND v_rol NOT IN ('administrador', 'coordinador', 'analista') THEN
        RAISE EXCEPTION 'No tienes permiso para marcar este viaje';
    END IF;

    SELECT estado INTO v_estado FROM public.viajes WHERE id_viaje = p_id_viaje;
    IF v_estado <> 'proceso' THEN
        RAISE EXCEPTION 'El viaje no está en proceso';
    END IF;

    SELECT id_estado INTO v_id_estado_incidencia
    FROM public.estados WHERE LOWER(nombre_estado) = 'incidencia';
    IF v_id_estado_incidencia IS NULL THEN
        RAISE EXCEPTION 'Estado incidencia no encontrado';
    END IF;

    -- Marcar como FUERA_HORARIO (recuperable) cada factura pendiente del viaje.
    FOR v_factura IN
        SELECT i.id_factura
        FROM public.itinerario_viaje i
        JOIN public.facturas f ON f.id_factura = i.id_factura
        JOIN public.estados e ON e.id_estado = f.id_estado
        WHERE i.id_viaje = p_id_viaje
          AND e.nombre_estado NOT IN ('finalizado', 'incidencia')
    LOOP
        SELECT id_estado INTO v_anterior FROM public.facturas WHERE id_factura = v_factura;

        INSERT INTO public.incidencias
            (id_detalle_fact, tipo_incidencia, descripcion, foto_evidencia_url, recuperable, resuelta)
        VALUES
            (v_factura, 'FUERA_HORARIO',
             'No entregado — hora de volver al almacén', NULL, true, false);

        INSERT INTO public.historial_estados_factura
            (id_factura, id_estado_anterior, id_estado_nuevo, id_usuario, observacion)
        VALUES
            (v_factura, v_anterior, v_id_estado_incidencia, v_uid,
             '[FUERA_HORARIO] No entregado al volver al almacén');

        UPDATE public.facturas
        SET id_estado = v_id_estado_incidencia
        WHERE id_factura = v_factura;

        v_total := v_total + 1;
    END LOOP;

    RETURN jsonb_build_object(
        'id_viaje', p_id_viaje,
        'total_marcadas', v_total
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.marcar_fuera_horario(uuid) TO authenticated;