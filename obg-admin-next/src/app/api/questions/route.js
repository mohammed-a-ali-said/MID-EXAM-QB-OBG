import { NextResponse } from "next/server";
import { fetchRepoQuestions, saveRepoQuestions } from "@/lib/github";
import { validateQuestionsPayload } from "@/lib/questions";
import { getSession } from "@/lib/session";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET() {
  const session = await getSession();
  if (!session?.accessToken) return unauthorized();
  try {
    const payload = await fetchRepoQuestions(session.accessToken);
    return NextResponse.json(payload);
  } catch (error) {
    console.error("[api/questions][GET]", error);
    return NextResponse.json({ error: error.message || "Failed to load questions." }, { status: 500 });
  }
}

export async function PUT(request) {
  const session = await getSession();
  if (!session?.accessToken) return unauthorized();

  try {
    const body = await request.json();
    const questions = body?.questions;
    const sha = String(body?.sha || "").trim();
    const errors = validateQuestionsPayload(questions);
    if (!sha) errors.unshift("File SHA is required.");
    if (errors.length) {
      return NextResponse.json({ error: "Validation failed", errors }, { status: 400 });
    }

    const content = `${JSON.stringify(questions, null, 2)}\n`;
    const saved = await saveRepoQuestions(session.accessToken, { content, sha });
    return NextResponse.json({ ok: true, ...saved });
  } catch (error) {
    console.error("[api/questions][PUT]", error);
    return NextResponse.json({ error: error.message || "Failed to save questions." }, { status: 500 });
  }
}
