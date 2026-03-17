"use client";

import { useEffect, useMemo, useState } from "react";
import { EventFeed } from "@/components/EventFeed";
import { GlobeMap } from "@/components/GlobeMap";
import { IntroLoader } from "@/components/IntroLoader";
import { StatsPanel, type DateRangeFilter } from "@/components/StatsPanel";
import type { AttackType, ConflictEvent, ConflictStats, ImpactPulse } from "@/lib/conflict-types";

type StreamPacket =
  | {
      type: "bootstrap";
      payload: { events: ConflictEvent[]; impacts: ImpactPulse[]; stats: ConflictStats };
    }
  | {
      type: "event";
      payload: { event: ConflictEvent; impacts: ImpactPulse[]; stats: ConflictStats };
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
  impacts: ImpactPulse[];
  stats: ConflictStats;
};

const DEFAULT_STATS: ConflictStats = {
  totalAttacksToday: 0,
  mostTargetedCountry: "N/A",
  mostActiveAttacker: "N/A",
  globalAlertLevel: "LOW",
};

function eventDateMs(event: ConflictEvent) {
  const sourceMs = Date.parse(event.sourcePublishedAt);
  if (!Number.isNaN(sourceMs)) {
    return sourceMs;
  }
  const ingestMs = Date.parse(event.timestamp);
  return Number.isNaN(ingestMs) ? 0 : ingestMs;
}

export default function Home() {
  const [showIntroLoader, setShowIntroLoader] = useState(true);
  const [events, setEvents] = useState<ConflictEvent[]>([]);
  const [impacts, setImpacts] = useState<ImpactPulse[]>([]);
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [activeTypes, setActiveTypes] = useState<AttackType[]>(["missile", "drone", "airstrike"]);
  const [dateRange, setDateRange] = useState<DateRangeFilter>("today");

  useEffect(() => {
    const timer = setTimeout(() => setShowIntroLoader(false), 2400);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    let socket: WebSocket | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    const dedupeByIncident = (items: ConflictEvent[]) => {
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
    };

    const pollNews = async () => {
      try {
        const response = await fetch("/api/events/news", { method: "POST" });
        const payload = (await response.json()) as NewsPollResponse;
        if (!payload.ok) {
          return;
        }

        setEvents((previous) => dedupeByIncident([...payload.events, ...previous]).slice(0, 1500));
        setImpacts(payload.impacts);
      } catch (error) {
        console.error("[dashboard] Polling /api/events/news failed", error);
      }
    };

    const connect = async () => {
      const response = await fetch("/api/events/bootstrap");
      const bootstrap = (await response.json()) as BootstrapResponse;

      setEvents(bootstrap.events);
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
            setEvents(packet.payload.events);
            setImpacts(packet.payload.impacts);
            const aiCount = packet.payload.events.filter((event) => event.source === "openrouter").length;
            console.log("[dashboard] Bootstrap received. OpenRouter events:", aiCount);
          } else if (packet.type === "event") {
            setEvents((previous) => [packet.payload.event, ...previous].slice(0, 1500));
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
    () => events.filter((event) => event.source === "openrouter" && event.verification === "trusted"),
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

    const days = dateRange === "7d" ? 7 : 30;
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
      attackerCounts.set(event.attacker, (attackerCounts.get(event.attacker) ?? 0) + 1);
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
        attackRate > 160 ? "CRITICAL" : attackRate > 110 ? "HIGH" : attackRate > 50 ? "ELEVATED" : "LOW",
    };
  }, [rangeEvents]);

  const filteredEvents = useMemo(() => {
    return rangeEvents.filter((event) => {
      const countryMatch =
        !selectedCountry || event.attacker === selectedCountry || event.target === selectedCountry;
      const typeMatch = activeTypes.includes(event.attackType);
      return countryMatch && typeMatch;
    });
  }, [activeTypes, rangeEvents, selectedCountry]);

  const filteredImpacts = useMemo(() => {
    const allowed = new Set(filteredEvents.map((event) => event.id));
    return impacts.filter((impact) => allowed.has(impact.eventId));
  }, [filteredEvents, impacts]);

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
    <div className="war-room-bg min-h-screen p-3 text-slate-100 sm:p-4 lg:p-6">
      <IntroLoader visible={showIntroLoader} />
      <div className="mx-auto grid max-w-[1500px] gap-3 sm:gap-4">
        <StatsPanel
          stats={aiOnlyStats ?? DEFAULT_STATS}
          selectedCountry={selectedCountry}
          activeTypes={activeTypes}
          dateRange={dateRange}
          onCountryReset={() => setSelectedCountry(null)}
          onToggleType={toggleAttackType}
          onDateRangeChange={setDateRange}
        />

        <div className="grid gap-3 sm:gap-4 lg:min-h-[78vh] lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_360px]">
          <GlobeMap
            events={filteredEvents}
            impacts={filteredImpacts}
            selectedCountry={selectedCountry}
            onCountrySelect={setSelectedCountry}
          />
          <EventFeed events={filteredEvents.slice(0, 120)} />
        </div>
      </div>
    </div>
  );
}
