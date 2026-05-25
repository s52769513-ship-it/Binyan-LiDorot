import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Service role key for sync writes – falls back to anon if not set (requires RLS disabled)
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || anonKey

export const supabase = createClient(url, anonKey)
export const supabaseAdmin = createClient(url, serviceKey)
