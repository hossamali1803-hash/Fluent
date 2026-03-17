import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { TEMPLATES } from "@/lib/templates";
import { textToSpeechBase64 } from "@/lib/tts";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  const { templateId, openers: passedOpeners, language } = await req.json();
  const template = TEMPLATES.find((t) => t.id === templateId);

  const openers = passedOpeners ?? template?.openers ?? [];
  const englishOpener = openers[Math.floor(Math.random() * openers.length)] ?? "";

  let text = englishOpener;

  if (language && language !== "en" && englishOpener) {
    const langNames: Record<string, string> = { de: "German" };
    const langName = langNames[language] ?? language;
    try {
      const res = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 80,
        messages: [{
          role: "user",
          content: `Translate this conversation opener to natural spoken ${langName}. Return only the translated text, nothing else:\n\n"${englishOpener}"`,
        }],
      });
      text = res.content[0].type === "text" ? res.content[0].text.trim().replace(/^"|"$/g, "") : englishOpener;
    } catch {
      text = englishOpener;
    }
  }

  let audioBase64 = "";
  try { audioBase64 = await textToSpeechBase64(text); } catch (e) {
    console.error("[start] TTS error", e);
  }

  return NextResponse.json({ text, audioBase64, turnNumber: 0 });
}
