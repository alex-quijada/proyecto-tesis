-- ==========================================
-- Replicar prefijo_doc en clientes
-- Paralelo al diseño de usuarios
-- ==========================================
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS prefijo_doc CHAR(1) NOT NULL DEFAULT 'J'
    CHECK (prefijo_doc IN ('V', 'E', 'J', 'P', 'G')),
  ADD COLUMN IF NOT EXISTS numero_doc varchar(20) NOT NULL DEFAULT '';
