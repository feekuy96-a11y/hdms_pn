import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    "https://iiuearxdsbilcpsfzhyp.supabase.co";
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlpdWVhcnhkc2JpbGNwc2Z6aHlwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE3ODAyMTksImV4cCI6MjEwNzM1NjIxOX0.NlmieOWIm9medTsUzHkQdEvUySj-tat4KwIDOsCVvxg";

  return createBrowserClient(supabaseUrl, supabaseKey);
}

