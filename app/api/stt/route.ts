import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return NextResponse.json({ text: "" });

  const formData = await req.formData();
  const audio = formData.get("audio") as Blob;
  if (!audio) return NextResponse.json({ text: "" });
  const language = (formData.get("language") as string) || "en";

  const ext = audio.type.includes("mp4") || audio.type.includes("m4a") ? "audio.mp4" : "audio.webm";
  const form = new FormData();
  form.append("file", audio, ext);
  form.append("model", "whisper-large-v3-turbo");
  form.append("language", language);
  form.append("response_format", "json");

  const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!res.ok) return NextResponse.json({ text: "" });
  const data = await res.json();
  return NextResponse.json({ text: data.text?.trim() ?? "" });
}
