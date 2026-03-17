import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { THEMES } from "@/lib/templates";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const THEME_SITUATIONS: Record<string, string> = {
  daily:        "gym with trainer, doctor appointment, flatmate conversation, neighbour in hallway, parents evening",
  professional: "performance review, giving feedback, resolving team conflict, onboarding new hire, asking for time off",
  social:       "chatting on a long flight, cooking class stranger, museum conversation, conference networking, language exchange meetup",
  travel:       "hotel check-in, taxi ride, train ticket counter, customs officer, lost luggage desk",
  services:     "phone repair counter, haircut at salon, bank advisor, returning faulty product at shop",
};

export async function POST(req: NextRequest) {
  const { category, existingNames, language } = await req.json();
  const theme = THEMES[category];
  if (!theme) return NextResponse.json({ error: "Unknown category" }, { status: 400 });

  const situations = THEME_SITUATIONS[category] ?? "";
  const langNames: Record<string, string> = { de: "German" };
  const practiceLang = language && language !== "en" ? (langNames[language] ?? language) : "English";
  const langInstruction = `All openers and the systemPrompt must be in ${practiceLang}. The persona always responds in ${practiceLang} only and never translates or switches languages.`;

  const res = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 500,
    messages: [{
      role: "user",
      content: `Create a spoken ${practiceLang} practice scenario. Theme: "${theme.label}". Pick from: ${situations}. Skip these: ${existingNames.join(", ")}. ${langInstruction}

The persona speaks FIRST. Scene is already happening — no references to weekend, days, plans, or time.

Return ONLY valid JSON:
{
  "name": "<2-4 word name>",
  "persona": "<first name>",
  "personaRole": "<exact role>",
  "openers": ["<what persona says first — role-specific, max 12 words>", "<same, different wording>", "<same>", "<same>", "<same>"],
  "systemPrompt": "You are [persona], a [role]. [Situation]. Ask one question per turn, stay in character, under 35 words per response, wrap up after 8 turns."
}`
    }]
  });

  const raw = res.content[0].type === "text" ? res.content[0].text : "{}";
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

  try {
    const scenario = JSON.parse(cleaned);
    const forbidden = practiceLang === "German"
      ? /wochenende|montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag|pläne|feierabend|später|heute abend/i
      : /weekend|week|monday|tuesday|wednesday|thursday|friday|saturday|sunday|commute|traffic|plans|after work|tonight|later/i;
    scenario.openers = (scenario.openers as string[]).filter((o: string) => !forbidden.test(o));
    if (scenario.openers.length < 2) return NextResponse.json({ error: "Off-topic" }, { status: 422 });
    return NextResponse.json({ ...scenario, id: `gen-${category}-${Date.now()}`, category });
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
