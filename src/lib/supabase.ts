import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://jsytmshwyglrwxxovypp.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpzeXRtc2h3eWdscnd4eG92eXBwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2ODA2NzksImV4cCI6MjA4NzI1NjY3OX0.EwlzMVgHpc6USacwgZcMGDQtGoP-0pI-ZPYrPC--RuU';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
