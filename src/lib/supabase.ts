import { createClient } from '@supabase/supabase-js';

// Fallback to dummy values so Vercel build doesn't crash if env vars are missing
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://erqovwhqklkvqjarcuha.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVycW92d2hxa2xrdnFqYXJjdWhhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMxODU4OTQsImV4cCI6MjA5ODc2MTg5NH0.0tf35TRZfchKDve_NMh1NeDH43GxbnCQ911ON26zf60';

export const supabase = createClient(supabaseUrl, supabaseKey);
