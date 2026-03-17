import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { TEMPLATES } from "@/lib/templates";
import { textToSpeechBase64 } from "@/lib/tts";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  const { templateId, openers: passedOpeners, language, userName } = await req.json();
  const template = TEMPLATES.find((t) => t.id === templateId);

  const openers = passedOpeners ?? template?.openers ?? [];
  const englishOpener = openers[Math.floor(Math.random() * openers.length)] ?? "";

  let text = englishOpener;

  const needsTranslation = language && language !== "en";
  const needsName = userName && englishOpener && !englishOpener.toLowerCase().includes(userName.toLowerCase());

  if (needsTranslation || needsName) {
    const langNames: Record<string, string> = { de: "German" };
    const langName = needsTranslation ? (langNames[language] ?? language) : "English";
    const nameInstruction = needsName
      ? ` Naturally work in the name "${userName}" if it fits (e.g. "Hey ${userName}," or similar). If it doesn't fit naturally, omit it.`
      : "";
    try {
      const res = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 80,
        messages: [{
          role: "user",
          content: `Adapt this conversation opener to natural spoken ${langName}.${nameInstruction} Return only the final text, nothing else:\n\n"${englishOpener}"`,
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
