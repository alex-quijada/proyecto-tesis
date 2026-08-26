-- ============================================================
-- 00088: set_incidencia_recuperable — disparo de Realtime inmediato
--
-- Al marcar/desmarcar una incidencia como recuperable, además de
-- actualizar incidencias, se toca la tabla `viajes` para que
-- el WebSocket del chofer reciba el cambio en tiempo real (<100ms)
-- sin esperar a que llegue a la siguiente parada.
-- Se asegura REPLICA IDENTITY FULL en incidencias.
-- ============================================================

ALTER TABLE public.incidencias REPLICA IDENTITY FULL;

CREATE OR REPLACE FUNCTION public.set_incidencia_recuperable(p_id_incidencia uuid, p_recuperable boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_rol text;
    v_id_viaje uuid;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Sesión no válida' USING ERRCODE = 'P0002';
    END IF;

    SELECT COALESCE(LOWER(r.nombre_rol), '') INTO v_rol
    FROM public.usuarios u
    LEFT JOIN public.roles r ON r.id_rol = u.id_rol
    WHERE u.id_usuario = v_uid;

    IF v_rol NOT IN ('administrador', 'coordinador', 'analista') THEN
        RAISE EXCEPTION 'Solo el personal interno puede marcar una incidencia como recuperable' USING ERRCODE = 'P0001';
    END IF;

    UPDATE public.incidencias
    SET recuperable = p_recuperable
    WHERE id_incidencia = p_id_incidencia;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Incidencia no encontrada' USING ERRCODE = 'P0002';
    END IF;

    -- Obtener el id_viaje asociado a la factura de la incidencia
    SELECT i.id_viaje INTO v_id_viaje
    FROM public.incidencias inc
    JOIN public.itinerario_viaje i ON i.id_factura = inc.id_detalle_fact
    WHERE inc.id_incidencia = p_id_incidencia
    LIMIT 1;

    -- Tocar la tabla viajes para disparar el evento Realtime directo al chofer
    IF v_id_viaje IS NOT NULL THEN
        UPDATE public.viajes
        SET created_at = created_at
        WHERE id_viaje = v_id_viaje;
    END IF;

    RETURN jsonb_build_object('ok', true, 'id_incidencia', p_id_incidencia, 'recuperable', p_recuperable);
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_incidencia_recuperable(uuid, boolean) TO authenticated;
