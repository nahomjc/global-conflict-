"use client";

import { useMemo, useState } from "react";
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

  const canSend = useMemo(
    () => question.trim().length > 0 && !isLoading,
    [isLoading, question],
  );

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
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-controls="conflict-chat-panel"
        className="fixed right-4 bottom-4 z-50 rounded-full border border-cyan-400/70 bg-cyan-500/20 px-4 py-2 text-xs font-semibold tracking-[0.08em] text-cyan-100 uppercase shadow-lg shadow-cyan-950/50 backdrop-blur transition hover:border-cyan-300 hover:bg-cyan-500/30"
      >
        {isOpen ? "Close Chat" : "AI Chat"}
      </button>

      <section
        id="conflict-chat-panel"
        className={`fixed right-4 bottom-20 z-50 w-[calc(100vw-2rem)] max-w-md rounded-2xl border border-cyan-500/35 bg-slate-950/95 p-4 shadow-2xl backdrop-blur transition-all sm:p-5 ${
          isOpen
            ? "pointer-events-auto translate-y-0 opacity-100"
            : "pointer-events-none translate-y-3 opacity-0"
        }`}
      >
        <div className="mb-3">
          <p className="text-[11px] tracking-[0.18em] text-cyan-200 uppercase">
            AI Conflict Chat
          </p>
          <p className="mt-1 text-xs text-slate-300">
            Scope: conflicts and wars only. Non-conflict requests are refused.
          </p>
        </div>

        <div className="scrollbar-thin mb-3 max-h-64 space-y-2 overflow-y-auto rounded-xl border border-slate-700/70 bg-slate-900/70 p-2 sm:max-h-72">
          {messages.map((message) => (
            <article
              key={message.id}
              className={`rounded-lg border px-3 py-2 text-xs whitespace-pre-wrap ${
                message.role === "assistant"
                  ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-100"
                  : "border-slate-600/80 bg-slate-800/80 text-slate-100"
              }`}
            >
              <p className="mb-1 text-[10px] tracking-[0.12em] uppercase opacity-70">
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
            placeholder="Ask about airstrikes, drones, wars, battle zones, ceasefires..."
            className="w-full resize-none rounded-lg border border-slate-600/70 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-400/80"
          />
          <button
            type="submit"
            disabled={!canSend}
            className="rounded-full border border-cyan-400/60 bg-cyan-500/10 px-4 py-2 text-xs font-semibold tracking-[0.08em] text-cyan-100 uppercase transition hover:border-cyan-300/80 hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-45"
          >
            Send Question
          </button>
        </form>
      </section>
    </>
  );
}
