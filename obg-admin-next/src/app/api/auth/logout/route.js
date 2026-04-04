import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/session";

export async function GET(request) {
  await clearSessionCookie();
  return NextResponse.redirect(new URL("/", request.url));
}
