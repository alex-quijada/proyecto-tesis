-- Enable RLS on empresas table and allow authenticated users to read
ALTER TABLE empresas ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'empresas' 
        AND policyname = 'Authenticated users can read empresas'
    ) THEN
        CREATE POLICY "Authenticated users can read empresas"
            ON empresas
            FOR SELECT
            TO authenticated
            USING (true);
    END IF;
END $$;
