#!/bin/sh
psql -U postgres -c "SELECT placa, marca, modelo, nombre_tipo FROM public.vehiculos v JOIN public.tipos_vehiculos tv ON v.id_tipo_vehiculo = tv.id_tipo_vehiculo ORDER BY v.placa LIMIT 5"
