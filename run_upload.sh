CABECERAS_ARCHIVO_SECCION() {
    echo "========================================"
    echo "Seccion: $1"
    echo "========================================"
}

# Function to print current date
printCurrentDate() {
    date "+%Y-%m-%d %H:%M:%S"
}

printCurrentDate

CABECERAS_ARCHIVO_SECCION "Verificar existencia de tablas"
docker exec supabase_db_proyecto-tesis psql -U postgres -c "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;" 2>/dev/null | grep -v "No result" || echo "No tables exist in public schema"

CABECERAS_ARCHIVO_SECCION "Verificar migraciones"
docker exec supabase_db_proyecto-tesis psql -U postgres -c "SELECT version, created_on FROM supabase_migrations.schema_migrations ORDER BY created_on DESC;" 2>/dev/null || echo "No se encontro tabla supabase_migrations"

CABECERAS_ARCHIVO_SECCION "Intentar ejecutar archivo SQL"
docker exec supabase_db_proyecto-tesis psql -U postgres -d postgres < /home/postgres/upload_trucks.sql 2>&1 | tail -20

printCurrentDate
