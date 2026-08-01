-- Fix id_documento identity constraint: sequence outgrew the check limit

ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS id_documento bigint;
ALTER TABLE public.clientes DROP CONSTRAINT IF EXISTS clientes_id_documento_check;
