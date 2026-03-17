"use client";

import { motion, AnimatePresence } from "framer-motion";

interface IntroLoaderProps {
  visible: boolean;
}

export function IntroLoader({ visible }: IntroLoaderProps) {
  return (
    <AnimatePresence>
      {visible ? (
        <motion.div
          key="intro-loader"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.6, ease: "easeInOut" } }}
          className="fixed inset-0 z-[120] flex items-center justify-center overflow-y-auto bg-slate-950 p-3 sm:p-5"
        >
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(34,211,238,0.2),transparent_38%),radial-gradient(circle_at_80%_75%,rgba(244,63,94,0.15),transparent_35%)]" />
          <div className="pointer-events-none absolute inset-0 opacity-60 [background-image:linear-gradient(rgba(56,189,248,0.07)_1px,transparent_1px),linear-gradient(90deg,rgba(56,189,248,0.07)_1px,transparent_1px)] [background-size:34px_34px]" />

          <motion.div
            initial={{ scale: 0.96, opacity: 0 }}
            animate={{ scale: 1, opacity: 1, transition: { duration: 0.55 } }}
            className="relative w-full max-w-[520px] rounded-2xl border border-cyan-500/35 bg-slate-900/70 p-4 shadow-[0_0_50px_rgba(56,189,248,0.2)] backdrop-blur sm:p-6"
          >
            <p className="text-center text-[10px] tracking-[0.22em] text-cyan-200 uppercase sm:text-xs sm:tracking-[0.34em]">
              Conflict Command
            </p>
            <h1 className="mt-2 text-center text-lg font-semibold tracking-[0.08em] text-slate-100 uppercase sm:text-2xl sm:tracking-[0.14em]">
              Strategic Intelligence Grid
            </h1>

            <div className="mt-5 h-2 overflow-hidden rounded-full border border-cyan-400/35 bg-slate-950/80 sm:mt-6">
              <motion.div
                className="h-full w-[40%] bg-gradient-to-r from-cyan-300 via-cyan-500 to-blue-400"
                initial={{ x: "-120%" }}
                animate={{ x: "300%" }}
                transition={{ duration: 1.65, repeat: Number.POSITIVE_INFINITY, ease: "linear" }}
              />
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-1 text-[10px] tracking-[0.12em] text-slate-300 uppercase sm:text-[11px] sm:tracking-[0.18em]">
              <span className="max-w-[75%]">Initializing Globe Core</span>
              <span className="text-cyan-200">Online</span>
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-1 text-[10px] tracking-[0.12em] text-slate-300 uppercase sm:text-[11px] sm:tracking-[0.18em]">
              <span className="max-w-[75%]">Syncing Trusted Intel Sources</span>
              <span className="text-cyan-200">Scanning</span>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
