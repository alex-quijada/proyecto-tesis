psql -U postgres << 'EOF'
SELECT '=== Estado actual de la base de datos ===' as message;

-- Verificar si la tabla vehiculos existe
SELECT CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'vehiculos') 
    THEN '✓ tabla vehiculos existe' 
    ELSE '✗ tabla vehiculos NO existe' 
END as vehiculos_table_status;

-- Verificar si la tabla tipos_vehiculos existe
SELECT CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tipos_vehiculos') 
    THEN '✓ tabla tipos_vehiculos existe' 
    ELSE '✗ tabla tipos_vehiculos NO existe' 
END as tipos_vehiculos_table_status;

-- Verificar si la tabla tipos_cajas existe
SELECT CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tipos_cajas') 
    THEN '✓ tabla tipos_cajas existe' 
    ELSE '✗ tabla tipos_cajas NO existe' 
END as tipos_cajas_table_status;

-- Verificar si la tabla estados_vehiculos existe
SELECT CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'estados_vehiculos') 
    THEN '✓ tabla estados_vehiculos existe' 
    ELSE '✗ tabla estados_vehiculos NO existe' 
END as estados_vehiculos_table_status;

-- Contar registros actuales en vehiculos
SELECT 'Total de vehículos:' as message, COUNT(*) as count FROM public.vehiculos;

EOF
