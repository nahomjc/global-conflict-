import { NextResponse } from "next/server";
import { fetchTrustedConflictNews, type NewsItem } from "@/lib/news";

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
  "attack",
  "attacks",
  "raid",
  "raids",
  "bombing",
  "bombings",
  "offensive",
  "retaliation",
  "hostilities",
  "clash",
  "clashes",
  "battlefield",
  "gaza",
  "israel",
  "palestine",
  "ukraine",
  "russia",
  "iran",
  "syria",
  "lebanon",
  "yemen",
  "sudan",
];

const CONFLICT_COUNTRIES = [
  "israel",
  "palestine",
  "gaza",
  "ukraine",
  "russia",
  "iran",
  "syria",
  "lebanon",
  "yemen",
  "sudan",
  "myanmar",
  "iraq",
  "afghanistan",
  "libya",
];

const CONFLICT_INTENT_TERMS = [
  "attack",
  "attacked",
  "attacking",
  "strike",
  "struck",
  "strikes",
  "bomb",
  "bombed",
  "raid",
  "raids",
  "war",
  "conflict",
  "military",
  "ceasefire",
  "frontline",
  "happened",
  "today",
  "latest",
  "now",
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

function isGreetingQuestion(question: string) {
  const normalized = normalize(question)
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .trim();
  return [
    "hi",
    "hello",
    "hey",
    "yo",
    "good morning",
    "good afternoon",
    "good evening",
  ].includes(normalized);
}

function isConflictQuestion(question: string) {
  const normalized = normalize(question);
  if (CONFLICT_KEYWORDS.some((keyword) => normalized.includes(keyword))) {
    return true;
  }

  const hasCountry = CONFLICT_COUNTRIES.some((country) =>
    normalized.includes(country),
  );
  const hasConflictIntent = CONFLICT_INTENT_TERMS.some((term) =>
    normalized.includes(term),
  );
  return hasCountry && hasConflictIntent;
}

function extractCountryHint(question: string) {
  const normalized = normalize(question);
  const match = CONFLICT_COUNTRIES.find((country) =>
    normalized.includes(country),
  );
  return match ? match[0].toUpperCase() + match.slice(1) : undefined;
}

function wantsFreshWindow(question: string) {
  const normalized = normalize(question);
  return (
    normalized.includes("today") ||
    normalized.includes("latest") ||
    normalized.includes("right now") ||
    normalized.includes("now")
  );
}

function formatEvidence(items: NewsItem[]) {
  if (items.length === 0) {
    return "No trusted conflict headlines were found in the selected window.";
  }

  return items
    .slice(0, 8)
    .map((item, index) => {
      const date = item.publishedAt
        ? new Date(item.publishedAt).toLocaleString("en-US", {
            month: "short",
            day: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })
        : "Unknown time";
      return `${index + 1}. [${item.publisher}] ${item.headline} (${date})`;
    })
    .join("\n");
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
  evidenceItems: NewsItem[],
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const evidenceText = formatEvidence(evidenceItems);

  if (!apiKey) {
    return [
      "Conflict brief:",
      `Question: ${question}`,
      "Model connection unavailable. Reporting based on trusted conflict resources currently fetched:",
      evidenceText,
      "Assessment: If no matching headline explicitly confirms the claim, treat it as not confirmed yet.",
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
            "You are a professional conflict-intelligence assistant. Only answer conflict/war questions. Base your answer strictly on provided trusted headlines. Do not fabricate events. If evidence is insufficient, clearly say 'not confirmed by trusted sources yet'. Keep answer concise and structured. Include exactly one Bible verse connection at the end.",
        },
        {
          role: "user",
          content: `Question: ${question}

Trusted resources:
${evidenceText}

Output format:
1) Direct answer (1-2 sentences)
2) Evidence summary (2-4 bullets from trusted resources)
3) Confidence: High/Medium/Low
4) Bible verse connection: ${verse.reference} - ${verse.text}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    return [
      "Conflict brief:",
      "AI model request failed. Reporting from trusted resources:",
      evidenceText,
      `Bible verse connection: ${verse.reference} - "${verse.text}"`,
    ].join("\n\n");
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = payload.choices?.[0]?.message?.content?.trim();
  if (!content) {
    return [
      "Conflict brief:",
      "No model text was returned. Reporting from trusted resources:",
      evidenceText,
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

  if (isGreetingQuestion(question)) {
    return NextResponse.json({
      ok: true,
      answer:
        "Hi, I am here to assist you.\n\nI provide updates and analysis only on conflicts and wars (airstrikes, drones, missile attacks, military operations).\n\nYou can ask something like: \"Did Israel launch an airstrike today?\"",
      scopeNotice: SCOPE_NOTICE,
    });
  }

  if (!isConflictQuestion(question)) {
    const verse = VERSES.season;
    return NextResponse.json({
      ok: true,
      answer: `${SCOPE_NOTICE}\n\nPlease ask about conflicts or wars only (example: "Did Israel launch an airstrike today?").\n\nBible verse connection: ${verse.reference} - "${verse.text}"`,
      scopeNotice: SCOPE_NOTICE,
      verse,
    });
  }

  const verse = pickVerse(question);
  const countryHint = extractCountryHint(question);
  const evidenceItems = await fetchTrustedConflictNews({
    country: countryHint,
    limit: wantsFreshWindow(question) ? 18 : 10,
    includeUntrusted: false,
  });
  const answer = await generateConflictAnswer(question, verse, evidenceItems);

  return NextResponse.json({
    ok: true,
    answer,
    scopeNotice: SCOPE_NOTICE,
    verse,
  });
}
