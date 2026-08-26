#!/bin/sh

# Función para obtener la fecha actual
printCurrentDate() {
    date "+%Y-%m-%d %H:%M:%S"
}

printCurrentDate
echo "========================================"
echo "VERIFYING DATABASE STATUS"
echo "========================================"

# Check if we can connect to PostgreSQL
if docker exec supabase_db_proyecto-tesis sh -c "psql -U postgres -c 'SELECT 1;'" > /dev/null 2>&1; then
    echo "✓ Connection to PostgreSQL successful"
    
    echo "-" >&2
    echo "Tablas actuales en schema 'public':" >&2
    docker exec supabase_db_proyecto-tesis sh -c "psql -U postgres -c \"SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;\"" 2>&1 | tail -n +5
    
    echo "-" >&2
    echo "Verificando tablas esenciales:" >&2
    
    VEHICULOS_OK=$(docker exec supabase_db_proyecto-tesis sh -c "psql -U postgres -c \"SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'vehiculos');\" 2>&1 | grep -c " t" || echo "0")
    TIPOS_VEHICULOS_OK=$(docker exec supabase_db_proyecto-tesis sh -c "psql -U postgres -c \"SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tipos_vehiculos');\" 2>&1 | grep -c " t" || echo "0")
    
    TIPOS_CAJA_OK=$(docker exec supabase_db_proyecto-tesis sh -c "psql -U postgres -c \"SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tipos_cajas');\" 2>&1 | grep -c " t" || echo "0")
    
    ESTADOS_VEHICULOS_OK=$(docker exec supabase_db_proyecto-tesis sh -c "psql -U postgres -c \"SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'estados_vehiculos');\" 2>&1 | grep -c " t" || echo "0")
    
    echo "  ✓ vehiculos table: $([ "$VEHICULOS_OK" -eq 1 ] && echo "exists" || echo "missing")" >&2
    echo "  ✓ tipos_vehiculos table: $([ "$TIPOS_VEHICULOS_OK" -eq 1 ] && echo "exists" || echo "missing")" >&2
    echo "  ✓ tipos_cajas table: $([ "$TIPOS_CAJA_OK" -eq 1 ] && echo "exists" || echo "missing")" >&2
    echo "  ✓ estados_vehiculos table: $([ "$ESTADOS_VEHICULOS_OK" -eq 1 ] && echo "exists" || echo "missing")" >&2
    
    TOTAL_VEHICULOS=$(docker exec supabase_db_proyecto-tesis sh -c "psql -U postgres -c \"SELECT COUNT(*) FROM public.vehiculos;\" 2>&1 | tail -1 | awk '{print $1}')
    
    echo "" >&2
    echo "✓ Current vehicle count: $TOTAL_VEHICULOS" >&2
    
    # If essential tables don't exist, try to create them
    if [ "$VEHICULOS_OK" -eq 0 ] || [ "$TIPOS_VEHICULOS_OK" -eq 0 ] || [ "$TIPOS_CAJA_OK" -eq 0 ] || [ "$ESTADOS_VEHICULOS_OK" -eq 0 ]; then
        echo "" >&2
        echo "⚠️ Essential tables missing. Attempting to create them..." >&2
        
        # Create the tables using the SQL from migration file
        if docker exec supabase_db_proyecto-tesis sh -c "
            psql -U postgres << 'EOF'
            -- Create catalog tables
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
                CONSTRAINT fk_vehiculo_tipo FOREIGN KEY (id_tipo_vehiculo) REFERENCES public.tipos_vehiculos(id_tipo_vehiculo),
                CONSTRAINT fk_vehiculo_caja FOREIGN KEY (id_tipo_caja) REFERENCES public.tipos_cajas(id_tipo_caja),
                CONSTRAINT fk_vehiculo_estado FOREIGN KEY (id_estado_vehiculo) REFERENCES public.estados_vehiculos(id_estado_vehiculo)
            );
            
            -- Insert catalog data
            INSERT INTO public.tipos_vehiculos (nombre_tipo) VALUES
            ('CARRO'), ('MOTO'), ('CAMION') ON CONFLICT DO NOTHING;
            
            INSERT INTO public.tipos_cajas (nombre_caja) VALUES
            ('SECA'), ('PLATAFORMA'), ('REFRIGERADO'), ('ARTICULADO') ON CONFLICT DO NOTHING;
            
            INSERT INTO public.estados_vehiculos (nombre_estado) VALUES
            ('OPERATIVO'), ('MANTENIMIENTO'), ('INACTIVO') ON CONFLICT DO NOTHING;
            EOF
        " 2>&1 | head -20; then
            echo "✓ Tables created successfully" >&2
            TOTAL_VEHICULOS=$(docker exec supabase_db_proyecto-tesis sh -c "psql -U postgres -c \"SELECT COUNT(*) FROM public.vehiculos;\" 2>&1 | tail -1 | awk '{print $1}')
            echo "✓ New vehicle count: $TOTAL_VEHICULOS" >&2
        else
            echo "✗ Failed to create tables" >&2
            echo "This might require manual intervention" >&2
            exit 1
        fi
    fi
    
else
    echo "✗ Connection failed" >&2
    exit 1
fi

printCurrentDate
echo "========================================"
echo "INSERTING TRUCK DATA"
echo "========================================"

# Create the upload_trucks.sql file with the truck data
tmp_sql="$(cat <<'EOF'
-- Insertar datos de camiones usando WITH clause para obtener IDs de catálogos

DO $$
DECLARE
    camion_id_vehiculo uuid;
    camion_id_tipo_vehiculo uuid;
    camion_id_tipo_caja uuid;
    camion_id_estado_vehiculo uuid;
    
    mercedes_id_vehiculo uuid;
    mercedes_id_tipo_vehiculo uuid;
    mercedes_id_tipo_caja uuid;
    mercedes_id_estado_vehiculo uuid;
    
    ford_id_vehiculo uuid;
    ford_id_tipo_vehiculo uuid;
    ford_id_tipo_caja uuid;
    ford_id_estado_vehiculo uuid;
    
    camion_tipo_registrado boolean := false;
    mercedes_tipo_registrado boolean := false;
    ford_tipo_registrado boolean := false;
BEGIN
    -- Obtener o crear IDs de catálogos
    SELECT id_tipo_vehiculo INTO camion_id_tipo_vehiculo FROM public.tipos_vehiculos WHERE nombre_tipo = 'CAMION';
    SELECT id_tipo_caja INTO camion_id_tipo_caja FROM public.tipos_cajas WHERE nombre_caja = 'PLATAFORMA';
    SELECT id_estado_vehiculo INTO camion_id_estado_vehiculo FROM public.estados_vehiculos WHERE nombre_estado = 'OPERATIVO';
    
    SELECT id_tipo_vehiculo INTO mercedes_id_tipo_vehiculo FROM public.tipos_vehiculos WHERE nombre_tipo = 'CAMION';
    SELECT id_tipo_caja INTO mercedes_id_tipo_caja FROM public.tipos_cajas WHERE nombre_caja = 'ARTICULADO';
    SELECT id_estado_vehiculo INTO mercedes_id_estado_vehiculo FROM public.estados_vehiculos WHERE nombre_estado = 'INACTIVO';
    
    SELECT id_tipo_vehiculo INTO ford_id_tipo_vehiculo FROM public.tipos_vehiculos WHERE nombre_tipo = 'CAMION';
    SELECT id_tipo_caja INTO ford_id_tipo_caja FROM public.tipos_cajas WHERE nombre_caja = 'REFRIGERADO';
    SELECT id_estado_vehiculo INTO ford_id_estado_vehiculo FROM public.estados_vehiculos WHERE nombre_estado = 'OPERATIVO';
    
    -- Insertar Mitsubishi Canter
    INSERT INTO public.vehiculos (
        placa, marca, modelo, anio,
        id_tipo_vehiculo, id_tipo_caja, capacidad_pallets, peso_maximo,
        id_estado_vehiculo
    ) VALUES (
        UPPER('A98AE3I'), 'MITSUBISHI', 'CANTER', 2020,
        camion_id_tipo_vehiculo, camion_id_tipo_caja, 20, 3500.0,
        camion_id_estado_vehiculo
    ) RETURNING id_vehiculo INTO camion_id_vehiculo;
    
    camiones_insertados := camiones_insertados + 1;
    RAISE NOTICE 'Camión Mitsubishi insertado: %', camion_id_vehiculo;
    
    -- Insertar Mercedes Benz Sprinter
    INSERT INTO public.vehiculos (
        placa, marca, modelo, anio,
        id_tipo_vehiculo, id_tipo_caja, capacidad_pallets, peso_maximo,
        id_estado_vehiculo
    ) VALUES (
        UPPER('AA260XA'), 'MERCEDES BENZ', 'SPRINTER', 2019,
        mercedes_id_tipo_vehiculo, mercedes_id_tipo_caja, 10, 0.0,
        mercedes_id_estado_vehiculo
    ) RETURNING id_vehiculo INTO mercedes_id_vehiculo;
    
    camiones_insertados := camiones_insertados + 1;
    RAISE NOTICE 'Camión Mercedes insertado: %', mercedes_id_vehiculo;
    
    -- Insertar Ford Cargo 1721
    INSERT INTO public.vehiculos (
        placa, marca, modelo, anio,
        id_tipo_vehiculo, id_tipo_caja, capacidad_pallets, peso_maximo,
        id_estado_vehiculo
    ) VALUES (
        UPPER('A48AR2B'), 'FORD', 'CARGO 1721', 2018,
        ford_id_tipo_vehiculo, ford_id_tipo_caja, 30, 9000.0,
        ford_id_estado_vehiculo
    ) RETURNING id_vehiculo INTO ford_id_vehiculo;
    
    camiones_insertados := camiones_insertados + 1;
    RAISE NOTICE 'Camión Ford insertado: %', ford_id_vehiculo;
    
    RAISE NOTICE 'Total camiones insertados: %', camiones_insertados;
END;
$$;
EOF
)"

# Write the SQL to a file and execute it
echo "$tmp_sql" > /home/postgres/insert_trucks.sql
docker exec supabase_db_proyecto-tesis sh -c "psql -U postgres < /home/postgres/insert_trucks.sql" 2>&1 | grep -E "(RAISE NOTICE|Camión|SUCCESS|ERROR|WARNING)"

printCurrentDate
echo "========================================"
echo "VERIFICATION"
echo "========================================"

# Verify the trucks were inserted
TRUCKS_VERIFICATION=$(docker exec supabase_db_proyecto-tesis sh -c "
    psql -U postgres -c \"SELECT v.placa, v.marca, v.modelo, v.peso_maximo, tv.nombre_tipo as tipo FROM public.vehiculos v JOIN public.tipos_vehiculos tv ON v.id_tipo_vehiculo = tv.id_tipo_vehiculo WHERE placa IN ('A98AE3I', 'AA260XA', 'A48AR2B') ORDER BY v.placa;\" 2>&1 | grep -E "A98AE3I|AA260XA|A48AR2B" | wc -l
" 2>&1)

echo "Trucks found in database: $TRUCKS_VERIFICATION/3" >&2

echo "" >&2
echo "Truck data in database:" >&2
docker exec supabase_db_proyecto-tesis sh -c "psql -U postgres -c \"SELECT v.placa, v.marca, v.modelo, v.anio, tv.nombre_tipo as tipo, v.peso_maximo FROM public.vehiculos v JOIN public.tipos_vehiculos tv ON v.id_tipo_vehiculo = tv.id_tipo_vehiculo WHERE placa IN ('A98AE3I', 'AA260XA', 'A48AR2B') ORDER BY v.placa;\" 2>&1" | tail -4

if [ "$TRUCKS_VERIFICATION" -eq 3 ]; then
    echo "" >&2
    echo "========================================" >&2
    echo "✓ SUCCESS: All 3 trucks inserted successfully!" >&2
    echo "✓ Truck data is ready for use in the Angular application" >&2
    echo "========================================" >&2
else
    echo "" >&2
    echo "========================================" >&2
    echo "❌ ERROR: Failed to insert all trucks" >&2
    echo "Please check the logs above for details" >&2
    echo "========================================" >&2
    exit 1
fi

printCurrentDate
