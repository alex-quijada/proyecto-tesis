-- ==========================================
-- Corregir policy de Storage: nombre_rol está en user_metadata
-- ==========================================
DROP POLICY IF EXISTS "Autenticados pueden subir imagenes vehiculos" ON storage.objects;

CREATE POLICY "Autenticados pueden subir imagenes vehiculos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
    bucket_id = 'vehiculos-imagenes'
    AND (auth.jwt() -> 'user_metadata' ->> 'nombre_rol') IN ('Administrador', 'Analista')
);
