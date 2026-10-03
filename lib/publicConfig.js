// Public, non-secret configuration. No imports, so server routes can use it without
// creating a browser Supabase client at module load.
export const supabaseUrl = "https://qwrtaieptftldiiupxsz.supabase.co";
export const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF3cnRhaWVwdGZ0bGRpaXVweHN6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5MjY3OTksImV4cCI6MjA5MTUwMjc5OX0.o2xnwdlh3q_eOua1XiBDhwbERzT0-6aVfjJlvmTy8EA";

// Web Push sender identity (public half). The private half is VAPID_PRIVATE_KEY on the server.
export const VAPID_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
  "BDy92WDFHTuwzJ6nmBREMase0f6QIxhZCoUdFHT7Vdkx07HpAPUB7ow5CsOTmSZwVb1BQxVcAVtApCOM5_HmgeI";
