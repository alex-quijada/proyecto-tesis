-- Agrega políticas SELECT a certificados_medicos y licencias_conducir
-- para que las consultas embed (JOIN) desde usuarios funcionen.

CREATE POLICY "Admins and Coordinators can view certificados" ON certificados_medicos
    FOR SELECT
    USING (get_user_role_name() = ANY (ARRAY['administrador'::text, 'coordinador'::text]));

CREATE POLICY "Admins and Coordinators can view licencias" ON licencias_conducir
    FOR SELECT
    USING (get_user_role_name() = ANY (ARRAY['administrador'::text, 'coordinador'::text]));
