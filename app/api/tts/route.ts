import { NextRequest, NextResponse } from "next/server";
import { textToSpeechBase64 } from "@/lib/tts";

export async function POST(req: NextRequest) {
  const { text } = await req.json();
  if (!text?.trim()) return NextResponse.json({ audioBase64: "" });
  try {
    const audioBase64 = await textToSpeechBase64(text.trim());
    return NextResponse.json({ audioBase64 });
  } catch {
    return NextResponse.json({ audioBase64: "" });
  }
}
