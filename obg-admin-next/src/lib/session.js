import crypto from "node:crypto";
import { cookies } from "next/headers";
import { assertEnv } from "@/lib/env";

export const SESSION_COOKIE = "obg_admin_session";
const STATE_COOKIE = "obg_admin_oauth_state";
const SESSION_TTL_SECONDS = 60 * 60 * 8;
const STATE_TTL_SECONDS = 60 * 10;

function base64urlEncode(value) {
  return Buffer.from(value).toString("base64url");
}

function base64urlDecode(value) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sign(value) {
  const { sessionSecret } = assertEnv();
  return crypto.createHmac("sha256", sessionSecret).update(value).digest("base64url");
}

function serialize(payload) {
  const json = JSON.stringify(payload);
  const body = base64urlEncode(json);
  const signature = sign(body);
  return `${body}.${signature}`;
}

function parse(raw) {
  if (!raw || typeof raw !== "string" || !raw.includes(".")) return null;
  const [body, signature] = raw.split(".");
  if (!body || !signature) return null;
  if (sign(body) !== signature) return null;
  try {
    const payload = JSON.parse(base64urlDecode(body));
    if (!payload || typeof payload !== "object") return null;
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

function cookieConfig(maxAgeSeconds) {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

export function createOAuthState() {
  return crypto.randomBytes(24).toString("base64url");
}

export async function setOAuthStateCookie(stateValue) {
  const jar = await cookies();
  jar.set(STATE_COOKIE, serialize({ state: stateValue, exp: Date.now() + STATE_TTL_SECONDS * 1000 }), cookieConfig(STATE_TTL_SECONDS));
}

export async function consumeOAuthStateCookie() {
  const jar = await cookies();
  const parsed = parse(jar.get(STATE_COOKIE)?.value || "");
  jar.delete(STATE_COOKIE);
  return parsed?.state || null;
}

export async function setSessionCookie(session) {
  const jar = await cookies();
  const payload = {
    ...session,
    exp: Date.now() + SESSION_TTL_SECONDS * 1000,
  };
  jar.set(SESSION_COOKIE, serialize(payload), cookieConfig(SESSION_TTL_SECONDS));
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

export async function getSession() {
  const jar = await cookies();
  return parse(jar.get(SESSION_COOKIE)?.value || "");
}
