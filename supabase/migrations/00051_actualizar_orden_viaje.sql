-- ==========================================
-- 00051: actualizar_orden_viaje — persiste el orden de las paradas
-- sin cerrar el viaje ni cambiar el estado de las facturas.
--
-- Motivo: en /driver/ruta el chofer puede optimizar/reordenar la ruta
-- con Google y ajustar manualmente el orden. Antes ese orden solo vivía
-- en memoria (se perdía al salir de la ventana); la única forma de
-- persistirlo era iniciar_viaje, que además cierra el viaje a 'proceso'.
-- Este RPC solo actualiza itinerario_viaje.orden_visita.
-- ==========================================

CREATE OR REPLACE FUNCTION public.actualizar_orden_viaje(
    p_id_viaje UUID,
    p_ids_facturas_ordenadas UUID[] DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id_chofer UUID;
    v_rol TEXT;
    v_orden INTEGER;
    v_factura_id UUID;
    v_total INTEGER := 0;
BEGIN
    SELECT id_chofer INTO v_id_chofer FROM viajes WHERE id_viaje = p_id_viaje;
    IF v_id_chofer IS NULL THEN
        RAISE EXCEPTION 'Viaje no encontrado';
    END IF;

    SELECT COALESCE(r.nombre_rol, '') INTO v_rol
    FROM usuarios u
    LEFT JOIN roles r ON r.id_rol = u.id_rol
    WHERE u.id_usuario = auth.uid();

    IF auth.uid() <> v_id_chofer AND LOWER(v_rol) NOT IN ('administrador', 'coordinador', 'analista') THEN
        RAISE EXCEPTION 'No tienes permiso para modificar este viaje';
    END IF;

    IF p_ids_facturas_ordenadas IS NOT NULL AND array_length(p_ids_facturas_ordenadas, 1) > 0 THEN
        v_orden := 0;
        FOREACH v_factura_id IN ARRAY p_ids_facturas_ordenadas
        LOOP
            v_orden := v_orden + 1;
            UPDATE itinerario_viaje SET orden_visita = v_orden
            WHERE id_viaje = p_id_viaje AND id_factura = v_factura_id;
            IF FOUND THEN
                v_total := v_total + 1;
            END IF;
        END LOOP;
    END IF;

    RETURN jsonb_build_object(
        'id_viaje', p_id_viaje,
        'total_actualizadas', v_total
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.actualizar_orden_viaje(UUID, UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.actualizar_orden_viaje(UUID, UUID[]) TO authenticated;
