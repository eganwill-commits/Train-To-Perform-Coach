import { createClient } from "@supabase/supabase-js";

import { supabaseUrl, supabaseAnonKey } from "./publicConfig";
import { sandboxed } from "./sandbox";
export { supabaseUrl, supabaseAnonKey };

// These are the supabase-js defaults, written out on purpose: staying signed in
// on a device depends on all three, so they should be hard to change by accident.
//   persistSession   — keep the session in localStorage across app restarts
//   autoRefreshToken — renew the 1h access token in the background, forever
//   detectSessionInUrl — pick up magic-link / OAuth redirects
// Wrapped so the coach's "View as athlete" preview can run with writes switched off
// (see lib/sandbox.js). Outside the preview the wrapper passes everything straight through.
export const supabase = sandboxed(createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
}));
