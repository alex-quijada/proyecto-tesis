-- Agrega columnas de fecha de expedición a certificados_medicos y licencias_conducir

ALTER TABLE certificados_medicos ADD COLUMN certificado_expedicion DATE;
ALTER TABLE licencias_conducir ADD COLUMN licencia_expedicion DATE;

-- Actualizar RPCs (ejecutado por separado con DROP primero)
