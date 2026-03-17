import { NextResponse } from "next/server";
import { eventStore } from "@/lib/event-store";
import { fetchTrustedConflictNews } from "@/lib/news";
import { extractConflictEventsFromNews } from "@/lib/openrouter";

export const runtime = "nodejs";

export async function POST() {
  console.log("[/api/events/news] Route called.");
  const trustedItems = await fetchTrustedConflictNews();
  const events = await extractConflictEventsFromNews(trustedItems);

  for (const event of events) {
    eventStore.addEvent(event);
  }

  console.log("[/api/events/news] Trusted headlines:", trustedItems.length);
  console.log("[/api/events/news] OpenRouter extracted:", events.length);
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
    stats: eventStore.getStats(),
  });
}
