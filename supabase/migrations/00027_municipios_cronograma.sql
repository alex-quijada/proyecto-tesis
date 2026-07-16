CREATE TABLE public.municipios_cronograma (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    id_municipio uuid NOT NULL REFERENCES public.municipios(id_municipio) ON DELETE CASCADE,
    dia_semana   integer NOT NULL CHECK (dia_semana BETWEEN 1 AND 7),
    orden        integer NOT NULL DEFAULT 0,
    UNIQUE (id_municipio, dia_semana)
);

ALTER TABLE public.municipios_cronograma ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cronograma_select"
    ON public.municipios_cronograma
    FOR SELECT TO authenticated
    USING (true);

CREATE POLICY "cronograma_insert"
    ON public.municipios_cronograma
    FOR INSERT TO authenticated
    WITH CHECK (true);

CREATE POLICY "cronograma_update"
    ON public.municipios_cronograma
    FOR UPDATE TO authenticated
    USING (true)
    WITH CHECK (true);

CREATE POLICY "cronograma_delete"
    ON public.municipios_cronograma
    FOR DELETE TO authenticated
    USING (true);
