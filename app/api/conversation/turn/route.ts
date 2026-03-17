import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { TEMPLATES } from "@/lib/templates";
import { textToSpeechBase64 } from "@/lib/tts";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  const { userMessage, history, templateId, turnNumber, systemPrompt: passedSystemPrompt, language } = await req.json();
  const template = TEMPLATES.find((t) => t.id === templateId);

  const messages = [
    ...(history ?? []),
    { role: "user" as const, content: userMessage },
  ];

  const basePrompt = passedSystemPrompt ?? template?.systemPrompt ?? "";
  const langNames: Record<string, string> = { en: "English", de: "German" };
  const langName = langNames[language ?? "en"] ?? "English";
  const langInstruction = `\n\nLANGUAGE RULE: You must respond ONLY in ${langName}. Never translate, never switch languages, never repeat the user's words in another language. Regardless of what language the user writes in, your reply is always ${langName} only.`;
  const systemPrompt = `${basePrompt}${langInstruction}

STRICT RULE: Every question you ask must be directly about the current situation and scenario. Never ask about weekend plans, week plans, what the student is doing later, or anything unrelated to this specific scenario. Stay 100% in character and in the moment.`;

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 150,
    system: systemPrompt,
    messages,
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";

  let audioBase64 = "";
  try {
    audioBase64 = await textToSpeechBase64(text);
  } catch (e) {
    console.error("[turn] TTS error", e);
  }

  return NextResponse.json({ text, audioBase64, turnNumber: turnNumber + 1 });
}
