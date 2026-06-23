-- ==========================================
-- Fix: agregar referencia a jsonb_to_recordset
-- en guardar_ubicaciones_cliente
-- ==========================================
CREATE OR REPLACE FUNCTION public.guardar_ubicaciones_cliente(
    p_id_cliente uuid,
    p_ubicaciones jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
    DELETE FROM public.ubicaciones WHERE id_cliente = p_id_cliente;

    INSERT INTO public.ubicaciones (
        id_cliente,
        direccion_completa,
        id_municipio,
        municipio,
        estado_provincia,
        pais,
        referencia,
        nombre_sucursal,
        telefono_contacto
    )
    SELECT
        p_id_cliente,
        u.direccion,
        u.id_municipio::uuid,
        COALESCE(u.municipio, m.nombre),
        COALESCE(u.estado, 'Nueva Esparta'),
        COALESCE(u.pais, 'Venezuela'),
        u.referencia,
        u.nombre_sucursal,
        u.telefono_contacto
    FROM jsonb_to_recordset(p_ubicaciones) AS u(
        direccion text,
        id_municipio text,
        municipio character varying(100),
        estado character varying(100),
        pais character varying(100),
        referencia text,
        nombre_sucursal character varying(100),
        telefono_contacto character varying(20)
    )
    LEFT JOIN public.municipios m ON m.id_municipio = u.id_municipio::uuid;
END;
$$;
