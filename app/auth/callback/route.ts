import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/admin";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const isRelative = next.startsWith("/") && !next.startsWith("//");
      const forwardUrl = isRelative ? `${origin}${next}` : `${origin}/admin`;
      return NextResponse.redirect(forwardUrl);
    }
  }

  // If code exchange failed or no code provided, redirect to login with error
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}

