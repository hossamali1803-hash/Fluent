import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  const { description, language } = await req.json();
  if (!description?.trim()) {
    return NextResponse.json({ error: "Description required" }, { status: 400 });
  }

  const langNames: Record<string, string> = { de: "German" };
  const practiceLang = language && language !== "en" ? (langNames[language] ?? language) : "English";
  const langInstruction =
    practiceLang !== "English"
      ? `All openers and the systemPrompt must be in ${practiceLang}. The persona always speaks ${practiceLang} only.`
      : "";

  const res = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 600,
    messages: [
      {
        role: "user",
        content: `A language learner wants to practice spoken ${practiceLang}. They described their scenario:

"${description.trim()}"

Create a realistic conversation practice scenario. Identify who the OTHER PERSON is (e.g. if the learner is talking to a manager, the other person is the manager). The AI will PLAY that other person.

${langInstruction}

Rules:
- The persona speaks FIRST (scene is already in progress — no greetings about time/day)
- Openers must be role-specific and natural, max 12 words each
- systemPrompt tells the AI to stay strictly in character, ask one question per turn, max 35 words per response, wrap up after 8 turns

Return ONLY valid JSON — no markdown, no explanation:
{
  "name": "<2-4 word scenario name>",
  "persona": "<first name of the other person>",
  "personaRole": "<their exact role or relationship to the learner>",
  "openers": ["<opener 1>", "<opener 2>", "<opener 3>", "<opener 4>", "<opener 5>"],
  "systemPrompt": "You are [persona], a [personaRole]. [One sentence of situation context]. Ask one question per turn, stay in character, under 35 words per response, wrap up naturally after 8 turns."
}`,
      },
    ],
  });

  const raw = res.content[0].type === "text" ? res.content[0].text : "{}";
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

  try {
    const scenario = JSON.parse(cleaned);
    if (!scenario.name || !scenario.persona || !scenario.openers?.length) {
      return NextResponse.json({ error: "Invalid scenario" }, { status: 422 });
    }
    return NextResponse.json({
      ...scenario,
      id: `custom-${Date.now()}`,
      category: "custom",
      tier: "free",
    });
  } catch {
    return NextResponse.json({ error: "Failed to parse scenario" }, { status: 500 });
  }
}
