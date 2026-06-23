-- ==========================================
-- Cambiar telefono de BIGINT a VARCHAR
-- para aceptar strings como "0414-1234567"
-- ==========================================
ALTER TABLE public.clientes
    ALTER COLUMN telefono TYPE character varying(20) USING telefono::varchar;
