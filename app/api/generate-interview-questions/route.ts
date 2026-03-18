import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  const { description, language } = await req.json();
  if (!description?.trim()) return NextResponse.json({ error: "Description required" }, { status: 400 });

  const langNames: Record<string, string> = { de: "German" };
  const practiceLang = language && language !== "en" ? (langNames[language] ?? language) : "English";

  const res = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 600,
    messages: [{
      role: "user",
      content: `Generate 10 interview questions for the following role/context: "${description.trim()}"

Mix behavioral, situational, and role-specific questions. Make them realistic and challenging but fair.
All questions must be in ${practiceLang}.

Return ONLY a valid JSON array of 10 strings — no markdown, no numbering, no explanation:
["question 1", "question 2", ..., "question 10"]`,
    }],
  });

  const raw = res.content[0].type === "text" ? res.content[0].text : "[]";
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    const questions = JSON.parse(cleaned);
    if (!Array.isArray(questions) || questions.length === 0) throw new Error();
    return NextResponse.json({ questions: questions.slice(0, 10) });
  } catch {
    return NextResponse.json({ error: "Failed to generate questions" }, { status: 500 });
  }
}
