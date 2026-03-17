import { NextResponse } from "next/server";
import { eventStore } from "@/lib/event-store";
import { ensureWebSocketServer, getWsPort } from "@/lib/websocket-server";

export const runtime = "nodejs";

export async function GET() {
  const realtimeMode = process.env.VERCEL ? "poll" : "ws";
  if (realtimeMode === "ws") {
    ensureWebSocketServer();
  }

  return NextResponse.json({
    realtimeMode,
    wsPort: realtimeMode === "ws" ? getWsPort() : null,
    events: eventStore.getEvents(),
    impacts: eventStore.getImpacts(),
    stats: eventStore.getStats(),
  });
}
