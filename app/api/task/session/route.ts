import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { textToSpeechBase64 } from "@/lib/tts";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  const { history, taskTitle, why, cue, targetWords, turnNumber, language } = await req.json();

  const targetLine = targetWords?.length
    ? `Target words/phrases the student should use: ${targetWords.map((w: string) => `"${w}"`).join(", ")}.`
    : "";

  const langNames: Record<string, string> = { de: "German" };
  const practiceLang = language && language !== "en" ? (langNames[language] ?? language) : "English";
  const langInstruction = `\n- Respond ONLY in ${practiceLang}. Never translate, never switch languages, never repeat the user's words in another language. Always reply in ${practiceLang} regardless of what language the user uses.`;

  const systemPrompt = `You are a conversation partner for a spoken ${practiceLang} practice session.

The student is working on: "${taskTitle}"
Context: ${why}
${targetLine}

Rules:
- Speak naturally — like a real colleague, manager, or friend depending on the context.${langInstruction}
- Open with ONE direct spoken question that creates a natural opportunity for the student to use the target words/phrases. No setup, no labels, no markdown, no scene-setting.
- Keep every response under 25 words. Plain conversational ${practiceLang} only.
- Never use markdown, asterisks, headers, or labels like "Manager:" or "Scene:".
- Never mention the target words directly or give tips. Just create natural openings for them.
- If the student hasn't used any target words by their 2nd reply, steer the conversation to give them another opening.
- After the student's 3rd reply, give a short friendly closing line, then on a new line write exactly: [SESSION_COMPLETE]`;

  const messages = history ?? [];

  function clean(raw: string) {
    return raw
      .replace("[SESSION_COMPLETE]", "")
      .replace(/\*\*.*?\*\*:?\s*/g, "") // strip **labels**
      .replace(/^#+\s+.*/gm, "")        // strip # headings
      .replace(/\*+/g, "")              // strip stray asterisks
      .trim();
  }

  async function respond(msgs: typeof messages, tn: number, isDone = false) {
    const res = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 100,
      system: systemPrompt,
      messages: msgs,
    });
    const raw = res.content[0].type === "text" ? res.content[0].text : "";
    const done = isDone || raw.includes("[SESSION_COMPLETE]");
    const text = clean(raw);
    let audioBase64 = "";
    try { audioBase64 = await textToSpeechBase64(text); } catch {}
    return NextResponse.json({ text, audioBase64, done, turnNumber: tn });
  }

  if (!messages.length) {
    return respond([{ role: "user", content: "Begin." }], 0);
  }

  return respond(messages, turnNumber);
}
