"use client";

import { useEffect, useMemo, useState } from "react";
import { EventFeed } from "@/components/EventFeed";
import { GlobeMap } from "@/components/GlobeMap";
import { IntroLoader } from "@/components/IntroLoader";
import { StatsPanel, type DateRangeFilter } from "@/components/StatsPanel";
import { CountryNameWithFlag } from "@/components/CountryNameWithFlag";
import { ConflictChatbot } from "@/components/ConflictChatbot";
import type {
  AttackType,
  ConflictEvent,
  ConflictStats,
  ImpactPulse,
} from "@/lib/conflict-types";

type StreamPacket =
  | {
      type: "bootstrap";
      payload: {
        events: ConflictEvent[];
        impacts: ImpactPulse[];
        stats: ConflictStats;
      };
    }
  | {
      type: "event";
      payload: {
        event: ConflictEvent;
        impacts: ImpactPulse[];
        stats: ConflictStats;
      };
    };

type BootstrapResponse = {
  realtimeMode: "ws" | "poll";
  wsPort: number | null;
  events: ConflictEvent[];
  impacts: ImpactPulse[];
  stats: ConflictStats;
};

type NewsPollResponse = {
  ok: boolean;
  trustedHeadlines: number;
  extracted: number;
  events: ConflictEvent[];
  countryEvents?: ConflictEvent[];
  totalCountryEvents?: number;
  currentPage?: number;
  totalPages?: number;
  pageSize?: number;
  impacts: ImpactPulse[];
  stats: ConflictStats;
};

const DEFAULT_STATS: ConflictStats = {
  totalAttacksToday: 0,
  mostTargetedCountry: "N/A",
  mostActiveAttacker: "N/A",
  globalAlertLevel: "LOW",
};
const DRAWER_SINCE_YEAR = 2020;
const DRAWER_PAGE_SIZE = 10;
const CURRENT_RANGE_DAYS = 10;
const RANKINGS_START_MS = Date.UTC(2024, 0, 1);
const RANKINGS_END_MS = Date.UTC(2027, 0, 1);
const RANKING_PLACEHOLDERS = new Set([
  "unknown",
  "various",
  "multiple",
  "n a",
  "na",
  "none",
  "unidentified",
]);
const GENERIC_STREAM_ACTORS = new Set([
  "unknown",
  "various",
  "multiple",
  "middle east",
  "region",
  "global",
  "n a",
  "na",
]);
const COUNTRY_ALIASES: Record<string, string[]> = {
  "united states": [
    "usa",
    "us",
    "u.s.",
    "u.s.a.",
    "united states of america",
    "america",
  ],
  "united kingdom": ["uk", "u.k.", "great britain", "britain", "england"],
  russia: ["russian federation"],
  "united arab emirates": ["uae", "united arab emirate", "iran uae"],
};

function eventDateMs(event: ConflictEvent) {
  const sourceMs = Date.parse(event.sourcePublishedAt);
  if (!Number.isNaN(sourceMs)) {
    return sourceMs;
  }
  const ingestMs = Date.parse(event.timestamp);
  return Number.isNaN(ingestMs) ? 0 : ingestMs;
}

function eventIngestMs(event: ConflictEvent) {
  const ingestMs = Date.parse(event.timestamp);
  return Number.isNaN(ingestMs) ? 0 : ingestMs;
}

function normalizeCountryName(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalCountryName(value: string) {
  const normalized = normalizeCountryName(value);
  if (!normalized) {
    return normalized;
  }
  for (const [canonical, aliases] of Object.entries(COUNTRY_ALIASES)) {
    if (
      normalized === canonical ||
      aliases.some((alias) => normalizeCountryName(alias) === normalized)
    ) {
      return canonical;
    }
  }
  return normalized;
}

function countryMatches(left: string, right: string) {
  const a = canonicalCountryName(left);
  const b = canonicalCountryName(right);
  if (!a || !b) {
    return false;
  }
  if (a === b) {
    return true;
  }
  return (a.length > 4 && b.includes(a)) || (b.length > 4 && a.includes(b));
}

function dedupeByIncident(items: ConflictEvent[]) {
  const map = new Map<string, ConflictEvent>();
  for (const item of items) {
    const key = [
      item.sourceUrl ?? "",
      item.sourceHeadline ?? "",
      item.sourcePublishedAt ?? "",
      item.attacker ?? "",
      item.target ?? "",
      item.attackType ?? "",
    ]
      .join("|")
      .toLowerCase();
    if (!map.has(key)) {
      map.set(key, item);
    }
  }
  return Array.from(map.values());
}

function isSpecificStreamActor(value: string) {
  const normalized = normalizeCountryName(value);
  if (!normalized || GENERIC_STREAM_ACTORS.has(normalized)) {
    return false;
  }
  if (
    normalized.includes(" and ") ||
    normalized.includes(" vs ") ||
    normalized.includes("/") ||
    normalized.includes("-")
  ) {
    return false;
  }
  if (
    normalized.includes("various ") ||
    normalized.includes("multiple ") ||
    normalized.includes("middle east") ||
    normalized.includes(" region")
  ) {
    return false;
  }
  return true;
}

function sanitizeStreamEvents(items: ConflictEvent[]) {
  return items.filter((event) => {
    if (event.source !== "openrouter") {
      return true;
    }
    return (
      isSpecificStreamActor(event.attacker) &&
      isSpecificStreamActor(event.target) &&
      normalizeCountryName(event.attacker) !==
        normalizeCountryName(event.target)
    );
  });
}

function splitCountryActors(raw: string) {
  const normalized = normalizeCountryName(raw);
  if (!normalized) {
    return [];
  }
  return normalized
    .replace(/\b(and|vs|versus|with)\b/g, ",")
    .replace(/[&/|;]+/g, ",")
    .split(",")
    .map((part) => normalizeCountryName(part))
    .filter(Boolean);
}

function extractRankingCountries(raw: string) {
  return splitCountryActors(raw)
    .map((part) => canonicalCountryName(part))
    .filter((country) => country && !RANKING_PLACEHOLDERS.has(country));
}

function buildTopCountries(
  events: ConflictEvent[],
  selector: (event: ConflictEvent) => string,
) {
  const counts = new Map<string, number>();
  for (const event of events) {
    const countries = extractRankingCountries(selector(event));
    for (const country of countries) {
      counts.set(country, (counts.get(country) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([country, count]) => ({ country, count }));
}

function buildTopCountriesWithFallback(
  primaryEvents: ConflictEvent[],
  fallbackEvents: ConflictEvent[],
  selector: (event: ConflictEvent) => string,
) {
  const primary = buildTopCountries(primaryEvents, selector);
  if (primary.length >= 10) {
    return primary;
  }

  const seen = new Set(primary.map((entry) => entry.country));
  const fallback = buildTopCountries(fallbackEvents, selector).filter(
    (entry) => !seen.has(entry.country),
  );
  return [...primary, ...fallback].slice(0, 10);
}

export default function Home() {
  const [showIntroLoader, setShowIntroLoader] = useState(true);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [events, setEvents] = useState<ConflictEvent[]>([]);
  const [impacts, setImpacts] = useState<ImpactPulse[]>([]);
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [isCountryDrawerOpen, setIsCountryDrawerOpen] = useState(false);
  const [drawerEvents, setDrawerEvents] = useState<ConflictEvent[]>([]);
  const [isDrawerLoading, setIsDrawerLoading] = useState(false);
  const [drawerError, setDrawerError] = useState<string | null>(null);
  const [drawerPage, setDrawerPage] = useState(1);
  const [drawerTotalEvents, setDrawerTotalEvents] = useState(0);
  const [drawerTotalPages, setDrawerTotalPages] = useState(1);
  const [activeTypes, setActiveTypes] = useState<AttackType[]>([
    "missile",
    "drone",
    "airstrike",
  ]);
  const [dateRange, setDateRange] = useState<DateRangeFilter>("current");
  const [isTopCountriesModalOpen, setIsTopCountriesModalOpen] = useState(false);
  const [dismissedBreakingNews, setDismissedBreakingNews] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setShowIntroLoader(false), 2400);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    let socket: WebSocket | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    const pollNews = async () => {
      try {
        const response = await fetch("/api/events/news", { method: "POST" });
        const payload = (await response.json()) as NewsPollResponse;
        if (!payload.ok) {
          return;
        }

        setEvents((previous) =>
          sanitizeStreamEvents(
            dedupeByIncident([...payload.events, ...previous]).slice(0, 1500),
          ),
        );
        setImpacts(payload.impacts);
      } catch (error) {
        console.error("[dashboard] Polling /api/events/news failed", error);
      } finally {
        setIsBootstrapping(false);
      }
    };

    const connect = async () => {
      try {
        const response = await fetch("/api/events/bootstrap");
        const bootstrap = (await response.json()) as BootstrapResponse;

        setEvents(sanitizeStreamEvents(bootstrap.events));
        setImpacts(bootstrap.impacts);

        console.log("[dashboard] Bootstrap route: /api/events/bootstrap");
        console.log("[dashboard] Manual AI route: /api/events/news");
        console.log("[dashboard] Realtime mode:", bootstrap.realtimeMode);

        if (bootstrap.realtimeMode === "ws" && bootstrap.wsPort) {
          const protocol = window.location.protocol === "https:" ? "wss" : "ws";
          const wsUrl = `${protocol}://${window.location.hostname}:${bootstrap.wsPort}`;
          console.log("[dashboard] WebSocket route:", wsUrl);
          socket = new WebSocket(wsUrl);

          socket.onmessage = (message) => {
            const packet = JSON.parse(message.data as string) as StreamPacket;

            if (packet.type === "bootstrap") {
              setEvents(sanitizeStreamEvents(packet.payload.events));
              setImpacts(packet.payload.impacts);
              const aiCount = packet.payload.events.filter(
                (event) => event.source === "openrouter",
              ).length;
              console.log(
                "[dashboard] Bootstrap received. OpenRouter events:",
                aiCount,
              );
            } else if (packet.type === "event") {
              setEvents((previous) =>
                sanitizeStreamEvents(
                  [packet.payload.event, ...previous].slice(0, 1500),
                ),
              );
              setImpacts(packet.payload.impacts);
              if (packet.payload.event.source === "openrouter") {
                console.log("🧠 [OpenRouter AI Event]", packet.payload.event);
              }
            }
          };
        } else {
          await pollNews();
          pollTimer = setInterval(() => {
            void pollNews();
          }, 45_000);
        }
      } catch (error) {
        console.error("[dashboard] Bootstrap failed", error);
      } finally {
        setIsBootstrapping(false);
      }
    };

    void connect();

    return () => {
      if (socket) {
        socket.close();
      }
      if (pollTimer) {
        clearInterval(pollTimer);
      }
    };
  }, []);

  const trustedAiEvents = useMemo(
    () =>
      events.filter(
        (event) =>
          event.source === "openrouter" && event.verification === "trusted",
      ),
    [events],
  );

  const rangeStart = useMemo(() => {
    if (dateRange === "all") {
      return null;
    }

    const now = new Date();
    if (dateRange === "today") {
      const dayStart = new Date(now);
      dayStart.setHours(0, 0, 0, 0);
      return dayStart;
    }

    const days =
      dateRange === "current"
        ? CURRENT_RANGE_DAYS
        : dateRange === "7d"
          ? 7
          : 30;
    return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  }, [dateRange]);

  const rangeEvents = useMemo(
    () =>
      trustedAiEvents.filter((event) => {
        if (!rangeStart) {
          return true;
        }
        return eventDateMs(event) >= rangeStart.getTime();
      }),
    [rangeStart, trustedAiEvents],
  );

  const aiOnlyStats = useMemo<ConflictStats>(() => {
    const targetCounts = new Map<string, number>();
    const attackerCounts = new Map<string, number>();
    for (const event of rangeEvents) {
      targetCounts.set(event.target, (targetCounts.get(event.target) ?? 0) + 1);
      attackerCounts.set(
        event.attacker,
        (attackerCounts.get(event.attacker) ?? 0) + 1,
      );
    }

    const pickTop = (counter: Map<string, number>) => {
      let winner = "N/A";
      let max = 0;
      for (const [name, count] of counter.entries()) {
        if (count > max) {
          winner = name;
          max = count;
        }
      }
      return winner;
    };

    const attackRate = rangeEvents.length;
    return {
      totalAttacksToday: rangeEvents.length,
      mostTargetedCountry: pickTop(targetCounts),
      mostActiveAttacker: pickTop(attackerCounts),
      globalAlertLevel:
        attackRate > 160
          ? "CRITICAL"
          : attackRate > 110
            ? "HIGH"
            : attackRate > 50
              ? "ELEVATED"
              : "LOW",
    };
  }, [rangeEvents]);

  const topTargetedCountries = useMemo(() => {
    const rankingEvents2024To2026 = trustedAiEvents.filter((event) => {
      const ms = eventDateMs(event);
      return ms >= RANKINGS_START_MS && ms < RANKINGS_END_MS;
    });
    return buildTopCountriesWithFallback(
      rankingEvents2024To2026,
      trustedAiEvents,
      (event) => event.target,
    );
  }, [trustedAiEvents]);

  const topAttackerCountries = useMemo(() => {
    const rankingEvents2024To2026 = trustedAiEvents.filter((event) => {
      const ms = eventDateMs(event);
      return ms >= RANKINGS_START_MS && ms < RANKINGS_END_MS;
    });
    return buildTopCountriesWithFallback(
      rankingEvents2024To2026,
      trustedAiEvents,
      (event) => event.attacker,
    );
  }, [trustedAiEvents]);

  const filteredEvents = useMemo(() => {
    return rangeEvents.filter((event) => {
      const countryMatch =
        !selectedCountry ||
        countryMatches(event.attacker, selectedCountry) ||
        countryMatches(event.target, selectedCountry);
      const typeMatch = activeTypes.includes(event.attackType);
      return countryMatch && typeMatch;
    });
  }, [activeTypes, rangeEvents, selectedCountry]);

  const sortedFilteredEvents = useMemo(() => {
    return [...filteredEvents].sort((a, b) => {
      const sourceDelta = eventDateMs(b) - eventDateMs(a);
      if (sourceDelta !== 0) {
        return sourceDelta;
      }
      return eventIngestMs(b) - eventIngestMs(a);
    });
  }, [filteredEvents]);

  const filteredImpacts = useMemo(() => {
    const allowed = new Set(filteredEvents.map((event) => event.id));
    return impacts.filter((impact) => allowed.has(impact.eventId));
  }, [filteredEvents, impacts]);

  const waitingForAiResponse = useMemo(
    () => !showIntroLoader && (isBootstrapping || trustedAiEvents.length === 0),
    [isBootstrapping, showIntroLoader, trustedAiEvents.length],
  );

  const todayEventsCount = useMemo(() => {
    const now = new Date();
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const startMs = dayStart.getTime();
    return trustedAiEvents.filter((event) => eventIngestMs(event) >= startMs)
      .length;
  }, [trustedAiEvents]);

  const shouldShowBreakingNews =
    !showIntroLoader && !dismissedBreakingNews && todayEventsCount > 0;
  const eventFeedEmptyMessage = useMemo(() => {
    if (dateRange === "today") {
      return "No attacks today.";
    }
    if (dateRange === "current") {
      return `No attacks in the last ${CURRENT_RANGE_DAYS} days.`;
    }
    return "Waiting for incoming events...";
  }, [dateRange]);

  const countryTimelineEvents = useMemo(() => drawerEvents, [drawerEvents]);
  useEffect(() => {
    const onEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsCountryDrawerOpen(false);
        setIsTopCountriesModalOpen(false);
      }
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, []);

  const handleCountrySelect = (country: string | null) => {
    setSelectedCountry(country);
    setIsCountryDrawerOpen(Boolean(country));
    setDrawerError(null);
    setDrawerEvents([]);
    setDrawerPage(1);
    setDrawerTotalEvents(0);
    setDrawerTotalPages(1);
  };

  const closeCountryDrawer = () => {
    setIsCountryDrawerOpen(false);
    setSelectedCountry(null);
    setDrawerEvents([]);
    setDrawerError(null);
    setDrawerPage(1);
    setDrawerTotalEvents(0);
    setDrawerTotalPages(1);
  };

  useEffect(() => {
    if (!isCountryDrawerOpen || !selectedCountry) {
      return;
    }

    let cancelled = false;
    const fetchCountryEvents = async () => {
      setIsDrawerLoading(true);
      setDrawerError(null);
      try {
        const response = await fetch("/api/events/news", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            country: selectedCountry,
            sinceYear: DRAWER_SINCE_YEAR,
            page: drawerPage,
            pageSize: DRAWER_PAGE_SIZE,
          }),
        });
        const payload = (await response.json()) as NewsPollResponse;
        if (!payload.ok || cancelled) {
          if (!cancelled) {
            setDrawerError("Could not load AI country history.");
          }
          return;
        }

        setEvents((previous) =>
          sanitizeStreamEvents(
            dedupeByIncident([...payload.events, ...previous]).slice(0, 1500),
          ),
        );
        setImpacts(payload.impacts);
        setDrawerEvents(payload.countryEvents ?? []);
        setDrawerTotalEvents(payload.totalCountryEvents ?? 0);
        setDrawerTotalPages(payload.totalPages ?? 1);
      } catch (error) {
        console.error("[dashboard] Country drawer AI fetch failed", error);
        if (!cancelled) {
          setDrawerError("Could not load AI country history.");
        }
      } finally {
        if (!cancelled) {
          setIsDrawerLoading(false);
        }
      }
    };

    void fetchCountryEvents();
    return () => {
      cancelled = true;
    };
  }, [drawerPage, isCountryDrawerOpen, selectedCountry]);

  const toggleAttackType = (type: AttackType) => {
    setActiveTypes((previous) => {
      if (previous.includes(type)) {
        const next = previous.filter((entry) => entry !== type);
        return next.length > 0 ? next : previous;
      }
      return [...previous, type];
    });
  };

  return (
    <div className="war-room-bg min-h-screen overflow-x-hidden p-3 text-slate-100 sm:p-4 lg:p-6">
      <IntroLoader visible={showIntroLoader} />
      <div className="mx-auto grid w-full max-w-[1500px] gap-3 sm:gap-4">
        {shouldShowBreakingNews ? (
          <div className="relative overflow-hidden rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 shadow-[0_0_40px_rgba(248,113,113,0.10)]">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(248,113,113,0.22),transparent_55%),radial-gradient(circle_at_80%_40%,rgba(56,189,248,0.12),transparent_55%)]" />
            <div className="relative flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className="mt-1 inline-flex h-3 w-3 animate-pulse rounded-full bg-red-400 shadow-[0_0_24px_rgba(248,113,113,0.55)]" />
                <div>
                  <p className="text-[10px] font-semibold tracking-[0.18em] text-red-200 uppercase">
                    BREAKING NEWS
                  </p>
                  <p className="mt-1 text-sm text-slate-200">
                    War and strikes reported today.{" "}
                    <span className="font-semibold text-slate-100">
                      {todayEventsCount}
                    </span>{" "}
                    incidents detected.
                  </p>
                </div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <button
                  type="button"
                  onClick={() => setDateRange("today")}
                  className="rounded-full border border-red-300/40 bg-red-500/10 px-3 py-1 text-[11px] font-semibold tracking-wide text-red-200 transition hover:border-red-300/70 hover:bg-red-500/20"
                >
                  View Today
                </button>
                <button
                  type="button"
                  onClick={() => setDismissedBreakingNews(true)}
                  className="rounded-md border border-slate-600/60 bg-slate-900/50 px-2 py-1 text-xs text-slate-200 hover:border-cyan-300/40"
                  aria-label="Dismiss breaking news"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <section className="rounded-2xl border border-cyan-500/25 bg-slate-950/65 px-4 py-3 text-center backdrop-blur sm:px-5 sm:py-4">
          <p className="text-[10px] tracking-[0.2em] text-cyan-200 uppercase sm:text-xs">
            Situational Reflection
          </p>
          <p className="mt-2 text-sm leading-relaxed text-slate-200 sm:text-base">
            &ldquo;You will hear of wars and rumors of wars... Nation will rise
            against nation, and kingdom against kingdom.&rdquo;
          </p>
          <p className="mt-2 text-[11px] tracking-[0.15em] text-cyan-200 uppercase">
            Matthew 24:6-7
          </p>
        </section>

        <StatsPanel
          stats={aiOnlyStats ?? DEFAULT_STATS}
          selectedCountry={selectedCountry}
          activeTypes={activeTypes}
          dateRange={dateRange}
          onCountryReset={() => setSelectedCountry(null)}
          onToggleType={toggleAttackType}
          onDateRangeChange={setDateRange}
        />

        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setIsTopCountriesModalOpen(true)}
            className="rounded-full border border-cyan-400/50 bg-cyan-500/10 px-4 py-2 text-xs font-semibold tracking-[0.08em] text-cyan-100 uppercase transition hover:border-cyan-300/70 hover:bg-cyan-500/20"
          >
            Top Country Rankings
          </button>
        </div>

        <ConflictChatbot />

        <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:h-[78vh] lg:min-h-[560px] lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0 lg:h-full lg:min-h-0">
            <GlobeMap
              events={sortedFilteredEvents}
              impacts={filteredImpacts}
              selectedCountry={selectedCountry}
              onCountrySelect={handleCountrySelect}
            />
          </div>
          <div className="min-w-0 lg:h-full lg:min-h-0">
            <EventFeed
              events={sortedFilteredEvents.slice(0, 120)}
              waitingForAiResponse={waitingForAiResponse}
              emptyMessage={eventFeedEmptyMessage}
            />
          </div>
        </div>
      </div>

      <button
        type="button"
        className={`fixed inset-0 z-30 bg-slate-950/60 transition-opacity duration-300 ${
          isCountryDrawerOpen
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0"
        }`}
        onClick={closeCountryDrawer}
        aria-label="Close country timeline drawer"
        aria-hidden={!isCountryDrawerOpen}
      />

      <aside
        className={`fixed top-0 right-0 z-40 flex h-screen w-full max-w-md transform flex-col overflow-hidden border-l border-cyan-500/30 bg-slate-950/95 p-4 text-slate-100 shadow-2xl backdrop-blur transition-transform duration-300 sm:p-5 ${
          isCountryDrawerOpen ? "translate-x-0" : "translate-x-full"
        }`}
        aria-label="Country attack history"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] tracking-[0.18em] text-cyan-200 uppercase">
              Country Timeline
            </p>
            <h3 className="mt-1 text-lg font-semibold text-cyan-100">
              {selectedCountry ? (
                <CountryNameWithFlag country={selectedCountry} />
              ) : (
                "No country selected"
              )}
            </h3>
            <p className="mt-1 text-xs text-slate-300">
              Latest attacks first, attacker and target activity since{" "}
              {DRAWER_SINCE_YEAR}.
            </p>
          </div>
          <button
            type="button"
            onClick={closeCountryDrawer}
            className="rounded-md border border-slate-600/60 bg-slate-900/80 px-2 py-1 text-xs text-slate-200 hover:border-cyan-300/60 hover:text-cyan-100"
          >
            Close
          </button>
        </div>

        <div className="mb-3 rounded-lg border border-slate-700/60 bg-slate-900/80 px-3 py-2 text-xs text-slate-300">
          Total incidents found:{" "}
          <span className="font-semibold text-cyan-100">
            {drawerTotalEvents}
          </span>
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="scrollbar-thin min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
            {isDrawerLoading ? (
              <article className="rounded-xl border border-cyan-500/35 bg-cyan-500/10 p-3 text-xs text-cyan-100">
                Searching AI sources for {selectedCountry}...
              </article>
            ) : null}

            {drawerError ? (
              <article className="rounded-xl border border-red-500/35 bg-red-500/10 p-3 text-xs text-red-200">
                {drawerError}
              </article>
            ) : null}

            {selectedCountry &&
            !isDrawerLoading &&
            countryTimelineEvents.length === 0 ? (
              <article className="rounded-xl border border-slate-700/50 bg-slate-900/75 p-3 text-xs text-slate-300">
                No attack/strike incidents found for this country in current
                results.
              </article>
            ) : null}

            {countryTimelineEvents.map((event) => {
              return (
                <article
                  key={`drawer-${event.id}`}
                  className="rounded-xl border border-slate-700/50 bg-slate-900/75 p-3 text-xs"
                >
                  <p className="font-medium text-cyan-100">
                    <CountryNameWithFlag country={event.attacker} />{" "}
                    <span className="text-slate-500">-&gt;</span>{" "}
                    <CountryNameWithFlag country={event.target} />
                  </p>
                  <p className="mt-1 text-[11px] tracking-wide text-red-300 uppercase">
                    {event.attackType}
                  </p>
                  <p className="mt-1 text-slate-300">{event.description}</p>
                  <p className="mt-2 text-[10px] text-slate-500">
                    {event.sourcePublishedAt
                      ? `Source date: ${new Date(event.sourcePublishedAt).toLocaleString()}`
                      : `Ingested: ${new Date(event.timestamp).toLocaleString()}`}
                  </p>
                </article>
              );
            })}
          </div>

          <div className="mt-3 flex items-center justify-between border-t border-slate-700/60 pt-2 text-xs text-slate-300">
            <button
              type="button"
              disabled={drawerPage <= 1 || isDrawerLoading}
              onClick={() => setDrawerPage((prev) => Math.max(1, prev - 1))}
              className="rounded-md border border-slate-600/60 bg-slate-900/80 px-2 py-1 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Previous
            </button>
            <span>
              Page {drawerPage} / {drawerTotalPages}
            </span>
            <button
              type="button"
              disabled={drawerPage >= drawerTotalPages || isDrawerLoading}
              onClick={() =>
                setDrawerPage((prev) => Math.min(drawerTotalPages, prev + 1))
              }
              className="rounded-md border border-slate-600/60 bg-slate-900/80 px-2 py-1 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </aside>

      <button
        type="button"
        className={`fixed inset-0 z-40 bg-slate-950/70 transition-opacity duration-300 ${
          isTopCountriesModalOpen
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0"
        }`}
        onClick={() => setIsTopCountriesModalOpen(false)}
        aria-label="Close top country rankings modal"
        aria-hidden={!isTopCountriesModalOpen}
      />
      <section
        className={`fixed top-1/2 left-1/2 z-50 w-[calc(100%-1.5rem)] max-w-4xl -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-cyan-500/35 bg-slate-950/95 p-4 text-slate-100 shadow-2xl backdrop-blur transition-all duration-300 sm:p-5 ${
          isTopCountriesModalOpen
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0"
        }`}
        aria-label="Top country rankings"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] tracking-[0.18em] text-cyan-200 uppercase">
              Ranking Overview
            </p>
            <h3 className="mt-1 text-lg font-semibold text-cyan-100">
              Top Country Rankings
            </h3>
            <p className="mt-1 text-xs text-slate-300">
              Time window: 2024 - 2026 (auto-filled from older records if fewer
              than 10)
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsTopCountriesModalOpen(false)}
            className="rounded-md border border-slate-600/60 bg-slate-900/80 px-2 py-1 text-xs text-slate-200 hover:border-cyan-300/60 hover:text-cyan-100"
          >
            Close
          </button>
        </div>

        <div className="grid max-h-[70vh] grid-cols-1 gap-3 overflow-y-auto pr-1 md:grid-cols-2">
          <article className="rounded-xl border border-slate-700/60 bg-slate-900/75 p-3">
            <h4 className="mb-2 text-xs font-semibold tracking-[0.12em] text-cyan-100 uppercase">
              Most Targeted Countries
            </h4>
            <div className="space-y-2">
              {topTargetedCountries.length === 0 ? (
                <p className="text-xs text-slate-300">No data available.</p>
              ) : (
                topTargetedCountries.map((entry, index) => (
                  <div
                    key={`target-${entry.country}-${index}`}
                    className="flex items-center justify-between rounded-lg border border-slate-700/50 bg-slate-900/70 px-2 py-1.5 text-xs"
                  >
                    <p className="font-medium text-slate-100">
                      {index + 1}.{" "}
                      <CountryNameWithFlag country={entry.country} />
                    </p>
                    <span className="rounded-full bg-cyan-500/20 px-2 py-0.5 text-[11px] text-cyan-100">
                      {entry.count}
                    </span>
                  </div>
                ))
              )}
            </div>
          </article>

          <article className="rounded-xl border border-slate-700/60 bg-slate-900/75 p-3">
            <h4 className="mb-2 text-xs font-semibold tracking-[0.12em] text-cyan-100 uppercase">
              Most Active Attackers
            </h4>
            <div className="space-y-2">
              {topAttackerCountries.length === 0 ? (
                <p className="text-xs text-slate-300">No data available.</p>
              ) : (
                topAttackerCountries.map((entry, index) => (
                  <div
                    key={`attacker-${entry.country}-${index}`}
                    className="flex items-center justify-between rounded-lg border border-slate-700/50 bg-slate-900/70 px-2 py-1.5 text-xs"
                  >
                    <p className="font-medium text-slate-100">
                      {index + 1}.{" "}
                      <CountryNameWithFlag country={entry.country} />
                    </p>
                    <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[11px] text-emerald-100">
                      {entry.count}
                    </span>
                  </div>
                ))
              )}
            </div>
          </article>
        </div>
      </section>
    </div>
  );
}
