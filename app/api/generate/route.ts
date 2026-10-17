import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { stripFences } from "@/lib/stripFences";

const PLACEHOLDER_HTML = "<p>Placeholder</p>";

const SYSTEM_PROMPT =
  "Return ONE self-contained HTML file using Tailwind via the CDN script, with a data-id attribute on every element. Output nothing but the HTML.";

function stripDataPrefix(image: string): string {
  if (!image.startsWith("data:")) return image;
  const comma = image.indexOf(",");
  return comma === -1 ? image : image.slice(comma + 1);
}

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();

  let image: unknown;
  let prompt: unknown;
  try {
    const body = (await request.json()) as {
      image?: unknown;
      prompt?: unknown;
    } | null;
    image = body?.image;
    prompt = body?.prompt;
  } catch {
    image = undefined;
  }

  if (typeof image !== "string" || image.length === 0) {
    return NextResponse.json({ error: "Missing image" }, { status: 400 });
  }

  if (!apiKey) {
    return NextResponse.json({ html: PLACEHOLDER_HTML });
  }

  try {
    const client = new Anthropic({ apiKey });
    const content: Anthropic.ContentBlockParam[] = [
      {
        type: "image",
        source: {
          type: "base64",
          media_type: "image/png",
          data: stripDataPrefix(image),
        },
      },
    ];
    if (typeof prompt === "string" && prompt.length > 0) {
      content.push({ type: "text", text: prompt });
    }

    const message = await client.messages.create({
      model: "claude-sonnet-5-5",
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content }],
    });

    let text = "";
    for (const block of message.content) {
      if (block.type === "text") text += block.text;
    }

    return NextResponse.json({ html: stripFences(text) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upstream error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
