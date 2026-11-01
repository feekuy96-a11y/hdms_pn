import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { type NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();

  // Check if a user is logged in
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    await supabase.auth.signOut();
  }

  // Clear any legacy demo bypass cookies if set
  const response = NextResponse.redirect(new URL("/login", req.url), {
    status: 302,
  });
  response.cookies.delete("doh_admin_role");

  revalidatePath("/", "layout");
  return response;
}

