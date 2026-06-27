-- Drop unused legacy column id_documento from clientes
-- The application uses prefijo_doc + numero_doc instead, added in 00009

ALTER TABLE public.clientes DROP COLUMN IF EXISTS id_documento;
