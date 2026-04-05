import { NextResponse } from "next/server";
import { uploadRepoImage } from "@/lib/github";
import { getSession } from "@/lib/session";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/svg+xml",
]);

export async function POST(request) {
  const session = await getSession();
  if (!session?.accessToken) return unauthorized();

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const questionId = String(formData.get("questionId") || "").trim();

    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "Image file is required." }, { status: 400 });
    }
    if (!questionId) {
      return NextResponse.json({ error: "Question ID is required for image upload." }, { status: 400 });
    }
    if (!ALLOWED_TYPES.has(String(file.type || "").toLowerCase())) {
      return NextResponse.json({ error: "Only JPG, PNG, WEBP, GIF, or SVG images are allowed." }, { status: 400 });
    }
    if (Number(file.size || 0) > 8 * 1024 * 1024) {
      return NextResponse.json({ error: "Image must be 8 MB or smaller." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const saved = await uploadRepoImage(session.accessToken, {
      questionId,
      fileName: file.name,
      contentType: file.type,
      base64Content: buffer.toString("base64"),
    });

    return NextResponse.json({
      ok: true,
      imagePath: saved.publicPath,
      commitSha: saved.commitSha,
      url: saved.url,
      sha: saved.sha,
    });
  } catch (error) {
    console.error("[api/media][POST]", error);
    return NextResponse.json({ error: error.message || "Image upload failed." }, { status: 500 });
  }
}
