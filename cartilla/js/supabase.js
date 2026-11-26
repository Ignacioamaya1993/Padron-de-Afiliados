import { createClient } from './vendor/supabase-client.js';
import { ENV } from './env.js';

export const supabase = createClient(
    ENV.SUPABASE_URL,
    ENV.SUPABASE_ANON_KEY,
    {
        db: {
            schema: 'cartilla'
        },
        auth: {
            storageKey: 'cartilla-medica-auth',
            storage: window.sessionStorage,
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: false
        }
    }
);