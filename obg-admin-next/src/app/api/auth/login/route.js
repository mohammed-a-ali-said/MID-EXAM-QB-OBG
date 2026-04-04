import { NextResponse } from "next/server";
import { assertEnv } from "@/lib/env";
import { createOAuthState, setOAuthStateCookie } from "@/lib/session";

export async function GET(request) {
  const env = assertEnv();
  const state = createOAuthState();
  await setOAuthStateCookie(state);

  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", env.githubClientId);
  url.searchParams.set("scope", env.oauthScope);
  url.searchParams.set("state", state);
  url.searchParams.set("redirect_uri", new URL("/api/auth/callback", request.url).toString());

  return NextResponse.redirect(url);
}
