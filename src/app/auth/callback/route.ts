import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ensureCurrentUserProfile } from "@/lib/ensure-profile";
import { getAppOrigin } from "@/lib/app-origin";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  // Never redirect to arbitrary destinations supplied in a link.
  const destination = url.searchParams.get("next") === "/update-password" ? "/update-password" : "/dashboard";
  let path = "/auth/link-error";
  if (code && !url.searchParams.has("error")) {
    try {
      const supabase = await createClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        if (destination === "/dashboard") await ensureCurrentUserProfile();
        path = destination;
      }
    } catch {
      // Do not reflect codes, tokens, or provider details into the response.
    }
  }
  const response = NextResponse.redirect(new URL(path, getAppOrigin()));
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
