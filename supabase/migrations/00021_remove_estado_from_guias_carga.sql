-- Remove estado columns from guias_carga (moved to facturas level)

-- Drop RPCs that reference estado_guia
DROP FUNCTION IF EXISTS public.cambiar_estado_guia(uuid, varchar, uuid, text);
DROP FUNCTION IF EXISTS public.obtener_historial_estados_guia(uuid);

-- Drop historial table (depends on estado_guia)
DROP TABLE IF EXISTS public.historial_estados_guia;

-- Drop validation function
DROP FUNCTION IF EXISTS public.es_transicion_valida(varchar, varchar);

-- Drop columns from guias_carga
ALTER TABLE IF EXISTS public.guias_carga
  DROP COLUMN IF EXISTS estado_guia,
  DROP COLUMN IF EXISTS estado;
