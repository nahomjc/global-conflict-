import type { ConflictEvent, ConflictStats, ImpactPulse } from "@/lib/conflict-types";

const MAX_EVENTS = 2000;
const MAX_IMPACTS = 600;

class EventStore {
  private readonly events: ConflictEvent[] = [];
  private readonly impacts: ImpactPulse[] = [];

  addEvent(event: ConflictEvent) {
    this.events.unshift(event);
    if (this.events.length > MAX_EVENTS) {
      this.events.length = MAX_EVENTS;
    }

    this.impacts.unshift({
      id: `${event.id}-impact`,
      lat: event.endLat,
      lng: event.endLng,
      eventId: event.id,
      attackType: event.attackType,
      createdAt: Date.now(),
    });

    if (this.impacts.length > MAX_IMPACTS) {
      this.impacts.length = MAX_IMPACTS;
    }
  }

  getEvents(limit = 80) {
    return this.events.slice(0, limit);
  }

  getImpacts() {
    const cutoff = Date.now() - 45_000;
    return this.impacts.filter((impact) => impact.createdAt >= cutoff);
  }

  getStats(): ConflictStats {
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const todayEvents = this.events.filter((event) => new Date(event.timestamp) >= dayStart);

    const targetCounts = new Map<string, number>();
    const attackerCounts = new Map<string, number>();

    for (const event of todayEvents) {
      targetCounts.set(event.target, (targetCounts.get(event.target) ?? 0) + 1);
      attackerCounts.set(event.attacker, (attackerCounts.get(event.attacker) ?? 0) + 1);
    }

    const mostTargetedCountry = this.pickTopCountry(targetCounts);
    const mostActiveAttacker = this.pickTopCountry(attackerCounts);
    const attackRate = todayEvents.length;

    const globalAlertLevel =
      attackRate > 160 ? "CRITICAL" : attackRate > 110 ? "HIGH" : attackRate > 50 ? "ELEVATED" : "LOW";

    return {
      totalAttacksToday: todayEvents.length,
      mostTargetedCountry,
      mostActiveAttacker,
      globalAlertLevel,
    };
  }

  removeNonTrustedAiEvents() {
    const allowedEventIds = new Set<string>();
    const before = this.events.length;

    const trustedEvents = this.events.filter(
      (event) => event.source === "openrouter" && event.verification === "trusted",
    );

    for (const event of trustedEvents) {
      allowedEventIds.add(event.id);
    }

    this.events.length = 0;
    this.events.push(...trustedEvents);

    const filteredImpacts = this.impacts.filter((impact) => allowedEventIds.has(impact.eventId));
    this.impacts.length = 0;
    this.impacts.push(...filteredImpacts);

    return before - this.events.length;
  }

  removeStaleTrustedAiEvents(maxAgeMs: number) {
    const now = Date.now();
    const keepEventIds = new Set<string>();
    const before = this.events.length;

    const remaining = this.events.filter((event) => {
      if (!(event.source === "openrouter" && event.verification === "trusted")) {
        return false;
      }

      const ingestMs = Date.parse(event.timestamp);
      const sourceMs = Date.parse(event.sourcePublishedAt);
      const ingestFresh = !Number.isNaN(ingestMs) && now - ingestMs <= maxAgeMs;
      const sourceFresh = !Number.isNaN(sourceMs) && now - sourceMs <= maxAgeMs;

      const keep = ingestFresh && sourceFresh;
      if (keep) {
        keepEventIds.add(event.id);
      }
      return keep;
    });

    this.events.length = 0;
    this.events.push(...remaining);

    const filteredImpacts = this.impacts.filter((impact) => keepEventIds.has(impact.eventId));
    this.impacts.length = 0;
    this.impacts.push(...filteredImpacts);

    return before - this.events.length;
  }

  isDuplicateTrustedAiEvent(candidate: ConflictEvent) {
    if (!(candidate.source === "openrouter" && candidate.verification === "trusted")) {
      return false;
    }

    const key = this.getTrustedAiKey(candidate);
    return this.events.some((event) => {
      if (!(event.source === "openrouter" && event.verification === "trusted")) {
        return false;
      }
      return this.getTrustedAiKey(event) === key;
    });
  }

  removeDuplicateTrustedAiEvents() {
    const seenKeys = new Set<string>();
    const keepEventIds = new Set<string>();
    const before = this.events.length;

    const remaining = this.events.filter((event) => {
      if (!(event.source === "openrouter" && event.verification === "trusted")) {
        return false;
      }

      const key = this.getTrustedAiKey(event);
      if (seenKeys.has(key)) {
        return false;
      }

      seenKeys.add(key);
      keepEventIds.add(event.id);
      return true;
    });

    this.events.length = 0;
    this.events.push(...remaining);

    const filteredImpacts = this.impacts.filter((impact) => keepEventIds.has(impact.eventId));
    this.impacts.length = 0;
    this.impacts.push(...filteredImpacts);

    return before - this.events.length;
  }

  private getTrustedAiKey(event: ConflictEvent) {
    const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, " ").trim();
    return [
      normalize(event.sourceUrl || ""),
      normalize(event.sourceHeadline || ""),
      normalize(event.sourcePublishedAt || ""),
      normalize(event.attacker || ""),
      normalize(event.target || ""),
      normalize(event.attackType || ""),
    ].join("|");
  }

  private pickTopCountry(counter: Map<string, number>) {
    let winner = "N/A";
    let max = 0;
    for (const [country, count] of counter.entries()) {
      if (count > max) {
        winner = country;
        max = count;
      }
    }
    return winner;
  }
}

declare global {
  var __conflictEventStore: EventStore | undefined;
}

const existingStore = globalThis.__conflictEventStore;
const hasTrustedCleanupMethod =
  existingStore &&
  typeof (existingStore as EventStore).removeNonTrustedAiEvents === "function" &&
  typeof (existingStore as EventStore).removeStaleTrustedAiEvents === "function" &&
  typeof (existingStore as EventStore).isDuplicateTrustedAiEvent === "function" &&
  typeof (existingStore as EventStore).removeDuplicateTrustedAiEvents === "function";

export const eventStore = hasTrustedCleanupMethod ? (existingStore as EventStore) : new EventStore();

if (!hasTrustedCleanupMethod) {
  globalThis.__conflictEventStore = eventStore;
}
