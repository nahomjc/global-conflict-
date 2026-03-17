import { NextResponse } from "next/server";
import { eventStore } from "@/lib/event-store";
import { ensureWebSocketServer, getWsPort } from "@/lib/websocket-server";

export const runtime = "nodejs";

export async function GET() {
  ensureWebSocketServer();

  return NextResponse.json({
    wsPort: getWsPort(),
    events: eventStore.getEvents(),
    impacts: eventStore.getImpacts(),
    stats: eventStore.getStats(),
  });
}
