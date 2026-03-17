"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { ConflictEvent } from "@/lib/conflict-types";

interface EventFeedProps {
  events: ConflictEvent[];
}

export function EventFeed({ events }: EventFeedProps) {
  const aiCount = events.filter((event) => event.source === "openrouter").length;
  const trustedCount = events.filter((event) => event.verification === "trusted").length;

  return (
    <aside className="rounded-2xl border border-cyan-500/30 bg-slate-950/75 p-3 backdrop-blur sm:p-4 lg:h-full">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-semibold tracking-[0.2em] text-cyan-200 uppercase sm:text-sm">Live Event Feed</h2>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-cyan-500/20 px-2 py-0.5 text-[11px] text-cyan-100">
            OpenRouter AI: {aiCount}
          </span>
          <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[11px] text-emerald-100">
            Trusted: {trustedCount}
          </span>
          <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-[11px] text-red-200">HOT</span>
        </div>
      </div>

      <div className="scrollbar-thin max-h-[46vh] space-y-2 overflow-y-auto pr-1 lg:h-[calc(100%-2.25rem)] lg:max-h-none">
        <AnimatePresence initial={false}>
          {events.map((event) => (
            <motion.article
              key={event.id}
              layout
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="rounded-xl border border-slate-700/50 bg-slate-900/75 p-3 text-xs"
            >
              <p className="font-medium text-cyan-100">
                {event.attacker} <span className="text-slate-500">-&gt;</span> {event.target}
              </p>
              <div className="mt-1 flex items-center gap-2">
                <p className="text-[11px] tracking-wide text-red-300 uppercase">{event.attackType}</p>
                {event.source === "openrouter" ? (
                  <span className="rounded-full border border-cyan-400/40 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-cyan-100 uppercase">
                    OpenRouter AI
                  </span>
                ) : (
                  <span className="rounded-full border border-slate-600/50 bg-slate-800/70 px-2 py-0.5 text-[10px] tracking-wide text-slate-300 uppercase">
                    Simulated
                  </span>
                )}
              </div>
              <p className="mt-1 text-slate-300">{event.description}</p>
              {event.sourceUrl ? (
                <a
                  href={event.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 block truncate text-[10px] text-emerald-300 underline underline-offset-2"
                >
                  {event.sourcePublisher}: {event.sourceHeadline}
                </a>
              ) : null}
              <p className="mt-2 text-[10px] text-slate-500">
                Ingested: {new Date(event.timestamp).toLocaleString()}
              </p>
              {event.sourcePublishedAt ? (
                <p className="text-[10px] text-slate-500">
                  Source date: {new Date(event.sourcePublishedAt).toLocaleString()}
                </p>
              ) : null}
            </motion.article>
          ))}
        </AnimatePresence>
      </div>
    </aside>
  );
}
