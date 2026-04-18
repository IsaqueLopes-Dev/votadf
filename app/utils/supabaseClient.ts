import { createClient } from '@supabase/supabase-js';

export function getSupabaseClient() {
	return createClient(
		process.env.NEXT_PUBLIC_SUPABASE_URL!,
		process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
		{
			auth: {
				persistSession: true,
				autoRefreshToken: true,
				detectSessionInUrl: true,
			},
		}
	);
}
