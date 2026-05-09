import { createClient } from "@supabase/supabase-js";
export const supabaseUrl = "https://qwrtaieptftldiiupxsz.supabase.co";
export const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF3cnRhaWVwdGZ0bGRpaXVweHN6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5MjY3OTksImV4cCI6MjA5MTUwMjc5OX0.o2xnwdlh3q_eOua1XiBDhwbERzT0-6aVfjJlvmTy8EA";
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
