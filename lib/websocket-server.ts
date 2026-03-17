import { WebSocket, WebSocketServer } from "ws";
import { eventStore } from "@/lib/event-store";
import { fetchTrustedConflictNews } from "@/lib/news";
import { extractConflictEventsFromNews } from "@/lib/openrouter";
import type { ConflictEvent } from "@/lib/conflict-types";
import { generateSimulatedEvent } from "@/lib/simulator";

const WS_PORT = Number(process.env.WS_PORT ?? 3001);
const BROADCAST_INTERVAL_MS = Number(process.env.SIM_INTERVAL_MS ?? 2200);
const NEWS_POLL_INTERVAL_MS = Number(process.env.NEWS_POLL_INTERVAL_MS ?? 45_000);
const ENABLE_SIMULATION = process.env.ENABLE_SIMULATION === "true";
const TRUSTED_EVENT_MAX_AGE_MS = Number(process.env.TRUSTED_NEWS_MAX_AGE_HOURS ?? 720) * 60 * 60 * 1000;

type WsPacket =
  | {
      type: "bootstrap";
      payload: {
        events: ConflictEvent[];
        impacts: ReturnType<typeof eventStore.getImpacts>;
        stats: ReturnType<typeof eventStore.getStats>;
      };
    }
  | {
      type: "event";
      payload: {
        event: ConflictEvent;
        impacts: ReturnType<typeof eventStore.getImpacts>;
        stats: ReturnType<typeof eventStore.getStats>;
      };
    };

interface RuntimeState {
  wss?: WebSocketServer;
  simulationTimer?: NodeJS.Timeout;
  newsTimer?: NodeJS.Timeout;
}

declare global {
  var __wsRuntimeState: RuntimeState | undefined;
}

const runtimeState = globalThis.__wsRuntimeState ?? {};
if (!globalThis.__wsRuntimeState) {
  globalThis.__wsRuntimeState = runtimeState;
}

function send(client: WebSocket, packet: WsPacket) {
  if (client.readyState === WebSocket.OPEN) {
    client.send(JSON.stringify(packet));
  }
}

function broadcast(packet: WsPacket) {
  const clients = runtimeState.wss?.clients;
  if (!clients) {
    return;
  }
  for (const client of clients) {
    send(client, packet);
  }
}

function broadcastBootstrap() {
  broadcast({
    type: "bootstrap",
    payload: {
      events: eventStore.getEvents(),
      impacts: eventStore.getImpacts(),
      stats: eventStore.getStats(),
    },
  });
}

function publishEvent(event: ConflictEvent) {
  if (eventStore.isDuplicateTrustedAiEvent(event)) {
    console.log("[ws] Duplicate trusted AI event skipped.", {
      attacker: event.attacker,
      target: event.target,
      attackType: event.attackType,
      sourcePublisher: event.sourcePublisher,
    });
    return;
  }

  if (event.source === "openrouter") {
    console.log("[ws][ai-event]", {
      attacker: event.attacker,
      target: event.target,
      ingestedAt: event.timestamp,
      sourcePublishedAt: event.sourcePublishedAt,
      sourcePublisher: event.sourcePublisher,
    });
  }

  eventStore.addEvent(event);
  broadcast({
    type: "event",
    payload: {
      event,
      impacts: eventStore.getImpacts(),
      stats: eventStore.getStats(),
    },
  });
}

async function pollAiEvents() {
  console.log("[ws] Polling AI events via /api/events/news pipeline.");
  const trustedItems = await fetchTrustedConflictNews();
  const aiEvents = await extractConflictEventsFromNews(trustedItems);
  console.log("[ws] Trusted headlines:", trustedItems.length, "| AI events:", aiEvents.length);
  for (const event of aiEvents) {
    publishEvent(event);
  }
}

function ensureSeedData() {
  if (!ENABLE_SIMULATION) {
    return;
  }
  if (eventStore.getEvents(1).length > 0) {
    return;
  }
  for (let i = 0; i < 25; i += 1) {
    eventStore.addEvent(generateSimulatedEvent());
  }
}

export function ensureWebSocketServer() {
  if (!ENABLE_SIMULATION) {
    if (runtimeState.simulationTimer) {
      clearInterval(runtimeState.simulationTimer);
      runtimeState.simulationTimer = undefined;
      console.log("[ws] Simulation disabled: cleared simulation timer.");
    }

    const removed = eventStore.removeNonTrustedAiEvents();
    if (removed > 0) {
      console.log(`[ws] Removed ${removed} non-trusted events from store.`);
      if (runtimeState.wss) {
        broadcastBootstrap();
      }
    }

    const removedStale = eventStore.removeStaleTrustedAiEvents(TRUSTED_EVENT_MAX_AGE_MS);
    if (removedStale > 0) {
      console.log(`[ws] Removed ${removedStale} stale trusted AI events from store.`);
      if (runtimeState.wss) {
        broadcastBootstrap();
      }
    }

    const removedDuplicates = eventStore.removeDuplicateTrustedAiEvents();
    if (removedDuplicates > 0) {
      console.log(`[ws] Removed ${removedDuplicates} duplicate trusted AI events from store.`);
      if (runtimeState.wss) {
        broadcastBootstrap();
      }
    }
  }

  if (runtimeState.wss) {
    return runtimeState.wss;
  }

  ensureSeedData();

  const wss = new WebSocketServer({ port: WS_PORT });
  console.log(`[ws] WebSocket server started on ws://localhost:${WS_PORT}`);

  wss.on("connection", (socket) => {
    console.log("[ws] Client connected.");
    send(socket, {
      type: "bootstrap",
      payload: {
        events: eventStore.getEvents(),
        impacts: eventStore.getImpacts(),
        stats: eventStore.getStats(),
      },
    });
  });

  if (ENABLE_SIMULATION) {
    runtimeState.simulationTimer = setInterval(() => {
      publishEvent(generateSimulatedEvent());
    }, BROADCAST_INTERVAL_MS);
  }

  runtimeState.newsTimer = setInterval(() => {
    void pollAiEvents();
  }, NEWS_POLL_INTERVAL_MS);

  void pollAiEvents();
  runtimeState.wss = wss;
  return wss;
}

export function getWsPort() {
  return WS_PORT;
}
