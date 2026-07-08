import 'server-only';
import { createClient } from '@supabase/supabase-js';

// Server-only Supabase client using the service-role key — bypasses RLS, so it
// must never be imported from client components or exposed via NEXT_PUBLIC_.

export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

export const ESSAYS_BUCKET = 'essays';
export const MAX_PDF_BYTES = 4 * 1024 * 1024; // stays under Vercel's 4.5MB body limit
