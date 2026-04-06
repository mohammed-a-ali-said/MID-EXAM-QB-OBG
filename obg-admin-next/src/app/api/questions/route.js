import { NextResponse } from "next/server";
import { fetchRepoContent, saveRepoContent } from "@/lib/github";
import { computePublicStudyStats, normalizeMetadata, validateMetadataPayload, validateQuestionsPayload } from "@/lib/questions";
import { getSession } from "@/lib/session";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET() {
  const session = await getSession();
  if (!session?.accessToken) return unauthorized();
  try {
    const payload = await fetchRepoContent(session.accessToken);
    const metadata = normalizeMetadata(payload.metadata, payload.questions);
    return NextResponse.json({
      ...payload,
      metadata,
      publicStats: computePublicStudyStats(payload.questions, metadata),
    });
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
    const metadataSha = String(body?.metadataSha || "").trim();
    const metadataValidation = validateMetadataPayload(body?.metadata);
    const metadata = normalizeMetadata(metadataValidation.normalized, questions);
    const errors = [
      ...validateQuestionsPayload(questions),
      ...metadataValidation.errors,
    ];
    if (!sha) errors.unshift("Question file SHA is required.");
    if (!metadataSha) errors.unshift("Metadata file SHA is required.");
    if (errors.length) {
      return NextResponse.json({ error: "Validation failed", errors }, { status: 400 });
    }

    const questionsContent = `${JSON.stringify(questions, null, 2)}\n`;
    const metadataContent = `${JSON.stringify(metadata, null, 2)}\n`;
    const saved = await saveRepoContent(session.accessToken, {
      questionsContent,
      questionsSha: sha,
      metadataContent,
      metadataSha,
    });
    return NextResponse.json({
      ok: true,
      metadata,
      publicStats: computePublicStudyStats(questions, metadata),
      ...saved,
    });
  } catch (error) {
    console.error("[api/questions][PUT]", error);
    return NextResponse.json({ error: error.message || "Failed to save questions." }, { status: 500 });
  }
}
