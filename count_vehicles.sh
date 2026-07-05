#!/bin/sh
psql -U postgres -c "SELECT COUNT(*) FROM public.vehiculos"
