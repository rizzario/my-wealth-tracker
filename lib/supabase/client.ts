// lib/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr';

let client: ReturnType<typeof createBrowserClient> | undefined;

/**
 * Browser client singleton (Client Components)
 * Reference: AGENTS.md §4.3
 * Caches the browser client across re-renders to avoid `Multiple GoTrueClient instances detected`.
 */
export function createClient() {
  if (!client) {
    client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return client;
}