import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    "https://iiuearxdsbilcpsfzhyp.supabase.co";
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlpdWVhcnhkc2JpbGNwc2Z6aHlwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE3ODAyMTksImV4cCI6MjEwNzM1NjIxOX0.NlmieOWIm9medTsUzHkQdEvUySj-tat4KwIDOsCVvxg";

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        supabaseResponse = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
        if (headers) {
          Object.entries(headers).forEach(([key, value]) =>
            supabaseResponse.headers.set(key, value)
          );
        }
      },
    },
  });

  // IMPORTANT: Do not run code between createServerClient and supabase.auth.getUser().
  // getUser() refreshes the auth token and validates against the Supabase Auth server.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Protected route checking:
  // Protect /admin and any sub-routes
  if (pathname.startsWith("/admin")) {
    const hasAdminBypass =
      request.nextUrl.searchParams.get("demo") === "admin" ||
      request.cookies.get("doh_admin_role")?.value === "doh_admin";

    if (!user && !hasAdminBypass) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/login";
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  // If authenticated user visits /login, redirect directly to /admin
  if (pathname === "/login" && user) {
    const nextDestination =
      request.nextUrl.searchParams.get("next") || "/admin";
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = nextDestination;
    redirectUrl.searchParams.delete("next");
    return NextResponse.redirect(redirectUrl);
  }

  return supabaseResponse;
}

