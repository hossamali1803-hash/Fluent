import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { TEMPLATES } from "@/lib/templates";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  const { history, templateId, templateName: passedName, durationSeconds, language } = await req.json();
  const template = TEMPLATES.find((t) => t.id === templateId) ?? TEMPLATES[0];
  const scenarioName = passedName ?? template.name;

  const userMessages = history.filter((m: { role: string }) => m.role === "user").map((m: { content: string }) => m.content).join("\n");

  const langNames: Record<string, string> = { de: "German" };
  const practiceLang = language && language !== "en" ? (langNames[language] ?? language) : "English";
  const analysisPrompt = `You are an expert ${practiceLang} speaking coach analyzing a conversation session for a non-native ${practiceLang} speaker. Write ALL text fields (why, cue, title, feedback) in English.

Scenario: "${scenarioName}"
Duration: ${Math.round(durationSeconds / 60)} minutes
Full conversation (user turns only):
${userMessages}

Analyze carefully and return ONLY valid JSON (no markdown, no code fences) with this exact shape:
{
  "scores": {
    "clarity": <0-100, how clear and easy to understand>,
    "vocabulary": <0-100, range and accuracy of word choice>,
    "confidence": <0-100, assertiveness, no excessive hedging>,
    "fluency": <0-100, natural flow, sentence length, not choppy>,
    "engagement": <0-100, responsiveness, building on conversation>
  },
  "momentGood": {
    "quote": "<5 words max from what they said>",
    "reason": "<3-5 words why it worked, e.g. 'Clear and direct'>"
  },
  "momentBad": {
    "quote": "<5 words max from what they said>",
    "reason": "<3-5 words what went wrong, e.g. 'Too many fillers'>"
  },
  "actions": [
    {
      "title": "<2-4 word skill name>",
      "skillType": "<one of: vocabulary | grammar | structure | fluency>",
      "targetWords": ["<word or short phrase to use>", "<another>", "<another>"],
      "why": "<max 8 words: what they did that needs fixing>",
      "cue": "<one clear sentence: how to speak differently next time>"
    },
    {
      "title": "<2-4 word skill name>",
      "skillType": "<vocabulary | grammar | structure | fluency>",
      "targetWords": ["<word or phrase>", "<another>", "<another>"],
      "why": "<max 8 words>",
      "cue": "<one clear sentence>"
    },
    {
      "title": "<2-4 word skill name>",
      "skillType": "<vocabulary | grammar | structure | fluency>",
      "targetWords": ["<word or phrase>", "<another>", "<another>"],
      "why": "<max 8 words>",
      "cue": "<one clear sentence>"
    }
  ],
  "xpEarned": <60-200 based on effort and quality>,
  "summary": "<one short sentence: the single most important thing to work on>"
}

skillType guide:
- vocabulary: they used basic/repetitive words — targetWords = better alternatives to use
- grammar: recurring grammar errors — targetWords = correct forms/patterns (e.g. "I went", "I should have")
- structure: short/choppy sentences — targetWords = sentence starters/connectors (e.g. "Not only... but also", "What I find is")
- fluency: fillers, hesitation, incomplete thoughts — targetWords = phrases that keep speech flowing (e.g. "Let me think...", "What I mean is")

Be specific. Be brief. No long sentences.`;

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1200,
    messages: [{ role: "user", content: analysisPrompt }],
  });

  const raw = response.content[0].type === "text" ? response.content[0].text : "{}";
  // Strip markdown code fences if present
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  let result;
  try {
    result = JSON.parse(cleaned);
  } catch {
    console.error("[end] JSON parse failed. Raw:", raw);
    throw new Error("Analysis parse failed");
  }

  return NextResponse.json(result);
}
