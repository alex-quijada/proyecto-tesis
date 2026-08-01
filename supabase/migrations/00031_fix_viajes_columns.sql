ALTER TABLE viajes ADD COLUMN IF NOT EXISTS municipio TEXT;
ALTER TABLE viajes ADD COLUMN IF NOT EXISTS distancia_total_km NUMERIC(10,2);
ALTER TABLE viajes ADD COLUMN IF NOT EXISTS duracion_total_min NUMERIC(10,2);
ALTER TABLE viajes ADD COLUMN IF NOT EXISTS estado TEXT NOT NULL DEFAULT 'activo';

DROP FUNCTION IF EXISTS crear_viaje;

CREATE OR REPLACE FUNCTION crear_viaje(
    p_id_chofer UUID,
    p_id_vehiculo UUID,
    p_municipio TEXT,
    p_fecha_viaje DATE DEFAULT CURRENT_DATE,
    p_ids_facturas UUID[] DEFAULT '{}',
    p_distancia_total_km NUMERIC DEFAULT NULL,
    p_duracion_total_min NUMERIC DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id_viaje UUID;
    v_id_estado_embarque UUID;
    v_id_estado_nuevo UUID;
    v_orden INTEGER;
    v_factura_id UUID;
    v_total_facturas INTEGER;
BEGIN
    SELECT id_estado INTO v_id_estado_embarque FROM estados WHERE nombre_estado = 'embarque';
    SELECT id_estado INTO v_id_estado_nuevo FROM estados WHERE nombre_estado = 'nuevo';

    IF v_id_estado_embarque IS NULL THEN
        RAISE EXCEPTION 'Estado "embarque" no encontrado en la tabla estados';
    END IF;

    INSERT INTO viajes (id_chofer, id_vehiculo, municipio, fecha_viaje, distancia_total_km, duracion_total_min)
    VALUES (p_id_chofer, p_id_vehiculo, p_municipio, p_fecha_viaje, p_distancia_total_km, p_duracion_total_min)
    RETURNING id_viaje INTO v_id_viaje;

    v_total_facturas := 0;
    v_orden := 0;

    FOREACH v_factura_id IN ARRAY p_ids_facturas
    LOOP
        v_orden := v_orden + 1;

        INSERT INTO itinerario_viaje (id_viaje, id_factura, orden_visita)
        VALUES (v_id_viaje, v_factura_id, v_orden);

        UPDATE facturas
        SET id_estado = v_id_estado_embarque
        WHERE id_factura = v_factura_id AND id_estado = v_id_estado_nuevo;

        IF FOUND THEN
            v_total_facturas := v_total_facturas + 1;
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'id_viaje', v_id_viaje,
        'total_facturas', v_total_facturas,
        'id_chofer', p_id_chofer,
        'municipio', p_municipio
    );
END;
$$;
