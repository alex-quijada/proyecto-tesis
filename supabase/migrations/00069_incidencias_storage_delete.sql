-- ============================================================
-- 00069: permitir al personal interno borrar fotos de incidencia
-- del bucket 'incidencias-fotos' (al reiniciar un viaje).
-- Sin esta policy, storage.remove() falla con permission denied.
-- ============================================================
CREATE POLICY "incidencias_staff_delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
    bucket_id = 'incidencias-fotos'
    AND EXISTS (
        SELECT 1
        FROM public.usuarios u
        JOIN public.roles r ON r.id_rol = u.id_rol
        WHERE u.id_usuario = auth.uid()
          AND LOWER(r.nombre_rol) IN ('administrador', 'coordinador', 'analista')
    )
);
