import { createClient } from "@supabase/supabase-js";

export const supabaseUrl = "https://qwrtaieptftldiiupxsz.supabase.co";
export const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF3cnRhaWVwdGZ0bGRpaXVweHN6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5MjY3OTksImV4cCI6MjA5MTUwMjc5OX0.o2xnwdlh3q_eOua1XiBDhwbERzT0-6aVfjJlvmTy8EA";

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
