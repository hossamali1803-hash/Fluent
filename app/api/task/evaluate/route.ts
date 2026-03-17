import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  const { taskTitle, why, cue, targetWords, skillType, history, language } = await req.json();

  const userTurns = history
    .filter((m: { role: string }) => m.role === "user")
    .map((m: { content: string }) => m.content)
    .join("\n");

  const targetLine = targetWords?.length
    ? `Target words/phrases they were supposed to use: ${targetWords.map((w: string) => `"${w}"`).join(", ")}.`
    : "";

  const skillGuide = skillType === "vocabulary"
    ? "Did they use the target words or similar-level vocabulary?"
    : skillType === "grammar"
    ? "Did they use the correct grammatical forms shown in target words?"
    : skillType === "structure"
    ? "Did they use more complex sentence structures or the target patterns?"
    : skillType === "fluency"
    ? "Did their speech flow naturally without excessive hesitation or repetition?"
    : "Did they demonstrate the skill?";

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 300,
    messages: [{
      role: "user",
      content: `You are a ${language === "de" ? "German" : "English"} speaking coach assessing a student's performance in a short practice conversation. Write all feedback in English.

Skill being practiced: "${taskTitle}" (${skillType ?? "general"})
What they were coached to do: "${cue}"
${targetLine}

Student's responses:
${userTurns}

Key question: ${skillGuide}

Rate 1–5 stars:
- 5 stars: clearly used the target words/patterns naturally
- 4 stars: used them mostly well, minor gaps
- 3 stars: used one or partially, not consistent
- 2 stars: tried but didn't use any target words/patterns correctly
- 1 star: no evidence of the skill at all

Return ONLY valid JSON:
{
  "stars": <1-5>,
  "feedback": "<one short sentence, max 12 words, specific to what they said>",
  "toFiveStars": "<one short sentence, max 12 words, on what to change>"
}`
    }],
  });

  const raw = response.content[0].type === "text" ? response.content[0].text : "{}";
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    return NextResponse.json(JSON.parse(cleaned));
  } catch {
    return NextResponse.json({ stars: 3, feedback: "Good effort on the practice.", toFiveStars: "Try to more explicitly demonstrate the skill next time." });
  }
}
