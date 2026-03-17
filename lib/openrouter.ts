import { randomUUID } from "node:crypto";
import type { ConflictEvent } from "@/lib/conflict-types";
import type { NewsItem } from "@/lib/news";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL ?? "openai/gpt-4o-mini";

function normalize(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

const GENERIC_ACTORS = new Set([
  "unknown",
  "various",
  "multiple",
  "middle east",
  "region",
  "global",
  "n/a",
  "na",
]);

function isSpecificActor(value: string) {
  const normalized = normalize(value);
  if (!normalized) {
    return false;
  }
  if (GENERIC_ACTORS.has(normalized)) {
    return false;
  }
  // Reject broad/non-country composites such as "various forces / middle east".
  if (
    normalized.includes("various ") ||
    normalized.includes("multiple ") ||
    normalized.includes(" region") ||
    normalized.includes("middle east")
  ) {
    return false;
  }
  return true;
}

function resolveTrustedTimestamp(newsItem: NewsItem) {
  const ms = Date.parse(newsItem.publishedAt);
  if (!Number.isNaN(ms)) {
    return new Date(ms).toISOString();
  }
  return new Date().toISOString();
}

function sanitizeEvent(partial: Partial<ConflictEvent>, newsItem: NewsItem): ConflictEvent | null {
  const required = [
    partial.attacker,
    partial.target,
    partial.startLat,
    partial.startLng,
    partial.endLat,
    partial.endLng,
    partial.attackType,
    partial.description,
    partial.evidenceQuote,
  ];

  if (required.some((field) => field === undefined || field === null)) {
    return null;
  }

  if (
    partial.attackType !== "missile" &&
    partial.attackType !== "drone" &&
    partial.attackType !== "airstrike"
  ) {
    return null;
  }

  const numericValues = [partial.startLat, partial.startLng, partial.endLat, partial.endLng];
  if (numericValues.some((value) => Number.isNaN(Number(value)))) {
    return null;
  }

  const headline = normalize(newsItem.headline);
  const quote = normalize(String(partial.evidenceQuote));
  const attackerRaw = String(partial.attacker);
  const targetRaw = String(partial.target);
  const attacker = normalize(attackerRaw);
  const target = normalize(targetRaw);

  // Reject model output unless it can cite exact evidence from a trusted headline.
  if (!quote || !headline.includes(quote)) {
    return null;
  }

  // Force at least one actor to appear in the same trusted headline text.
  if (!headline.includes(attacker) && !headline.includes(target)) {
    return null;
  }

  // Reject generic region-level or unknown actor/target outputs.
  if (!isSpecificActor(attackerRaw) || !isSpecificActor(targetRaw)) {
    return null;
  }

  // Disallow self-targeted events produced by ambiguous extraction.
  if (attacker === target) {
    return null;
  }

  const sourcePublishedAt = resolveTrustedTimestamp(newsItem);

  return {
    id: randomUUID(),
    attacker: String(partial.attacker),
    target: String(partial.target),
    startLat: Number(partial.startLat),
    startLng: Number(partial.startLng),
    endLat: Number(partial.endLat),
    endLng: Number(partial.endLng),
    attackType: partial.attackType,
    // "timestamp" is ingest time for live stream ordering and "today" stats.
    timestamp: new Date().toISOString(),
    description: String(partial.description),
    source: "openrouter",
    verification: "trusted",
    sourcePublisher: newsItem.publisher,
    sourceUrl: newsItem.url,
    sourceHeadline: newsItem.headline,
    evidenceQuote: String(partial.evidenceQuote),
    sourcePublishedAt,
  };
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export async function extractConflictEventsFromNews(
  items: NewsItem[],
  focusCountry?: string,
  sinceYear?: number,
): Promise<ConflictEvent[]> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey || items.length === 0) {
    return [];
  }

  const focusInstruction = focusCountry
    ? `- Prioritize events where attacker or target is "${focusCountry}" (including common aliases/abbreviations, e.g., USA/US/United States). If none exist, return an empty events array.`
    : "";
  const sinceInstruction =
    typeof sinceYear === "number" && Number.isFinite(sinceYear)
      ? `- Include only events dated ${sinceYear} or later; skip older incidents.`
      : "";

  const prompt = `
Extract conflict events from these trusted source headlines.
Return only valid JSON, no markdown, with this exact shape:
{
  "events": [
    {
      "sourceIndex": number,
      "attacker": "country name",
      "target": "country name",
      "startLat": number,
      "startLng": number,
      "endLat": number,
      "endLng": number,
      "attackType": "missile" | "drone" | "airstrike",
      "description": "short explanation",
      "evidenceQuote": "exact short quote copied from the source headline"
    }
  ]
}

Rules:
- Use only the provided headlines; do not invent events.
- Keep only events with direct attack language.
- Use best-effort geocoordinates for attacker and target countries.
- Keep description under 120 chars.
- sourceIndex must match the numbered list below.
- evidenceQuote must be exact text from that headline.
${focusInstruction}
${sinceInstruction}

TRUSTED HEADLINES:
${items
  .map(
    (item, idx) =>
      `${idx + 1}. [${item.publisher}] ${item.headline} | URL: ${item.url}`,
  )
  .join("\n")}
  `.trim();

  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.OPENROUTER_REFERER ?? "http://localhost:3000",
      "X-Title": "Global Conflict Command Dashboard",
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "You are an OSINT analyst that outputs strict JSON.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    return [];
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    return [];
  }

  const parsed = safeJsonParse(content) as {
    events?: Array<Partial<ConflictEvent> & { sourceIndex?: number }>;
  } | null;
  if (!parsed?.events || !Array.isArray(parsed.events)) {
    return [];
  }

  return parsed.events
    .map((candidate) => {
      const sourceIndex = Number(candidate.sourceIndex);
      if (!Number.isInteger(sourceIndex) || sourceIndex < 1 || sourceIndex > items.length) {
        return null;
      }
      const newsItem = items[sourceIndex - 1];
      return sanitizeEvent(candidate, newsItem);
    })
    .filter((event): event is ConflictEvent => Boolean(event));
}
