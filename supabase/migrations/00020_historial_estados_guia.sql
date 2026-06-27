-- Track estado changes on guias_carga with validation

-- ============================================================
-- 1) Add estado_guia varchar column to guias_carga
--    (keeps legacy estado FK column intact)
-- ============================================================
ALTER TABLE public.guias_carga
  ADD COLUMN IF NOT EXISTS estado_guia varchar(50) NOT NULL DEFAULT 'NUEVO'
  CONSTRAINT chk_estado_guia CHECK (
    estado_guia IN (
      'NUEVO',
      'EN_CARGA_MERCANCIA',
      'EN_PROCESO',
      'EN_ESPERA',
      'FINALIZADO',
      'INCIDENCIAS',
      'CANCELADO'
    )
  );

-- ============================================================
-- 2) Create historial table
-- ============================================================
CREATE TABLE public.historial_estados_guia (
    id_historial   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    id_guia        uuid NOT NULL REFERENCES public.guias_carga(id_guia) ON DELETE CASCADE,
    estado_anterior varchar(50),
    estado_nuevo   varchar(50) NOT NULL,
    id_usuario     uuid REFERENCES public.usuarios(id_usuario) ON DELETE SET NULL,
    observacion    text,
    fecha_cambio   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_historial_guia_fecha
  ON public.historial_estados_guia(id_guia, fecha_cambio DESC);

-- ============================================================
-- 3) Private validation function (immutable, no side effects)
-- ============================================================
CREATE OR REPLACE FUNCTION public.es_transicion_valida(
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
        RETURN p_nuevo = 'NUEVO';
    END IF;

    RETURN CASE p_anterior
        WHEN 'NUEVO'               THEN p_nuevo IN ('EN_CARGA_MERCANCIA', 'CANCELADO')
        WHEN 'EN_CARGA_MERCANCIA'  THEN p_nuevo IN ('EN_PROCESO', 'INCIDENCIAS', 'CANCELADO')
        WHEN 'EN_PROCESO'          THEN p_nuevo IN ('EN_ESPERA', 'FINALIZADO', 'INCIDENCIAS')
        WHEN 'EN_ESPERA'           THEN p_nuevo IN ('EN_PROCESO', 'FINALIZADO', 'INCIDENCIAS')
        WHEN 'INCIDENCIAS'         THEN p_nuevo IN ('EN_PROCESO', 'CANCELADO')
        WHEN 'FINALIZADO'          THEN false
        WHEN 'CANCELADO'           THEN false
        ELSE false
    END;
END;
$$;

-- ============================================================
-- 4) RPC: cambiar estado (validate + historial + update atomically)
-- ============================================================
CREATE OR REPLACE FUNCTION public.cambiar_estado_guia(
    p_id_guia      uuid,
    p_estado_nuevo varchar(50),
    p_id_usuario   uuid,
    p_observacion  text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
    v_estado_anterior varchar(50);
    v_historial_id    uuid;
BEGIN
    -- Lock row to prevent race conditions
    SELECT g.estado_guia INTO v_estado_anterior
    FROM public.guias_carga g
    WHERE g.id_guia = p_id_guia
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Guía no encontrada'
            USING ERRCODE = 'P0002';
    END IF;

    -- Validate transition
    IF NOT public.es_transicion_valida(v_estado_anterior, p_estado_nuevo) THEN
        RAISE EXCEPTION 'Transición inválida: % → %', v_estado_anterior, p_estado_nuevo
            USING ERRCODE = 'P0003';
    END IF;

    -- Insert historial entry
    INSERT INTO public.historial_estados_guia
        (id_guia, estado_anterior, estado_nuevo, id_usuario, observacion)
    VALUES
        (p_id_guia, v_estado_anterior, p_estado_nuevo, p_id_usuario, p_observacion)
    RETURNING id_historial INTO v_historial_id;

    -- Update current state on guia
    UPDATE public.guias_carga
    SET estado_guia = p_estado_nuevo
    WHERE id_guia = p_id_guia;

    RETURN jsonb_build_object(
        'ok', true,
        'id_historial', v_historial_id,
        'estado_anterior', v_estado_anterior,
        'estado_nuevo', p_estado_nuevo
    );
END;
$$;

-- ============================================================
-- 5) RPC: obtener historial completo de una guía
-- ============================================================
CREATE OR REPLACE FUNCTION public.obtener_historial_estados_guia(
    p_id_guia uuid
)
RETURNS TABLE(
    id_historial    uuid,
    estado_anterior varchar(50),
    estado_nuevo    varchar(50),
    nombre_usuario  varchar(150),
    observacion     text,
    fecha_cambio    timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
    RETURN QUERY
    SELECT h.id_historial,
           h.estado_anterior,
           h.estado_nuevo,
           u.nombre_completo AS nombre_usuario,
           h.observacion,
           h.fecha_cambio
    FROM public.historial_estados_guia h
    LEFT JOIN public.usuarios u ON h.id_usuario = u.id_usuario
    WHERE h.id_guia = p_id_guia
    ORDER BY h.fecha_cambio DESC;
END;
$$;


