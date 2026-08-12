-- ==========================================
-- 00054: Monitoreo en tiempo real del chofer (admin).
--
-- 1) Tabla posiciones_chofer: la ÚLTIMA posición reportada por cada
--    chofer (UPSERT). El chofer la escribe mientras navega (throttle
--    ~30s en el front) y el admin la consume vía Realtime.
-- 2) RLS: el chofer solo lee/escribe su propia fila; el staff
--    (Administrador/Coordinador/Analista) lee todas (necesaria para
--    que el Realtime del admin reciba los cambios).
-- 3) Realtime: publica posiciones_chofer (patrón de 00053).
-- 4) RPC actualizar_posicion_chofer: UPSERT de la propia fila.
-- 5) RPC obtener_posiciones_choferes: staff — posición + chofer + placa.
-- 6) obtener_viajes / obtener_viaje_chofer ahora incluyen el municipio
--    de cada parada (JOIN municipios) para mostrar la "Ruta X" en el
--    panel de monitoreo.
-- ==========================================

-- ==========================================
-- 1) Tabla posiciones_chofer
-- ==========================================
CREATE TABLE IF NOT EXISTS public.posiciones_chofer (
    id_chofer UUID PRIMARY KEY REFERENCES public.usuarios(id_usuario) ON DELETE CASCADE,
    latitud double precision NOT NULL,
    longitud double precision NOT NULL,
    velocidad_kmh double precision,
    precision_m double precision,
    rumbo double precision,
    id_viaje_activo UUID REFERENCES public.viajes(id_viaje) ON DELETE SET NULL,
    actualizado_en timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.posiciones_chofer ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- 2) RLS
-- ==========================================
CREATE POLICY "posiciones_chofer_staff_select"
    ON public.posiciones_chofer
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.usuarios u
            JOIN public.roles r ON r.id_rol = u.id_rol
            WHERE u.id_usuario = auth.uid()
              AND LOWER(r.nombre_rol) IN ('administrador', 'coordinador', 'analista')
        )
    );

CREATE POLICY "posiciones_chofer_own_select"
    ON public.posiciones_chofer
    FOR SELECT
    TO authenticated
    USING (id_chofer = auth.uid());

CREATE POLICY "posiciones_chofer_own_insert"
    ON public.posiciones_chofer
    FOR INSERT
    TO authenticated
    WITH CHECK (id_chofer = auth.uid());

CREATE POLICY "posiciones_chofer_own_update"
    ON public.posiciones_chofer
    FOR UPDATE
    TO authenticated
    USING (id_chofer = auth.uid())
    WITH CHECK (id_chofer = auth.uid());

-- ==========================================
-- 3) Realtime
-- ==========================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.posiciones_chofer;

-- ==========================================
-- 4) actualizar_posicion_chofer — upsert de la fila propia
-- ==========================================
CREATE OR REPLACE FUNCTION public.actualizar_posicion_chofer(
    p_latitud double precision,
    p_longitud double precision,
    p_velocidad_kmh double precision DEFAULT NULL,
    p_precision_m double precision DEFAULT NULL,
    p_rumbo double precision DEFAULT NULL,
    p_id_viaje_activo UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_fila public.posiciones_chofer%ROWTYPE;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Sesión no válida'
            USING ERRCODE = 'P0002';
    END IF;

    INSERT INTO public.posiciones_chofer (
        id_chofer, latitud, longitud, velocidad_kmh, precision_m, rumbo,
        id_viaje_activo, actualizado_en
    )
    VALUES (
        v_uid, p_latitud, p_longitud, p_velocidad_kmh, p_precision_m, p_rumbo,
        p_id_viaje_activo, now()
    )
    ON CONFLICT (id_chofer)
    DO UPDATE SET
        latitud = EXCLUDED.latitud,
        longitud = EXCLUDED.longitud,
        velocidad_kmh = EXCLUDED.velocidad_kmh,
        precision_m = EXCLUDED.precision_m,
        rumbo = EXCLUDED.rumbo,
        id_viaje_activo = EXCLUDED.id_viaje_activo,
        actualizado_en = now()
    RETURNING * INTO v_fila;

    RETURN jsonb_build_object(
        'id_chofer', v_fila.id_chofer,
        'latitud', v_fila.latitud,
        'longitud', v_fila.longitud,
        'actualizado_en', v_fila.actualizado_en
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.actualizar_posicion_chofer(double precision, double precision, double precision, double precision, double precision, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.actualizar_posicion_chofer(double precision, double precision, double precision, double precision, double precision, uuid) TO authenticated;

-- ==========================================
-- 5) obtener_posiciones_choferes — staff: posición + chofer + placa
-- ==========================================
CREATE OR REPLACE FUNCTION public.obtener_posiciones_choferes()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_rol text;
    v_resultado jsonb;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Sesión no válida'
            USING ERRCODE = 'P0002';
    END IF;

    SELECT COALESCE(LOWER(r.nombre_rol), '') INTO v_rol
    FROM public.usuarios u
    LEFT JOIN public.roles r ON r.id_rol = u.id_rol
    WHERE u.id_usuario = v_uid;

    IF v_rol NOT IN ('administrador', 'coordinador', 'analista') THEN
        RAISE EXCEPTION 'No tienes permiso para consultar posiciones'
            USING ERRCODE = 'P0001';
    END IF;

    SELECT COALESCE(jsonb_agg(p), '[]'::jsonb)
    INTO v_resultado
    FROM (
        SELECT
            pc.id_chofer,
            pc.latitud,
            pc.longitud,
            pc.velocidad_kmh,
            pc.precision_m,
            pc.rumbo,
            pc.id_viaje_activo,
            pc.actualizado_en,
            u.nombre_completo AS nombre_chofer,
            veh.placa AS placa_vehiculo
        FROM public.posiciones_chofer pc
        LEFT JOIN public.usuarios u ON u.id_usuario = pc.id_chofer
        LEFT JOIN public.viajes v ON v.id_viaje = pc.id_viaje_activo
        LEFT JOIN public.vehiculos veh ON veh.id_vehiculo = v.id_vehiculo
        ORDER BY pc.actualizado_en DESC
    ) p;

    RETURN v_resultado;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.obtener_posiciones_choferes() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.obtener_posiciones_choferes() TO authenticated;

-- ==========================================
-- 6) obtener_viajes / obtener_viaje_chofer: incluir municipio por parada
-- ==========================================

CREATE OR REPLACE FUNCTION public.obtener_viaje_chofer()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_result JSONB;
BEGIN
    SELECT COALESCE(jsonb_agg(v), '[]'::jsonb)
    INTO v_result
    FROM (
        SELECT
            v.id_viaje,
            v.id_chofer,
            v.id_vehiculo,
            veh.placa AS placa_vehiculo,
            v.fecha_viaje,
            v.estado,
            v.distancia_total_km,
            v.duracion_total_min,
            v.fecha_creacion,
            v.ruta_detallada,
            COALESCE((
                SELECT jsonb_agg(jsonb_build_object(
                    'orden_visita', i.orden_visita,
                    'id_factura', i.id_factura,
                    'numero_factura', f.num_factura,
                    'id_guia', f.id_guia,
                    'codigo_guia', g.codigo_guia,
                    'nombre_cliente', c.nombre_comercial,
                    'direccion', s.direccion,
                    'municipio', m.nombre,
                    'latitud', s.latitud,
                    'longitud', s.longitud,
                    'monto_dolares', f.monto_dolares,
                    'estado_factura', e.nombre_estado
                ) ORDER BY i.orden_visita)
                FROM itinerario_viaje i
                JOIN facturas f ON f.id_factura = i.id_factura
                LEFT JOIN guias_carga g ON g.id_guia = f.id_guia
                LEFT JOIN sucursales_cliente s ON s.id = f.id_sucursal
                LEFT JOIN municipios m ON m.id_municipio = s.id_municipio
                LEFT JOIN clientes c ON c.id_cliente = s.cliente_id
                LEFT JOIN estados e ON e.id_estado = f.id_estado
                WHERE i.id_viaje = v.id_viaje
            ), '[]'::jsonb) AS paradas
        FROM viajes v
        LEFT JOIN vehiculos veh ON veh.id_vehiculo = v.id_vehiculo
        WHERE v.id_chofer = auth.uid()
          AND v.estado IN ('programado', 'proceso')
        ORDER BY v.fecha_creacion DESC
    ) v;

    RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.obtener_viajes()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_result JSONB;
    v_embarque UUID;
    v_proceso UUID;
BEGIN
    SELECT id_estado INTO v_embarque FROM estados WHERE LOWER(nombre_estado) = 'embarque';
    SELECT id_estado INTO v_proceso FROM estados WHERE LOWER(nombre_estado) = 'proceso';

    SELECT COALESCE(jsonb_agg(t), '[]'::jsonb)
    INTO v_result
    FROM (
        SELECT
            v.id_viaje,
            v.id_chofer,
            ch.nombre_completo AS chofer,
            v.id_vehiculo,
            veh.placa AS placa_vehiculo,
            v.fecha_viaje,
            v.estado,
            v.fecha_creacion,
            v.ruta_detallada,
            (SELECT count(*) FROM itinerario_viaje i WHERE i.id_viaje = v.id_viaje) AS total_facturas,
            COALESCE((
                SELECT count(*) FROM itinerario_viaje i
                JOIN facturas f ON f.id_factura = i.id_factura
                WHERE i.id_viaje = v.id_viaje AND f.id_estado = v_embarque
            ), 0) AS facturas_embarque,
            COALESCE((
                SELECT count(*) FROM itinerario_viaje i
                JOIN facturas f ON f.id_factura = i.id_factura
                WHERE i.id_viaje = v.id_viaje AND f.id_estado = v_proceso
            ), 0) AS facturas_proceso,
            COALESCE((
                SELECT jsonb_agg(jsonb_build_object(
                    'orden_visita', i.orden_visita,
                    'id_factura', i.id_factura,
                    'numero_factura', f.num_factura,
                    'id_guia', f.id_guia,
                    'codigo_guia', g.codigo_guia,
                    'nombre_cliente', c.nombre_comercial,
                    'direccion', s.direccion,
                    'municipio', m.nombre,
                    'latitud', s.latitud,
                    'longitud', s.longitud,
                    'estado_factura', e.nombre_estado
                ) ORDER BY i.orden_visita)
                FROM itinerario_viaje i
                JOIN facturas f ON f.id_factura = i.id_factura
                LEFT JOIN guias_carga g ON g.id_guia = f.id_guia
                LEFT JOIN sucursales_cliente s ON s.id = f.id_sucursal
                LEFT JOIN municipios m ON m.id_municipio = s.id_municipio
                LEFT JOIN clientes c ON c.id_cliente = s.cliente_id
                LEFT JOIN estados e ON e.id_estado = f.id_estado
                WHERE i.id_viaje = v.id_viaje
            ), '[]'::jsonb) AS paradas
        FROM viajes v
        LEFT JOIN usuarios ch ON ch.id_usuario = v.id_chofer
        LEFT JOIN vehiculos veh ON veh.id_vehiculo = v.id_vehiculo
        ORDER BY v.fecha_creacion DESC
    ) t;

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.obtener_viaje_chofer() TO authenticated;
GRANT EXECUTE ON FUNCTION public.obtener_viajes() TO authenticated;
