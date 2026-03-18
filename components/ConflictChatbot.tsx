"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
};

const INITIAL_MESSAGE: ChatMessage = {
  id: "intro",
  role: "assistant",
  text: [
    "Conflict Assistant online.",
    "I only answer questions about conflicts and wars (airstrikes, drones, missiles, battles, ceasefires).",
    "Each answer includes a Bible verse connected to conflict.",
  ].join("\n\n"),
};

export function ConflictChatbot() {
  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_MESSAGE]);
  const [question, setQuestion] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [showHint, setShowHint] = useState(false);

  const canSend = useMemo(
    () => question.trim().length > 0 && !isLoading,
    [isLoading, question],
  );

  useEffect(() => {
    const storageKey = "conflict-chat-hint-seen";
    const hasSeenHint = window.localStorage.getItem(storageKey) === "true";
    if (hasSeenHint) {
      return;
    }

    setShowHint(true);
    const timer = window.setTimeout(() => {
      setShowHint(false);
      window.localStorage.setItem(storageKey, "true");
    }, 4200);

    return () => window.clearTimeout(timer);
  }, []);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = question.trim();
    if (!trimmed || isLoading) {
      return;
    }

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      text: trimmed,
    };
    setMessages((previous) => [...previous, userMessage]);
    setQuestion("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: trimmed }),
      });
      const payload = (await response.json()) as { answer?: string };

      setMessages((previous) => [
        ...previous,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text:
            payload.answer ??
            "I can only help with conflict and war topics. Please try again.",
        },
      ]);
    } catch {
      setMessages((previous) => [
        ...previous,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: "Connection issue. Ask again about wars/conflicts and I will respond.",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <div className="group fixed right-4 bottom-4 z-50">
        <div
          className={`pointer-events-none absolute right-0 -top-10 rounded-md border border-cyan-300/30 bg-slate-900/95 px-3 py-1.5 text-[11px] font-medium text-cyan-100 shadow-lg shadow-black/60 transition ${
            showHint
              ? "opacity-100"
              : "opacity-0 group-hover:-translate-y-0.5 group-hover:opacity-100 group-focus-within:-translate-y-0.5 group-focus-within:opacity-100"
          }`}
        >
          Chat with the AI
        </div>
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          aria-expanded={isOpen}
          aria-controls="conflict-chat-panel"
          aria-label={isOpen ? "Close conflict chat" : "Open conflict chat"}
          className="inline-flex h-12 items-center gap-2 rounded-full border border-cyan-300/60 bg-linear-to-b from-slate-800/95 to-slate-950/95 px-4 text-cyan-100 shadow-xl shadow-slate-950/80 backdrop-blur transition hover:-translate-y-0.5 hover:border-cyan-200/80"
        >
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(74,222,128,0.95)]" />
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 3v3" />
            <rect x="5" y="6" width="14" height="12" rx="3" />
            <circle cx="9.5" cy="11.5" r="1" />
            <circle cx="14.5" cy="11.5" r="1" />
            <path d="M9 15h6" />
            <path d="M3 10h2" />
            <path d="M19 10h2" />
          </svg>
          <span className="text-[11px] font-semibold tracking-[0.08em] uppercase">
            Chat with AI
          </span>
        </button>
      </div>

      <section
        id="conflict-chat-panel"
        className={`fixed right-4 bottom-20 z-50 w-[calc(100vw-2rem)] max-w-md overflow-hidden rounded-2xl border border-slate-700/90 bg-linear-to-b from-slate-900/95 to-slate-950/95 shadow-2xl shadow-black/70 backdrop-blur transition-all duration-200 ${
          isOpen
            ? "pointer-events-auto translate-y-0 opacity-100"
            : "pointer-events-none translate-y-3 opacity-0"
        }`}
      >
        <div className="pointer-events-none absolute right-6 bottom-0 left-6 h-[2px] rounded-full bg-cyan-300/80 shadow-[0_0_18px_rgba(34,211,238,0.9)]" />
        <div className="border-b border-slate-800/90 bg-slate-900/75 px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] tracking-[0.16em] text-cyan-200 uppercase">
                Operational Assistant
              </p>
              <h3 className="mt-0.5 text-sm font-semibold text-slate-100">
                Conflict Analysis Chat
              </h3>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                Wars and conflict topics only. Includes a Bible verse in each
                response.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-[10px] font-medium tracking-[0.08em] text-slate-300 uppercase transition hover:border-cyan-300/70 hover:text-cyan-100"
            >
              Close
            </button>
          </div>
        </div>

        <div className="space-y-3 px-4 pt-3 pb-4">
          <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 px-3 py-2 text-[11px] text-cyan-100">
            Scope notice: Non-conflict requests are refused automatically.
          </div>

          <div className="scrollbar-thin max-h-64 space-y-2 overflow-y-auto rounded-xl border border-slate-800/90 bg-slate-950/50 p-2.5 sm:max-h-72">
          {messages.map((message) => (
            <article
              key={message.id}
              className={`rounded-lg border px-3 py-2.5 text-xs leading-relaxed whitespace-pre-wrap ${
                message.role === "assistant"
                  ? "border-cyan-500/25 bg-cyan-500/10 text-cyan-50"
                  : "border-slate-700 bg-slate-800/80 text-slate-100"
              }`}
            >
              <p className="mb-1 text-[10px] font-semibold tracking-widest uppercase opacity-80">
                {message.role === "assistant" ? "Assistant" : "You"}
              </p>
              <p>{message.text}</p>
            </article>
          ))}
          {isLoading ? (
            <article className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-100">
              Processing conflict response...
            </article>
          ) : null}
          </div>

          <form onSubmit={onSubmit} className="space-y-2">
            <textarea
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              rows={3}
              placeholder="Ask about airstrikes, drones, wars, battle zones, or ceasefires..."
              className="w-full resize-none rounded-xl border border-slate-700 bg-slate-900/85 px-3 py-2.5 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-400/80 focus:ring-2 focus:ring-cyan-500/20"
            />
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-slate-500">
                Professional scope: conflict intelligence only.
              </p>
              <button
                type="submit"
                disabled={!canSend}
                className="rounded-full border border-cyan-300/70 bg-cyan-500/15 px-4 py-2 text-[11px] font-semibold tracking-[0.08em] text-cyan-100 uppercase transition hover:border-cyan-200 hover:bg-cyan-500/25 disabled:cursor-not-allowed disabled:opacity-45"
              >
                Send
              </button>
            </div>
          </form>
        </div>
      </section>
    </>
  );
}
