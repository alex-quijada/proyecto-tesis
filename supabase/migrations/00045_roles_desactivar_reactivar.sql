-- ==========================================
-- 00045: Autorización por rol en desactivar/reactivar usuarios
--
-- Antes: cualquier rol `authenticated` podía invocar los RPCs
-- `desactivar_usuario`/`reactivar_usuario` (SECURITY DEFINER, EXECUTE a PUBLIC).
-- Ahora se valida el rol del llamante (auth.uid()) y solo el personal interno
-- (Administrador, Analista, Coordinador) puede ejecutarlos. La funcionalidad se
-- mantiene: `activo = false` + `banned_until = 'infinity'` (impide el login).
-- ==========================================

CREATE OR REPLACE FUNCTION public.desactivar_usuario(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_rol text;
BEGIN
    SELECT r.nombre_rol::text INTO v_rol
    FROM public.usuarios u
    JOIN public.roles r ON r.id_rol = u.id_rol
    WHERE u.id_usuario = auth.uid();

    IF v_rol IS NULL OR LOWER(v_rol) NOT IN ('administrador', 'analista', 'coordinador') THEN
        RAISE EXCEPTION 'Acceso denegado: solo el personal interno puede desactivar usuarios.'
        USING ERRCODE = '42501';
    END IF;

    UPDATE public.usuarios SET activo = false WHERE id_usuario = p_id;
    UPDATE auth.users SET banned_until = 'infinity' WHERE id = p_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reactivar_usuario(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_rol text;
BEGIN
    SELECT r.nombre_rol::text INTO v_rol
    FROM public.usuarios u
    JOIN public.roles r ON r.id_rol = u.id_rol
    WHERE u.id_usuario = auth.uid();

    IF v_rol IS NULL OR LOWER(v_rol) NOT IN ('administrador', 'analista', 'coordinador') THEN
        RAISE EXCEPTION 'Acceso denegado: solo el personal interno puede reactivar usuarios.'
        USING ERRCODE = '42501';
    END IF;

    UPDATE public.usuarios SET activo = true WHERE id_usuario = p_id;
    UPDATE auth.users SET banned_until = NULL WHERE id = p_id;
END;
$$;
