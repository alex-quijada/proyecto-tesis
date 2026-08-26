#!/bin/sh

printCurrentDate() {
    date "+%Y-%m-%d %H:%M:%S"
}

printCurrentDate
echo "========================================"
echo "Iniciando verificación de tablas"
echo "========================================"

# Check tables in public schema
echo "Tablas en schema public:"
psql -U postgres -c "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;"

echo -e "\nVerificando existencia de tabla vehiculos..."
EXISTS=$(psql -U postgres -c "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'vehiculos');" | grep " t")

echo "Resultado: $EXISTS"

if [ "$EXISTS" = " t" ]; then
    echo "✓ Tabla vehicles existe - procediendo a insertar camiones"
    echo "----------------------------------------"
    
    # Verify the SQL file exists and has content
    FILE_SIZE=$(wc -l < /home/postgres/upload_trucks.sql 2>/dev/null || echo "0")
    echo "SQL file size (lines): $FILE_SIZE"
    
    if [ "$FILE_SIZE" -gt 10 ]; then
        echo "SQL file has content, attempting to execute..."
        
        # First check what the SQL contains
        echo "Mostrando las primeras 20 líneas del SQL:"
        head -20 /home/postgres/upload_trucks.sql
        
        # Now run the SQL
        echo ""
        echo "Ejecutando inserciones..."
        psql -U postgres < /home/postgres/upload_trucks.sql
        
        # Verify the data was inserted
        echo "----------------------------------------"
        echo "Verificación final - encontrando camiones en base de datos:"
        psql -U postgres -c "SELECT placa, marca, modelo, peso_maximo, nombre_tipo as tipo FROM public.vehiculos v JOIN public.tipos_vehiculos tv ON v.id_tipo_vehiculo = tv.id_tipo_vehiculo WHERE placa IN ('A98AE3I', 'AA260XA', 'A48AR2B') ORDER BY placa;"
    else
        echo "✗ SQL file is empty or not found"
        echo ""
        echo "Cargando SQL desde el sistema de archivos local..."
        cat /home/postgres/upload_trucks.sql > /dev/null
    fi
else
    echo "✗ Tabla vehicles NO existe"
    echo "========================================"
    echo "ATENCION: La base de datos no tiene las tablas necesarias."
    echo "Debe ejecutar las migraciones primero:"
    echo "  supabase db reset"
    echo "  O instalar manualmente las tablas desde supabase/migrations/00003_vehiculos_mgmt.sql"
    echo "========================================"
fi

printCurrentDate
