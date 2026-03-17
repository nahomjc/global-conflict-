import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { eventStore } from "@/lib/event-store";
import type { ConflictEvent } from "@/lib/conflict-types";
import { fetchTrustedConflictNews } from "@/lib/news";
import { extractConflictEventsFromNews } from "@/lib/openrouter";

export const runtime = "nodejs";

function normalizeCountry(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const COUNTRY_ALIASES: Record<string, string[]> = {
  "united states": ["usa", "us", "u.s.", "u.s.a.", "united states of america", "america"],
  "united kingdom": ["uk", "u.k.", "great britain", "britain", "england"],
  "russia": ["russian federation"],
};

function canonicalCountry(value: string) {
  const normalized = normalizeCountry(value);
  if (!normalized) {
    return normalized;
  }
  for (const [canonical, aliases] of Object.entries(COUNTRY_ALIASES)) {
    if (normalized === canonical || aliases.some((alias) => normalizeCountry(alias) === normalized)) {
      return canonical;
    }
  }
  return normalized;
}

function countryMatches(left: string, right: string) {
  const a = canonicalCountry(left);
  const b = canonicalCountry(right);
  if (!a || !b) {
    return false;
  }
  if (a === b) {
    return true;
  }
  return (a.length > 4 && b.includes(a)) || (b.length > 4 && a.includes(b));
}

function countryTerms(country: string) {
  const canonical = canonicalCountry(country);
  const aliases = COUNTRY_ALIASES[canonical] ?? [];
  return [canonical, ...aliases.map((alias) => normalizeCountry(alias))].filter(
    Boolean,
  );
}

function headlineMentionsCountry(headline: string, country: string) {
  const normalizedHeadline = normalizeCountry(headline);
  return countryTerms(country).some((term) => normalizedHeadline.includes(term));
}

const ATTACK_HEADLINE_TERMS = [
  "missile",
  "drone",
  "airstrike",
  "air strike",
  "strike",
  "attack",
  "shelling",
  "artillery",
  "bombard",
  "raid",
  "clash",
  "clashes",
  "rockets",
  "rocket",
];

function isAttackHeadline(headline: string) {
  const normalized = normalizeCountry(headline);
  return ATTACK_HEADLINE_TERMS.some((term) => normalized.includes(term));
}

function inferAttackType(headline: string): ConflictEvent["attackType"] {
  const normalized = normalizeCountry(headline);
  if (normalized.includes("drone")) {
    return "drone";
  }
  if (normalized.includes("missile") || normalized.includes("rocket")) {
    return "missile";
  }
  return "airstrike";
}

function buildFallbackCountryEvents(
  focusCountry: string,
  trustedItems: Array<{
    headline: string;
    url: string;
    publisher: string;
    publishedAt: string;
  }>,
  sinceYear?: number,
) {
  const startMs =
    typeof sinceYear === "number"
      ? Date.UTC(sinceYear, 0, 1)
      : Number.NEGATIVE_INFINITY;
  return trustedItems
    .filter((item) => headlineMentionsCountry(item.headline, focusCountry))
    .filter((item) => isAttackHeadline(item.headline))
    .filter((item) => {
      const ms = Date.parse(item.publishedAt);
      return Number.isNaN(ms) || ms >= startMs;
    })
    .sort(
      (a, b) =>
        Date.parse(b.publishedAt || "") - Date.parse(a.publishedAt || ""),
    )
    .slice(0, 120)
    .map((item) => ({
      id: randomUUID(),
      attacker: "Unknown",
      target: focusCountry,
      startLat: 0,
      startLng: 0,
      endLat: 0,
      endLng: 0,
      attackType: inferAttackType(item.headline),
      timestamp: item.publishedAt || new Date().toISOString(),
      description: item.headline,
      source: "simulation",
      verification: "unverified",
      sourcePublisher: item.publisher || "Unknown",
      sourceUrl: item.url,
      sourceHeadline: item.headline,
      evidenceQuote: item.headline,
      sourcePublishedAt: item.publishedAt || new Date().toISOString(),
    }));
}

export async function POST(request: NextRequest) {
  let focusCountry: string | undefined;
  let sinceYear: number | undefined;
  let page = 1;
  let pageSize = 12;
  try {
    const body = (await request.json()) as {
      country?: unknown;
      sinceYear?: unknown;
      page?: unknown;
      pageSize?: unknown;
    };
    if (typeof body?.country === "string" && body.country.trim()) {
      focusCountry = body.country.trim();
    }
    if (typeof body?.sinceYear === "number" && Number.isInteger(body.sinceYear)) {
      sinceYear = body.sinceYear;
    }
    if (typeof body?.page === "number" && Number.isInteger(body.page) && body.page > 0) {
      page = body.page;
    }
    if (
      typeof body?.pageSize === "number" &&
      Number.isInteger(body.pageSize) &&
      body.pageSize >= 5 &&
      body.pageSize <= 50
    ) {
      pageSize = body.pageSize;
    }
  } catch {
    // Empty or non-JSON body is expected for regular polling.
  }

  console.log("[/api/events/news] Route called.");
  const trustedItems = await fetchTrustedConflictNews(
    focusCountry
      ? { country: focusCountry, sinceYear, limit: 120, includeUntrusted: true }
      : { limit: 12 },
  );
  const events = await extractConflictEventsFromNews(
    trustedItems,
    focusCountry,
    sinceYear,
  );

  for (const event of events) {
    eventStore.addEvent(event);
  }

  const allTrustedEvents = eventStore
    .getEvents(2000)
    .filter(
      (event) =>
        event.source === "openrouter" && event.verification === "trusted",
    );
  const countryEvents = focusCountry
    ? allTrustedEvents
        .filter((event) => {
          const country = focusCountry ?? "";
          const eventMs = Date.parse(event.sourcePublishedAt || event.timestamp);
          const startMs =
            typeof sinceYear === "number"
              ? Date.UTC(sinceYear, 0, 1)
              : Number.NEGATIVE_INFINITY;
          const withinYearRange = Number.isNaN(eventMs) || eventMs >= startMs;
          return (
            withinYearRange &&
            (countryMatches(event.attacker, country) ||
              countryMatches(event.target, country))
          );
        })
        .sort(
          (a, b) =>
            Date.parse(b.sourcePublishedAt || b.timestamp) -
            Date.parse(a.sourcePublishedAt || a.timestamp),
        )
    : [];
  const fallbackCountryEvents = focusCountry
    ? buildFallbackCountryEvents(focusCountry, trustedItems, sinceYear)
    : [];
  const mergedCountryEvents = countryEvents.length
    ? countryEvents
    : fallbackCountryEvents;
  const totalCountryEvents = mergedCountryEvents.length;
  const totalPages = Math.max(1, Math.ceil(totalCountryEvents / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const paginatedCountryEvents = mergedCountryEvents.slice(
    pageStart,
    pageStart + pageSize,
  );

  console.log("[/api/events/news] Trusted headlines:", trustedItems.length);
  console.log("[/api/events/news] OpenRouter extracted:", events.length);
  if (focusCountry && countryEvents.length === 0 && fallbackCountryEvents.length > 0) {
    console.log("[/api/events/news] Country fallback events used:", {
      country: focusCountry,
      count: fallbackCountryEvents.length,
    });
  }
  if (events[0]) {
    console.log("[/api/events/news] First AI event:", {
      attacker: events[0].attacker,
      target: events[0].target,
      attackType: events[0].attackType,
      source: events[0].source,
    });
  }

  return NextResponse.json({
    ok: true,
    trustedHeadlines: trustedItems.length,
    extracted: events.length,
    events,
    countryEvents: paginatedCountryEvents,
    totalCountryEvents,
    currentPage,
    totalPages,
    pageSize,
    impacts: eventStore.getImpacts(),
    stats: eventStore.getStats(),
  });
}
