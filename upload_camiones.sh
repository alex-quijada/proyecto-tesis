#!/bin/sh

# Function to print current date
printCurrentDate() {
    date "+%Y-%m-%d %H:%M:%S"
}

printCurrentDate
echo "========================================"
echo "INICIANDO PROCESO DE CARGA DE CAMIONES"
echo "========================================"

# Check if we can connect to PostgreSQL
echo "Probando conexión a PostgreSQL..."
if docker exec supabase_db_proyecto-tesis sh -c "psql -U postgres -c 'SELECT 1;'" > /dev/null 2>&1; then
    echo "✓ Conexión exitosa"
else
    echo "✗ No se pudo conectar a la base de datos"
    exit 1
fi

# Check current state of tables
echo -e "\nEstado actual de tablas:"
docker exec supabase_db_proyecto-tesis sh -c "psql -U postgres -c \"SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;\" 2>&1"

# Check if the essential tables exist
VEHICULOS_EXISTS=$(docker exec supabase_db_proyecto-tesis sh -c "psql -U postgres -c \"SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'vehiculos');\" 2>&1" | grep " t" | wc -l)
TIPOS_VEHICLE_EXISTS=$(docker exec supabase_db_proyecto-tesis sh -c "psql -U postgres -c \"SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tipos_vehiculos');\" 2>&1" | grep " t" | wc -l)

# Show current vehicle count
CURRENT_COUNT=$(docker exec supabase_db_proyecto-tesis sh -c "psql -U postgres -c \"SELECT COUNT(*) FROM public.vehiculos;\" 2>&1 | tail -1 | awk '{print $1}'")

echo -e "\nVerificación rápida:"
echo "  - Total de vehículos en base de datos: $CURRENT_COUNT"
echo "  - Tabla vehiculos existe: $([ "$VEHICULOS_EXISTS" -eq 1 ] && echo "✓" || echo "✗")"
echo "  - Tabla tipos_vehiculos existe: $([ "$TIPOS_VEHICLE_EXISTS" -eq 1 ] && echo "✓" || echo "✗")"

# If tables don't exist, try to run migrations
if [ "$VEHICULOS_EXISTS" -eq 0 ] || [ "$TIPOS_VEHICLE_EXISTS" -eq 0 ]; then
    echo -e "\n⚠️  Las tablas necesarias no existen. Intentando ejecutar migraciones..."
    echo "Esto podría tomar algunos minutos..."
    
    # Copy the migration file to the container
    echo "Copiando migraciones a la base de datos..."
    docker cp "C:\\Users\\Dick-\\Desktop\\Proyecto\\proyecto-tesis\\supabase\\migrations\\00003_vehiculos_mgmt.sql" supabase_db_proyecto-tesis:/home/postgres/ 2>&1
    
    # Try to run the migration
    echo "Ejecutando migración 00003..."
    if docker exec supabase_db_proyecto-tesis sh -c "psql -U postgres < /home/postgres/00003_vehiculos_mgmt.sql" > /dev/null 2>&1; then
        echo "✓ Migración completada"
    else
        echo "✗ Error al ejecutar migración"
        echo "Intentando método alternativo..."
        
        # Try to create the tables manually
        echo "Creando tablas manualmente..."
        cat > /tmp/create_tables.sql << 'EOF'
-- Crear catalogos
CREATE TABLE IF NOT EXISTS public.tipos_vehiculos (
    id_tipo_vehiculo uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre_tipo varchar NOT NULL
);

CREATE TABLE IF NOT EXISTS public.tipos_cajas (
    id_tipo_caja uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre_caja varchar NOT NULL
);

CREATE TABLE IF NOT EXISTS public.estados_vehiculos (
    id_estado_vehiculo uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre_estado varchar NOT NULL
);

CREATE TABLE IF NOT EXISTS public.vehiculos (
    id_vehiculo uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    placa varchar NOT NULL,
    marca varchar NOT NULL,
    modelo varchar NOT NULL,
    anio integer NOT NULL,
    id_tipo_vehiculo uuid NOT NULL,
    id_tipo_caja uuid NOT NULL,
    capacidad_pallets integer NOT NULL DEFAULT 0,
    peso_maximo numeric NOT NULL DEFAULT 0,
    id_estado_vehiculo uuid NOT NULL,
    imagen_url text,
    CONSTRAINT fk_vehiculo_tipo FOREIGN KEY (id_tipo_vehiculo) REFERENCES public.tipos_vehiculos(id_tipo_vehiculo),
    CONSTRAINT fk_vehiculo_caja FOREIGN KEY (id_tipo_caja) REFERENCES public.tipos_cajas(id_tipo_caja),
    CONSTRAINT fk_vehiculo_estado FOREIGN KEY (id_estado_vehiculo) REFERENCES public.estados_vehiculos(id_estado_vehiculo)
);

-- Insertar datos de catálogo
INSERT INTO public.tipos_vehiculos (nombre_tipo) VALUES
('CARRO'), ('MOTO'), ('CAMION') ON CONFLICT DO NOTHING;

INSERT INTO public.tipos_cajas (nombre_caja) VALUES
('SECA'), ('PLATAFORMA'), ('REFRIGERADO'), ('ARTICULADO') ON CONFLICT DO NOTHING;

INSERT INTO public.estados_vehiculos (nombre_estado) VALUES
('OPERATIVO'), ('MANTENIMIENTO'), ('INACTIVO') ON CONFLICT DO NOTHING;
EOF
        
        if docker exec supabase_db_proyecto-tesis sh -c "psql -U postgres < /tmp/create_tables.sql" > /dev/null 2>&1; then
            echo "✓ Tablas creadas manualmente"
        else
            echo "✗ No se pudo crear las tablas"
            exit 1
        fi
    fi
fi

# Now try to insert the truck data
printCurrentDate
echo "========================================"
echo "INSERTANDO DATOS DE CAMIONES"
echo "========================================"

# First check what catalog data exists
echo "Verificando datos de catálogo..."
docker exec supabase_db_proyecto-tesis sh -c "psql -U postgres -c \"SELECT nombre_tipo FROM public.tipos_vehiculos ORDER BY nombre_tipo;\""
echo ""
docker exec supabase_db_proyecto-tesis sh -c "psql -U postgres -c \"SELECT nombre_caja FROM public.tipos_cajas ORDER BY nombre_caja;\""
echo ""
docker exec supabase_db_proyecto-tesis sh -c "psql -U postgres -c \"SELECT nombre_estado FROM public.estados_vehiculos ORDER BY nombre_estado;\""

# Now insert the trucks using a proper SQL script
printCurrentDate
echo "Ejecutando script de inserción de camiones..."
docker exec supabase_db_proyecto-tesis sh -c "psql -U postgres < /home/postgres/upload_trucks.sql" 2>&1 | tail -20

# Verify the trucks were inserted
printCurrentDate
echo "========================================"
echo "VERIFICACIÓN DE INSERCIÓN"
echo "========================================"

# Check if the trucks are there
TRUCKS_FOUND=$(docker exec supabase_db_proyecto-tesis sh -c "psql -U postgres -c \"SELECT placa, marca, modelo, peso_maximo, nombre_tipo as tipo FROM public.vehiculos v JOIN public.tipos_vehiculos tv ON v.id_tipo_vehiculo = tv.id_tipo_vehiculo WHERE placa IN ('A98AE3I', 'AA260XA', 'A48AR2B') ORDER BY placa;\" 2>&1" | grep -c "A98AE3I\|AA260XA\|A48AR2B")

echo "Camiones encontrados: $TRUCKS_FOUND/3"

echo -e "\nDatos insertados:"
docker exec supabase_db_proyecto-tesis sh -c "psql -U postgres -c \"SELECT v.placa, v.marca, v.modelo, v.anio, tv.nombre_tipo as tipo, v.peso_maximo FROM public.vehiculos v JOIN public.tipos_vehiculos tv ON v.id_tipo_vehiculo = tv.id_tipo_vehiculo WHERE placa IN ('A98AE3I', 'AA260XA', 'A48AR2B') ORDER BY v.placa;\" 2>&1"

if [ "$TRUCKS_FOUND" -eq 3 ]; then
    echo -e "\n✓ ¡ÉXITO! Los 3 camiones han sido insertados correctamente en la base de datos."
else
    echo -e "\n❌ ERROR: No se pudieron insertar todos los camiones."
    echo "Revise los logs de arriba para detalles."
fi

printCurrentDate
echo "========================================"
