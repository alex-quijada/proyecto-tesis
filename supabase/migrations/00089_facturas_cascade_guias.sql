-- ============================================================
-- 00089: Eliminación en cascada de facturas al borrar una guía.
-- ============================================================

ALTER TABLE public.facturas
    DROP CONSTRAINT IF EXISTS factura_id_guia_fkey;

ALTER TABLE public.facturas
    ADD CONSTRAINT factura_id_guia_fkey
    FOREIGN KEY (id_guia) REFERENCES public.guias_carga(id_guia)
    ON DELETE CASCADE;