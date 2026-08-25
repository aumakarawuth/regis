import { createClient } from '@supabase/supabase-js';

export function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env');
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

export const toBool = v => v === true || String(v).trim().toUpperCase() === 'TRUE';
export const orNull = v => (v === '' || v === undefined || v === null ? null : v);
