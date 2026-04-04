import { NextResponse } from "next/server";
import { assertEnv } from "@/lib/env";
import { exchangeCodeForToken, fetchViewer } from "@/lib/github";
import { consumeOAuthStateCookie, setSessionCookie } from "@/lib/session";

export async function GET(request) {
  try {
    const env = assertEnv();
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const savedState = await consumeOAuthStateCookie();

    if (!code || !state || !savedState || state !== savedState) {
      return NextResponse.redirect(new URL("/?error=oauth_state", request.url));
    }

    const accessToken = await exchangeCodeForToken({
      code,
      redirectUri: new URL("/api/auth/callback", request.url).toString(),
    });
    const viewer = await fetchViewer(accessToken);
    const login = String(viewer.login || "").toLowerCase();
    if (!env.allowedUsers.includes(login)) {
      return NextResponse.redirect(new URL("/?error=unauthorized", request.url));
    }

    await setSessionCookie({
      accessToken,
      login: viewer.login,
      name: viewer.name || viewer.login,
      avatarUrl: viewer.avatar_url || "",
    });

    return NextResponse.redirect(new URL("/", request.url));
  } catch (error) {
    console.error("[admin-oauth-callback]", error);
    return NextResponse.redirect(new URL("/?error=oauth_failed", request.url));
  }
}
