-- Add estado tracking at factura level with historial

-- ============================================================
-- 1) Create / ensure estados catalog table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.estados (
    id_estado      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre_estado  varchar(50) UNIQUE NOT NULL,
    descripcion    text
);

ALTER TABLE public.estados
  ADD COLUMN IF NOT EXISTS descripcion text;

-- ============================================================
-- 2) Seed estado values (idempotent)
-- ============================================================
INSERT INTO public.estados (nombre_estado, descripcion) VALUES
  ('nuevo',      'Factura recién creada, pendiente de procesar'),
  ('embarque',   'En carga de mercancía — medir tiempo de carga'),
  ('proceso',    'Salió del almacén, viaje hacia destino iniciado'),
  ('espera',     'Llegó a destino — medir tiempo hasta finalizar entrega'),
  ('incidencia', 'Algo salió mal durante el proceso'),
  ('finalizado', 'Entrega completada exitosamente')
ON CONFLICT (nombre_estado) DO NOTHING;

-- ============================================================
-- 3) Modify facturas: add id_estado FK, remove estado_entrega
-- ============================================================
ALTER TABLE public.facturas
  ADD COLUMN IF NOT EXISTS id_estado uuid
  REFERENCES public.estados(id_estado);

UPDATE public.facturas f
  SET id_estado = (SELECT e.id_estado FROM public.estados e WHERE e.nombre_estado = 'nuevo')
  WHERE f.id_estado IS NULL;

ALTER TABLE public.facturas
  ALTER COLUMN id_estado SET NOT NULL;

ALTER TABLE IF EXISTS public.facturas
  DROP CONSTRAINT IF EXISTS chk_estado_entrega;

ALTER TABLE IF EXISTS public.facturas
  DROP COLUMN IF EXISTS estado_entrega;

-- ============================================================
-- 4) Create historial table for factura estado changes
-- ============================================================
CREATE TABLE public.historial_estados_factura (
    id_historial      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    id_factura        uuid NOT NULL REFERENCES public.facturas(id_factura) ON DELETE CASCADE,
    id_estado_anterior uuid REFERENCES public.estados(id_estado),
    id_estado_nuevo   uuid NOT NULL REFERENCES public.estados(id_estado),
    id_usuario        uuid REFERENCES public.usuarios(id_usuario) ON DELETE SET NULL,
    observacion       text,
    fecha_cambio      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_historial_factura_fecha
  ON public.historial_estados_factura(id_factura, fecha_cambio DESC);

-- ============================================================
-- 5) Transition validation function
-- ============================================================
CREATE OR REPLACE FUNCTION public.es_transicion_valida_factura(
    p_anterior varchar,
    p_nuevo    varchar
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = 'public'
AS $$
BEGIN
    IF p_anterior IS NULL THEN
        RETURN p_nuevo = 'nuevo';
    END IF;

    RETURN CASE p_anterior
        WHEN 'nuevo'       THEN p_nuevo IN ('embarque', 'incidencia')
        WHEN 'embarque'    THEN p_nuevo IN ('proceso', 'incidencia')
        WHEN 'proceso'     THEN p_nuevo IN ('espera', 'incidencia')
        WHEN 'espera'      THEN p_nuevo IN ('finalizado', 'incidencia')
        WHEN 'incidencia'  THEN p_nuevo IN ('proceso', 'espera')
        WHEN 'finalizado'  THEN false
        ELSE false
    END;
END;
$$;

-- ============================================================
-- 6) RPC: cambiar estado factura (validate + historial + update)
-- ============================================================
CREATE OR REPLACE FUNCTION public.cambiar_estado_factura(
    p_id_factura      uuid,
    p_estado_nuevo    varchar(50),
    p_id_usuario      uuid,
    p_observacion     text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
    v_id_estado_anterior uuid;
    v_nombre_anterior    varchar(50);
    v_id_estado_nuevo    uuid;
    v_historial_id       uuid;
BEGIN
    -- Lock row to prevent race conditions
    SELECT f.id_estado, e.nombre_estado
      INTO v_id_estado_anterior, v_nombre_anterior
    FROM public.facturas f
    JOIN public.estados e ON f.id_estado = e.id_estado
    WHERE f.id_factura = p_id_factura
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Factura no encontrada'
            USING ERRCODE = 'P0002';
    END IF;

    -- Lookup new estado id
    SELECT e.id_estado INTO v_id_estado_nuevo
    FROM public.estados e
    WHERE e.nombre_estado = p_estado_nuevo;

    IF v_id_estado_nuevo IS NULL THEN
        RAISE EXCEPTION 'Estado "%" no encontrado', p_estado_nuevo
            USING ERRCODE = 'P0002';
    END IF;

    -- Validate transition
    IF NOT public.es_transicion_valida_factura(v_nombre_anterior, p_estado_nuevo) THEN
        RAISE EXCEPTION 'Transición inválida: % → %', v_nombre_anterior, p_estado_nuevo
            USING ERRCODE = 'P0003';
    END IF;

    -- Insert historial entry
    INSERT INTO public.historial_estados_factura
        (id_factura, id_estado_anterior, id_estado_nuevo, id_usuario, observacion)
    VALUES
        (p_id_factura, v_id_estado_anterior, v_id_estado_nuevo, p_id_usuario, p_observacion)
    RETURNING id_historial INTO v_historial_id;

    -- Update current state on factura
    UPDATE public.facturas
    SET id_estado = v_id_estado_nuevo
    WHERE id_factura = p_id_factura;

    RETURN jsonb_build_object(
        'ok', true,
        'id_historial', v_historial_id,
        'id_estado_anterior', v_id_estado_anterior,
        'id_estado_nuevo', v_id_estado_nuevo
    );
END;
$$;

-- ============================================================
-- 7) RPC: obtener historial completo de una factura
-- ============================================================
CREATE OR REPLACE FUNCTION public.obtener_historial_estados_factura(
    p_id_factura uuid
)
RETURNS TABLE(
    id_historial      uuid,
    estado_anterior   varchar(50),
    estado_nuevo      varchar(50),
    nombre_usuario    varchar(150),
    observacion       text,
    fecha_cambio      timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
    RETURN QUERY
    SELECT h.id_historial,
           ea.nombre_estado AS estado_anterior,
           en.nombre_estado AS estado_nuevo,
           u.nombre_completo AS nombre_usuario,
           h.observacion,
           h.fecha_cambio
    FROM public.historial_estados_factura h
    LEFT JOIN public.estados ea ON h.id_estado_anterior = ea.id_estado
    JOIN public.estados en ON h.id_estado_nuevo = en.id_estado
    LEFT JOIN public.usuarios u ON h.id_usuario = u.id_usuario
    WHERE h.id_factura = p_id_factura
    ORDER BY h.fecha_cambio DESC;
END;
$$;

-- ============================================================
-- 8) Enable RLS (matching existing facturas policy pattern)
-- ============================================================
ALTER TABLE public.historial_estados_factura ENABLE ROW LEVEL SECURITY;

CREATE POLICY "SELECT para autenticados en historial_estados_factura"
  ON public.historial_estados_factura
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "INSERT desde RPC para historial_estados_factura"
  ON public.historial_estados_factura
  FOR INSERT
  TO authenticated
  WITH CHECK (true);
