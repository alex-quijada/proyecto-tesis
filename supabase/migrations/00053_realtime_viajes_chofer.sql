-- Publica viajes e itinerario_viaje en Realtime para que el chofer reciba
-- cambios de su viaje (admin agrega guías / reordena / cierra) sin polling.
-- El chofer solo recibe filas que puede SELECT por RLS (id_chofer = auth.uid()
-- en viajes; itinerario_viaje vía join con viajes del chofer).

ALTER PUBLICATION supabase_realtime ADD TABLE public.viajes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.itinerario_viaje;