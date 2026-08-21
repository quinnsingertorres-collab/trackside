import { NextResponse } from "next/server";
import { ROSTER } from "@/lib/roster";

export const runtime = "nodejs";

const MODEL = "claude-haiku-4-5";
const MAX_BYTES = 5 * 1024 * 1024;
const PROMPT =
  'This is a photo of an MBTA (Boston transit) rail car. Rail cars have a fleet/car ' +
  "number painted on the exterior — usually 3–4 digits, often near the front, a side " +
  "door, or the roofline. Look carefully and reply with ONLY a JSON object, no other text: " +
  '{"number": "1857"} if you can read a car number, or {"number": null} if none is visible ' +
  "or you're not confident.";

function findCarMatches(rawNumber) {
  if (!rawNumber) return [];
  const digits = String(rawNumber).replace(/[^0-9]/g, "");
  if (!digits) return [];
  const asInt = parseInt(digits, 10);
  return ROSTER.filter((c) => c.numberDisplay === digits || c.number === asInt);
}

function extractNumber(text) {
  try {
    const parsed = JSON.parse(text.trim());
    if (parsed && parsed.number != null) return String(parsed.number);
    return null;
  } catch {
    const m = text.match(/\d{3,4}/);
    return m ? m[0] : null;
  }
}

/** POST /api/detect-car-number (multipart/form-data, field: file)
 * Best-effort AI read of the car number visible in a photo. Never blocks
 * or fails the actual upload flow — on any error or missing config this
 * just returns { number: null, matches: [] } and the uploader falls back
 * to picking the car manually.
 */
export async function POST(request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ number: null, matches: [], note: "detection_disabled" });
  }

  let form;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const file = form.get("file");
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "no_file" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "too_large" }, { status: 413 });
  }

  const mediaType = file.type && file.type.startsWith("image/") ? file.type : "image/jpeg";
  const buffer = Buffer.from(await file.arrayBuffer());
  const base64 = buffer.toString("base64");

  let aiResponse;
  try {
    aiResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 50,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
              { type: "text", text: PROMPT },
            ],
          },
        ],
      }),
    });
  } catch {
    return NextResponse.json({ number: null, matches: [], note: "request_failed" });
  }

  if (!aiResponse.ok) {
    return NextResponse.json({ number: null, matches: [], note: "ai_error" });
  }

  const data = await aiResponse.json().catch(() => null);
  const textBlock = data?.content?.find((b) => b.type === "text");
  const detected = extractNumber(textBlock?.text || "");
  const matches = findCarMatches(detected).map((c) => ({
    id: c.id,
    numberDisplay: c.numberDisplay,
    line: c.line,
    series: c.series,
  }));

  return NextResponse.json({ number: detected, matches });
}
