-- ==========================================
-- 00039: Vencimientos calculados en la BD
--
-- El certificado médico vial vence a los 5 años de su expedición y la
-- licencia de conducir a los 10 años. La fecha de vencimiento ya no se
-- solicita en el formulario; la base de datos la calcula a partir de la
-- fecha de expedición mediante triggers.
-- ==========================================

-- --- certificados_medicos: vencimiento = expedicion + 5 años ---
CREATE OR REPLACE FUNCTION public.calcular_vencimiento_certificado()
RETURNS trigger AS $$
BEGIN
    IF NEW.certificado_expedicion IS NOT NULL THEN
        NEW.certificado_vencimiento := (NEW.certificado_expedicion + interval '5 years')::date;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_calcular_vencimiento_certificado ON public.certificados_medicos;
CREATE TRIGGER trg_calcular_vencimiento_certificado
    BEFORE INSERT OR UPDATE ON public.certificados_medicos
    FOR EACH ROW EXECUTE FUNCTION public.calcular_vencimiento_certificado();

-- --- licencias_conducir: vencimiento = expedicion + 10 años ---
CREATE OR REPLACE FUNCTION public.calcular_vencimiento_licencia()
RETURNS trigger AS $$
BEGIN
    IF NEW.licencia_expedicion IS NOT NULL THEN
        NEW.licencia_vencimiento := (NEW.licencia_expedicion + interval '10 years')::date;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_calcular_vencimiento_licencia ON public.licencias_conducir;
CREATE TRIGGER trg_calcular_vencimiento_licencia
    BEFORE INSERT OR UPDATE ON public.licencias_conducir
    FOR EACH ROW EXECUTE FUNCTION public.calcular_vencimiento_licencia();

-- --- Backfill de registros existentes con fecha de expedición ---
UPDATE public.certificados_medicos
SET certificado_vencimiento = (certificado_expedicion + interval '5 years')::date
WHERE certificado_expedicion IS NOT NULL;

UPDATE public.licencias_conducir
SET licencia_vencimiento = (licencia_expedicion + interval '10 years')::date
WHERE licencia_expedicion IS NOT NULL;
