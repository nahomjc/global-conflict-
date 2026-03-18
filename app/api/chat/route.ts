import { NextResponse } from "next/server";

export const runtime = "nodejs";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL ?? "openai/gpt-4o-mini";

const SCOPE_NOTICE =
  "I only answer questions about conflicts and wars (including airstrikes, drones, missiles, and military operations).";

const CONFLICT_KEYWORDS = [
  "war",
  "wars",
  "conflict",
  "conflicts",
  "battle",
  "battles",
  "military",
  "army",
  "airstrike",
  "air strike",
  "strike",
  "strikes",
  "drone",
  "drones",
  "missile",
  "missiles",
  "shelling",
  "artillery",
  "invasion",
  "ceasefire",
  "frontline",
  "combat",
  "insurgency",
];

type BibleVerse = {
  reference: string;
  text: string;
};

const VERSES: Record<string, BibleVerse> = {
  peace: {
    reference: "Psalm 46:9",
    text: "He makes wars cease to the ends of the earth. He breaks the bow and shatters the spear.",
  },
  warning: {
    reference: "Matthew 24:6-7",
    text: "You will hear of wars and rumors of wars... Nation will rise against nation, and kingdom against kingdom.",
  },
  season: {
    reference: "Ecclesiastes 3:8",
    text: "A time to love, and a time to hate; a time for war, and a time for peace.",
  },
  trust: {
    reference: "Proverbs 21:31",
    text: "The horse is made ready for the day of battle, but victory rests with the Lord.",
  },
};

function normalize(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function isConflictQuestion(question: string) {
  const normalized = normalize(question);
  return CONFLICT_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

function pickVerse(question: string): BibleVerse {
  const normalized = normalize(question);
  if (
    normalized.includes("peace") ||
    normalized.includes("ceasefire") ||
    normalized.includes("end war")
  ) {
    return VERSES.peace;
  }
  if (
    normalized.includes("rumors of wars") ||
    normalized.includes("prophecy") ||
    normalized.includes("end times")
  ) {
    return VERSES.warning;
  }
  if (
    normalized.includes("airstrike") ||
    normalized.includes("drone") ||
    normalized.includes("missile") ||
    normalized.includes("battle")
  ) {
    return VERSES.trust;
  }
  return VERSES.season;
}

async function generateConflictAnswer(
  question: string,
  verse: BibleVerse,
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return [
      "Conflict-only response:",
      `Your question: "${question}"`,
      "I can discuss conflict dynamics, military patterns, and war-related risk context. No non-conflict topics are supported.",
      `Bible verse connection: ${verse.reference} - "${verse.text}"`,
    ].join("\n\n");
  }

  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.OPENROUTER_REFERER ?? "http://localhost:3000",
      "X-Title": "Global Conflict Command Dashboard Chat",
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "You are a conflict and war assistant. Only answer conflict/war questions. If user asks anything else, refuse and restate scope. Keep answers concise, factual, and avoid unrelated topics. Always include exactly one Bible verse reference connected to the conflict context in the answer.",
        },
        {
          role: "user",
          content: `Question: ${question}\n\nRequired verse: ${verse.reference} - ${verse.text}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    return [
      "Conflict-only response:",
      "I could not reach the AI model right now, but I can still keep scope restricted to conflicts and wars.",
      `Bible verse connection: ${verse.reference} - "${verse.text}"`,
    ].join("\n\n");
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = payload.choices?.[0]?.message?.content?.trim();
  if (!content) {
    return [
      "Conflict-only response:",
      "I could not generate a detailed answer at the moment.",
      `Bible verse connection: ${verse.reference} - "${verse.text}"`,
    ].join("\n\n");
  }

  if (!content.includes(verse.reference)) {
    return `${content}\n\nBible verse connection: ${verse.reference} - "${verse.text}"`;
  }

  return content;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    question?: unknown;
  };
  const question =
    typeof body.question === "string" ? body.question.trim() : "";

  if (!question) {
    return NextResponse.json(
      {
        ok: false,
        answer:
          "Please ask a conflict-related question (for example: airstrikes, drones, missile attacks, wars, or ceasefires).",
        scopeNotice: SCOPE_NOTICE,
      },
      { status: 400 },
    );
  }

  if (!isConflictQuestion(question)) {
    const verse = VERSES.season;
    return NextResponse.json({
      ok: true,
      answer: `${SCOPE_NOTICE}\n\nPlease ask about conflicts or wars only.\n\nBible verse connection: ${verse.reference} - "${verse.text}"`,
      scopeNotice: SCOPE_NOTICE,
      verse,
    });
  }

  const verse = pickVerse(question);
  const answer = await generateConflictAnswer(question, verse);

  return NextResponse.json({
    ok: true,
    answer,
    scopeNotice: SCOPE_NOTICE,
    verse,
  });
}
