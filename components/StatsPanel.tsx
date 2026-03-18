"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";
import type { AttackType, ConflictStats } from "@/lib/conflict-types";
import { CountryNameWithFlag } from "@/components/CountryNameWithFlag";

export type DateRangeFilter = "today" | "current" | "7d" | "30d" | "all";

interface StatsPanelProps {
  stats: ConflictStats;
  selectedCountry: string | null;
  activeTypes: AttackType[];
  dateRange: DateRangeFilter;
  onCountryReset: () => void;
  onToggleType: (type: AttackType) => void;
  onDateRangeChange: (range: DateRangeFilter) => void;
}

const attackTypes: AttackType[] = ["missile", "drone", "airstrike"];
const dateRanges: Array<{ id: DateRangeFilter; label: string }> = [
  { id: "today", label: "Today" },
  { id: "current", label: "Latest Events" },
  { id: "7d", label: "7 Days" },
  { id: "30d", label: "30 Days" },
  { id: "all", label: "All" },
];

export function StatsPanel({
  stats,
  selectedCountry,
  activeTypes,
  dateRange,
  onCountryReset,
  onToggleType,
  onDateRangeChange,
}: StatsPanelProps) {
  const alertColor =
    stats.globalAlertLevel === "CRITICAL"
      ? "text-red-400"
      : stats.globalAlertLevel === "HIGH"
        ? "text-orange-300"
        : stats.globalAlertLevel === "ELEVATED"
          ? "text-yellow-300"
          : "text-emerald-300";
  return (
    <motion.div
      initial={{ y: -14, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="rounded-2xl border border-cyan-500/30 bg-slate-950/75 p-3 backdrop-blur sm:p-4"
    >
      <div className="grid grid-cols-2 gap-3 text-xs md:grid-cols-4">
        <StatCard
          title="Total Attacks (Range)"
          value={String(stats.totalAttacksToday)}
        />
        <StatCard
          title="Most Targeted"
          value={<CountryNameWithFlag country={stats.mostTargetedCountry} />}
        />
        <StatCard
          title="Most Active Attacker"
          value={<CountryNameWithFlag country={stats.mostActiveAttacker} />}
        />
        <StatCard
          title="Global Alert"
          value={stats.globalAlertLevel}
          valueClassName={alertColor}
        />
      </div>

      <div className="mt-4 space-y-2 text-xs">
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {dateRanges.map((range) => {
            const selected = dateRange === range.id;
            return (
              <button
                key={range.id}
                type="button"
                onClick={() => onDateRangeChange(range.id)}
                className={`shrink-0 rounded-full border px-3 py-1 tracking-wide whitespace-nowrap transition ${
                  selected
                    ? "border-emerald-300/60 bg-emerald-400/10 text-emerald-200"
                    : "border-slate-500/50 bg-slate-900/70 text-slate-400"
                }`}
              >
                {range.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {attackTypes.map((type) => {
            const enabled = activeTypes.includes(type);
            return (
              <button
                key={type}
                type="button"
                onClick={() => onToggleType(type)}
                className={`shrink-0 rounded-full border px-3 py-1 tracking-wider uppercase whitespace-nowrap transition ${
                  enabled
                    ? "border-cyan-300/60 bg-cyan-400/10 text-cyan-200"
                    : "border-slate-500/50 bg-slate-900/70 text-slate-400"
                }`}
              >
                {type}
              </button>
            );
          })}
          {selectedCountry && (
            <button
              type="button"
              onClick={onCountryReset}
              className="shrink-0 rounded-full border border-red-400/40 bg-red-500/10 px-3 py-1 text-red-200 whitespace-nowrap"
            >
              Clear country filter:{" "}
              <CountryNameWithFlag country={selectedCountry} />
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function StatCard({
  title,
  value,
  valueClassName,
}: {
  title: string;
  value: ReactNode;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-700/60 bg-slate-900/85 px-3 py-2">
      <p className="text-[10px] tracking-wide text-slate-400 uppercase">
        {title}
      </p>
      <p
        className={`mt-1 truncate text-sm font-semibold text-slate-100 sm:text-base ${valueClassName ?? ""}`}
      >
        {value}
      </p>
    </div>
  );
}
