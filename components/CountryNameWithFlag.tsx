import * as FlagIcons from "country-flag-icons/react/3x2";
import type { ReactElement, SVGProps } from "react";
import { getCountryDisplay } from "@/lib/country-display";

type FlagComponent = (props: SVGProps<SVGSVGElement>) => ReactElement;

export function CountryNameWithFlag({
  country,
  className = "",
}: {
  country: string;
  className?: string;
}) {
  const { name, code } = getCountryDisplay(country);
  const Flag = code
    ? ((FlagIcons as Record<string, FlagComponent>)[code] ?? null)
    : null;

  return (
    <span className={`inline-flex items-center gap-1 ${className}`.trim()}>
      {Flag ? (
        <Flag className="inline-block h-3.5 w-5 rounded-[2px] border border-slate-700/70 object-cover" />
      ) : (
        <span aria-hidden="true">🏳️</span>
      )}
      <span>{name}</span>
    </span>
  );
}
