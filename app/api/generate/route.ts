import { NextResponse } from "next/server";

const PLACEHOLDER_HTML = "<p>Placeholder</p>";

export async function POST(request: Request) {
  // Server-side only. Unused for now; a missing key must not throw.
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  void anthropicApiKey;

  let image: unknown;
  try {
    const body = (await request.json()) as { image?: unknown } | null;
    image = body?.image;
  } catch {
    image = undefined;
  }

  if (typeof image !== "string" || image.length === 0) {
    return NextResponse.json({ error: "Missing image" }, { status: 400 });
  }

  return NextResponse.json({ html: PLACEHOLDER_HTML });
}
