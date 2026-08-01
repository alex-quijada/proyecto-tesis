CREATE TABLE IF NOT EXISTS viajes (
    id_viaje UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_chofer UUID NOT NULL,
    id_vehiculo TEXT NOT NULL,
    municipio TEXT NOT NULL,
    distancia_total_km NUMERIC(10,2),
    duracion_total_min NUMERIC(10,2),
    estado TEXT NOT NULL DEFAULT 'activo',
    fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS itinerario_viaje (
    id_itinerario UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_viaje UUID NOT NULL REFERENCES viajes(id_viaje) ON DELETE CASCADE,
    id_guia UUID NOT NULL,
    orden INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE viajes ENABLE ROW LEVEL SECURITY;
ALTER TABLE itinerario_viaje ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/Coord/Analista todo viajes"
    ON viajes
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM usuarios u
            JOIN roles r ON u.id_rol = r.id_rol
            WHERE u.id_usuario = auth.uid()
            AND r.nombre_rol IN ('Administrador', 'Coordinador', 'Analista')
        )
    );

CREATE POLICY "Chofer lectura viajes"
    ON viajes
    FOR SELECT
    TO authenticated
    USING (id_chofer = auth.uid());

CREATE POLICY "Admin/Coord/Analista todo itinerario"
    ON itinerario_viaje
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM usuarios u
            JOIN roles r ON u.id_rol = r.id_rol
            WHERE u.id_usuario = auth.uid()
            AND r.nombre_rol IN ('Administrador', 'Coordinador', 'Analista')
        )
    );

CREATE POLICY "Chofer lectura itinerario"
    ON itinerario_viaje
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM viajes v
            WHERE v.id_viaje = itinerario_viaje.id_viaje
            AND v.id_chofer = auth.uid()
        )
    );

CREATE OR REPLACE FUNCTION crear_viaje(
    p_id_chofer UUID,
    p_id_vehiculo TEXT,
    p_municipio TEXT,
    p_ids_guias UUID[],
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
    v_guia_id UUID;
    v_total_guias INTEGER;
BEGIN
    SELECT id_estado INTO v_id_estado_embarque FROM estados WHERE nombre_estado = 'embarque';
    SELECT id_estado INTO v_id_estado_nuevo FROM estados WHERE nombre_estado = 'nuevo';

    IF v_id_estado_embarque IS NULL THEN
        RAISE EXCEPTION 'Estado "embarque" no encontrado en la tabla estados';
    END IF;

    INSERT INTO viajes (id_chofer, id_vehiculo, municipio, distancia_total_km, duracion_total_min)
    VALUES (p_id_chofer, p_id_vehiculo, p_municipio, p_distancia_total_km, p_duracion_total_min)
    RETURNING id_viaje INTO v_id_viaje;

    v_total_guias := 0;
    v_orden := 0;

    FOREACH v_guia_id IN ARRAY p_ids_guias
    LOOP
        v_orden := v_orden + 1;

        INSERT INTO itinerario_viaje (id_viaje, id_guia, orden)
        VALUES (v_id_viaje, v_guia_id, v_orden);

        UPDATE facturas
        SET id_estado = v_id_estado_embarque
        WHERE id_guia = v_guia_id AND id_estado = v_id_estado_nuevo;

        IF FOUND THEN
            v_total_guias := v_total_guias + 1;
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'id_viaje', v_id_viaje,
        'total_guias', v_total_guias,
        'id_chofer', p_id_chofer,
        'municipio', p_municipio
    );
END;
$$;
