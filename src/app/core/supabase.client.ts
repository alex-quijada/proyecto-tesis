import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
    'https://rgjsjvvwfoeqhliidjqt.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJnanNqdnZ3Zm9lcWhsaWlkanF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxNjk1NTAsImV4cCI6MjA5Mjc0NTU1MH0.JwuGCL1-U1pbwctCqbA846BREIJfm2lw1jRyGt8YGkg',
);
