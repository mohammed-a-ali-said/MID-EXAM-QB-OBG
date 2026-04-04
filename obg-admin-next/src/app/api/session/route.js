import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  if (!session?.login) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
  const env = getEnv();
  return NextResponse.json({
    authenticated: true,
    user: {
      login: session.login,
      name: session.name || session.login,
      avatarUrl: session.avatarUrl || "",
    },
    repo: {
      owner: env.repoOwner,
      repo: env.repoName,
      branch: env.repoBranch,
      path: env.repoPath,
    },
  });
}
