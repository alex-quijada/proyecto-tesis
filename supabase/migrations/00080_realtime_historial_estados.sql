-- El Recorrido del viaje (admin) necesita actualizarse en cada transición
-- de una factura (llegada, entrega, incidencia, finalizado). Esas transiciones
-- escriben en historial_estados_factura sin tocar viajes/itinerario_viaje,
-- así que el canal de seguimiento no las recibía y el timeline quedaba
-- desactualizado. Se agrega la tabla a la publicación supabase_realtime.
ALTER PUBLICATION supabase_realtime ADD TABLE public.historial_estados_factura;