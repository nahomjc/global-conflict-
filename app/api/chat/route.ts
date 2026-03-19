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

const VERSE_POOLS: Record<string, BibleVerse[]> = {
  warning: [
    {
      reference: "Matthew 24:6-7",
      text: "You will hear of wars and rumors of wars... Nation will rise against nation, and kingdom against kingdom.",
    },
    {
      reference: "Mark 13:7-8",
      text: "When you hear of wars and rumors of wars, do not be alarmed... Nation will rise against nation.",
    },
    {
      reference: "Luke 21:9-10",
      text: "When you hear of wars and uprisings, do not be frightened... Nation will rise against nation.",
    },
  ],
  battle: [
    {
      reference: "Proverbs 21:31",
      text: "The horse is made ready for the day of battle, but victory rests with the Lord.",
    },
    {
      reference: "Joel 3:9-10",
      text: "Prepare for war! Rouse the warriors! ... Let the weakling say, 'I am strong.'",
    },
    {
      reference: "Psalm 144:1",
      text: "Praise be to the Lord my Rock, who trains my hands for war, my fingers for battle.",
    },
  ],
  peace: [
    {
      reference: "Psalm 46:9",
      text: "He makes wars cease to the ends of the earth. He breaks the bow and shatters the spear.",
    },
    {
      reference: "Isaiah 2:4",
      text: "They will beat their swords into plowshares... Nation will not take up sword against nation.",
    },
    {
      reference: "Micah 4:3",
      text: "They will beat their swords into plowshares and their spears into pruning hooks.",
    },
  ],
  nations: [
    {
      reference: "2 Chronicles 20:6",
      text: "Power and might are in your hand, and no one can withstand you.",
    },
    {
      reference: "Jeremiah 51:20",
      text: "You are my war club, my weapon for battle - with you I shatter nations.",
    },
    {
      reference: "Ecclesiastes 3:8",
      text: "A time to love, and a time to hate; a time for war, and a time for peace.",
    },
  ],
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

function hashText(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function selectVersePool(question: string) {
  const normalized = normalize(question);
  if (
    normalized.includes("peace") ||
    normalized.includes("ceasefire") ||
    normalized.includes("end war")
  ) {
    return VERSE_POOLS.peace;
  }
  if (
    normalized.includes("rumors of wars") ||
    normalized.includes("prophecy") ||
    normalized.includes("end times")
  ) {
    return VERSE_POOLS.warning;
  }
  if (
    normalized.includes("airstrike") ||
    normalized.includes("drone") ||
    normalized.includes("missile") ||
    normalized.includes("battle")
  ) {
    return VERSE_POOLS.battle;
  }
  return VERSE_POOLS.nations;
}

function pickVerses(question: string): BibleVerse[] {
  const pool = selectVersePool(question);
  const dayKey = new Date().toISOString().slice(0, 10);
  const seed = hashText(`${normalize(question)}|${dayKey}`);
  const first = pool[seed % pool.length];
  const second = pool[(seed + 1) % pool.length];

  if (first.reference === second.reference) {
    const fallback = VERSE_POOLS.warning[seed % VERSE_POOLS.warning.length];
    return [first, fallback];
  }
  return [first, second];
}

function formatVerseConnections(verses: BibleVerse[]) {
  return verses
    .map((verse) => `- ${verse.reference}: "${verse.text}"`)
    .join("\n");
}

function missingVerseReferences(text: string, verses: BibleVerse[]) {
  return verses.filter((verse) => !text.includes(verse.reference));
}

async function generateConflictAnswer(
  question: string,
  verses: BibleVerse[],
  evidenceItems: NewsItem[],
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const evidenceText = formatEvidence(evidenceItems);
  const verseBlock = formatVerseConnections(verses);

  if (!apiKey) {
    return [
      "Conflict brief:",
      `Question: ${question}`,
      "Model connection unavailable. Reporting based on trusted conflict resources currently fetched:",
      evidenceText,
      "Assessment: If no matching headline explicitly confirms the claim, treat it as not confirmed yet.",
      "Bible verse connections:",
      verseBlock,
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
            "You are a professional conflict-intelligence assistant. Only answer conflict/war questions. Base your answer strictly on provided trusted headlines. Do not fabricate events. If evidence is insufficient, clearly say 'not confirmed by trusted sources yet'. Keep answer concise and structured. Include Bible verse connections at the end using the provided verses.",
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
4) Bible verse connections:
${verseBlock}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    return [
      "Conflict brief:",
      "AI model request failed. Reporting from trusted resources:",
      evidenceText,
      "Bible verse connections:",
      verseBlock,
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
      "Bible verse connections:",
      verseBlock,
    ].join("\n\n");
  }

  const missingVerses = missingVerseReferences(content, verses);
  if (missingVerses.length > 0) {
    return `${content}\n\nBible verse connections:\n${formatVerseConnections(missingVerses)}`;
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
    const verses = pickVerses(question);
    return NextResponse.json({
      ok: true,
      answer: `${SCOPE_NOTICE}\n\nPlease ask about conflicts or wars only (example: "Did Israel launch an airstrike today?").\n\nBible verse connections:\n${formatVerseConnections(verses)}`,
      scopeNotice: SCOPE_NOTICE,
      verses,
    });
  }

  const verses = pickVerses(question);
  const countryHint = extractCountryHint(question);
  const evidenceItems = await fetchTrustedConflictNews({
    country: countryHint,
    limit: wantsFreshWindow(question) ? 18 : 10,
    includeUntrusted: false,
  });
  const answer = await generateConflictAnswer(question, verses, evidenceItems);

  return NextResponse.json({
    ok: true,
    answer,
    scopeNotice: SCOPE_NOTICE,
    verses,
  });
}
