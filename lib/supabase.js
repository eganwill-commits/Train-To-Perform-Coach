import { createClient } from "@supabase/supabase-js";

import { supabaseUrl, supabaseAnonKey } from "./publicConfig";
export { supabaseUrl, supabaseAnonKey };

// These are the supabase-js defaults, written out on purpose: staying signed in
// on a device depends on all three, so they should be hard to change by accident.
//   persistSession   — keep the session in localStorage across app restarts
//   autoRefreshToken — renew the 1h access token in the background, forever
//   detectSessionInUrl — pick up magic-link / OAuth redirects
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
