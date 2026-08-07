-- ==========================================
-- 00037: Asegurar columnas de viajes usadas por los RPCs
--
-- La tabla viajes del remoto fue creada sin fecha_creacion (y quizá sin
-- created_at), mientras que los RPCs (obtener_viajes, obtener_viaje_chofer)
-- la usan para ordenar. ADD COLUMN IF NOT EXISTS las garantiza en ambos
-- entornos de forma idempotente.
-- ==========================================
ALTER TABLE public.viajes
    ADD COLUMN IF NOT EXISTS fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT now(),
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE public.itinerario_viaje
    ADD COLUMN IF NOT EXISTS id_guia UUID,
    ADD COLUMN IF NOT EXISTS orden INTEGER;
