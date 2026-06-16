--Database en supabase
-- ==========================================
-- ACTIVAR EXTENSIÓN PARA GENERAR UUIDs
-- ==========================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";



-- También limpiamos versiones previas sin comillas por si acaso
DROP TABLE IF EXISTS public.incidencias CASCADE;
DROP TABLE IF EXISTS public.detalle_guia_despacho CASCADE;
DROP TABLE IF EXISTS public.guias_despacho CASCADE;
DROP TABLE IF EXISTS public.despachos CASCADE;
DROP TABLE IF EXISTS public.ubicaciones CASCADE;
DROP TABLE IF EXISTS public.clientes CASCADE;
DROP TABLE IF EXISTS public.vehiculos CASCADE;
DROP TABLE IF EXISTS public.tipos_cajas CASCADE;
DROP TABLE IF EXISTS public.tipos_vehiculos CASCADE;
DROP TABLE IF EXISTS public.estados_vehiculos CASCADE;
DROP TABLE IF EXISTS public.prioridades_clientes CASCADE;
DROP TABLE IF EXISTS public.usuarios CASCADE;
DROP TABLE IF EXISTS public.roles CASCADE;

-- ==========================================
-- MÓDULO DE SEGURIDAD Y ROLES (ADAPTADO A SUPABASE)
-- ==========================================
CREATE TABLE public.roles (
    id_rol uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre_rol character varying(50) NOT NULL UNIQUE
);

CREATE TABLE public.usuarios (
    id_usuario uuid PRIMARY KEY, -- Recibe directamente el UUID de auth.users(id)
    email character varying NOT NULL UNIQUE,
    id_rol uuid NOT NULL REFERENCES public.roles(id_rol) ON DELETE RESTRICT,
    nombre_completo character varying(150) NOT NULL,
    cedula integer NOT NULL UNIQUE,
    prefijo_doc CHAR(1) NOT NULL DEFAULT 'V' CHECK (prefijo_doc IN ('V', 'E', 'J', 'P', 'G')),
    CONSTRAINT usuarios_id_usuario_fkey FOREIGN KEY (id_usuario) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- ==========================================
-- MÓDULO DE TABLAS MAESTRAS (CATÁLOGOS)
-- ==========================================
CREATE TABLE public.prioridades_clientes (
    id_prioridad uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre_prioridad character varying(50) NOT NULL UNIQUE
);

CREATE TABLE public.estados_vehiculos (
    id_estado_vehiculo uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre_estado character varying(50) NOT NULL UNIQUE
);

CREATE TABLE public.tipos_vehiculos (
    id_tipo_vehiculo uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre_tipo character varying(50) NOT NULL UNIQUE
);

CREATE TABLE public.tipos_cajas (
    id_tipo_caja uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre_caja character varying(50) NOT NULL UNIQUE
);

-- ==========================================
-- MÓDULO DE FLOTA Y CLIENTES
-- ==========================================
CREATE TABLE public.vehiculos (
    id_vehiculo uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    placa character varying(20) NOT NULL UNIQUE,
    marca character varying(50) NOT NULL,
    modelo character varying(50) NOT NULL,
    anio integer NOT NULL,
    id_tipo_vehiculo uuid NOT NULL REFERENCES public.tipos_vehiculos(id_tipo_vehiculo) ON DELETE RESTRICT,
    id_tipo_caja uuid NOT NULL REFERENCES public.tipos_cajas(id_tipo_caja) ON DELETE RESTRICT,
    capacidad_pallets integer DEFAULT 0,
    peso_maximo numeric(10, 2) NOT NULL,
    id_estado_vehiculo uuid NOT NULL REFERENCES public.estados_vehiculos(id_estado_vehiculo) ON DELETE RESTRICT
);

CREATE TABLE public.clientes (
    id_cliente uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre_comercial character varying(150) NOT NULL,
    id_prioridad uuid NOT NULL REFERENCES public.prioridades_clientes(id_prioridad) ON DELETE RESTRICT
);

CREATE TABLE public.ubicaciones (
    id_ubicacion uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    id_cliente uuid NOT NULL REFERENCES public.clientes(id_cliente) ON DELETE CASCADE,
    direccion_completa text NOT NULL,
    calle_avenida character varying(100),
    sector_urbanizacion character varying(100),
    municipio character varying(100) NOT NULL,
    ciudad character varying(100) NOT NULL,
    estado_provincia character varying(100) NOT NULL,
    codigo_postal character varying(20),
    latitud double precision NOT NULL,
    longitud double precision NOT NULL,
    referencia text
);

-- ==========================================
-- MÓDULO DE OPERACIÓN Y LOGÍSTICA DE RUTAS
-- ==========================================

-- NIVEL 1: El Viaje Físico
CREATE TABLE public.despachos (
    id_despacho uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    fecha_despacho date NOT NULL DEFAULT CURRENT_DATE,
    id_vehiculo uuid NOT NULL REFERENCES public.vehiculos(id_vehiculo) ON DELETE RESTRICT,
    id_chofer uuid NOT NULL REFERENCES public.usuarios(id_usuario) ON DELETE RESTRICT,
    id_ayudante uuid REFERENCES public.usuarios(id_usuario) ON DELETE SET NULL,
    id_analista uuid NOT NULL REFERENCES public.usuarios(id_usuario) ON DELETE RESTRICT,
    estado_despacho character varying(50) NOT NULL DEFAULT 'Planificado',
    CONSTRAINT chk_estado_despacho CHECK (estado_despacho IN ('Planificado', 'En Ruta', 'Finalizado', 'Liquidado'))
);

-- NIVEL 2: El Documento por Zona
CREATE TABLE public.guias_despacho (
    id_guia uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    id_despacho uuid NOT NULL REFERENCES public.despachos(id_despacho) ON DELETE CASCADE,
    codigo_guia_externo character varying(100) NOT NULL UNIQUE,
    municipio_zona character varying(100) NOT NULL,
    estado_guia character varying(50) NOT NULL DEFAULT 'Pendiente',
    CONSTRAINT chk_estado_guia CHECK (estado_guia IN ('Pendiente', 'En proceso', 'Completada'))
);

-- NIVEL 3: Los Clientes/Facturas dentro de cada guía
CREATE TABLE public.detalle_guia_despacho (
    id_detalle_guia uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    id_guia uuid NOT NULL REFERENCES public.guias_despacho(id_guia) ON DELETE CASCADE,
    num_factura character varying(100) NOT NULL,
    id_cliente uuid NOT NULL REFERENCES public.clientes(id_cliente) ON DELETE RESTRICT,
    id_ubicacion_entrega uuid NOT NULL REFERENCES public.ubicaciones(id_ubicacion) ON DELETE RESTRICT,
    monto_pedido_dolares numeric(12, 2) NOT NULL DEFAULT 0.00,
    peso_pedido numeric(10, 2) NOT NULL DEFAULT 0.00,
    volumen_pedido numeric(10, 2) NOT NULL DEFAULT 0.00,
    orden_visita integer NOT NULL,
    estado_entrega character varying(50) NOT NULL DEFAULT 'Por Entregar',
    CONSTRAINT chk_estado_entrega CHECK (estado_entrega IN ('Por Entregar', 'Entregado Total', 'Entregado Parcial', 'Rechazado')),
    hora_llegada_real timestamp with time zone,
    hora_entrega_real timestamp with time zone,
    tiempo_espera interval
);

CREATE TABLE public.incidencias (
    id_incidencia uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    id_detalle_guia uuid NOT NULL REFERENCES public.detalle_guia_despacho(id_detalle_guia) ON DELETE CASCADE,
    tipo_incidencia character varying(100) NOT NULL,
    descripcion text NOT NULL,
    foto_evidencia_url text,
    hora_reporte timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- SCRIPT DE INSERCIÓN MAESTRA CON UUID
-- ==========================================
INSERT INTO public.roles (nombre_rol) VALUES ('Administrador'), ('Coordinador'), ('Analista'), ('Chofer'), ('Ayudante');
INSERT INTO public.prioridades_clientes (nombre_prioridad) VALUES ('VIP'), ('Cadena'), ('Regular');
INSERT INTO public.estados_vehiculos (nombre_estado) VALUES ('OPERATIVO'), ('MANTENIMIENTO'), ('INACTIVO');
INSERT INTO public.tipos_vehiculos (nombre_tipo) VALUES ('CARRO'), ('MOTO'), ('CAMION');
INSERT INTO public.tipos_cajas (nombre_caja) VALUES ('SECA'), ('PLATAFORMA'), ('REFRIGERADO'), ('ARTICULADO');

-- ==========================================
-- AUTOMATIZACIÓN DE USUARIOS (TRIGGER)
-- ==========================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  default_role_id uuid;
BEGIN
  -- Busca el ID del rol enviado en el metadata (Si no se manda nada, asigna 'Chofer' por defecto)
  SELECT id_rol INTO default_role_id 
  FROM public.roles 
  WHERE nombre_rol = COALESCE(new.raw_user_meta_data->>'nombre_rol', 'Chofer') 
  LIMIT 1;

  -- Inserta directamente en la tabla pública sincronizada
  INSERT INTO public.usuarios (id_usuario, email, id_rol, nombre_completo, cedula, prefijo_doc)
  VALUES (
    new.id,
    new.email,
    default_role_id,
    COALESCE(new.raw_user_meta_data->>'nombre_completo', 'Usuario Nuevo'),
    (new.raw_user_meta_data->>'cedula')::integer,
    COALESCE(new.raw_user_meta_data->>'prefijo_doc', 'V')
  );
  return new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Disparador asociado al Auth de Supabase
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();