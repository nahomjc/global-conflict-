import { NextResponse } from "next/server";
import { eventStore } from "@/lib/event-store";
import { generateSimulatedEvent } from "@/lib/simulator";

export const runtime = "nodejs";

export async function POST() {
  const event = generateSimulatedEvent();
  eventStore.addEvent(event);

  return NextResponse.json({ ok: true, event });
}
