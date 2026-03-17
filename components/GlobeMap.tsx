"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ComponentType } from "react";
import { Color, TextureLoader } from "three";
import type { ConflictEvent, ImpactPulse } from "@/lib/conflict-types";

const Globe = dynamic(
  () =>
    import("react-globe.gl").then(
      (module) => module.default as ComponentType<Record<string, unknown>>,
    ),
  { ssr: false },
);

const EARTH_DAY_TEXTURE =
  "https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg";
const EARTH_BUMP_TEXTURE =
  "https://unpkg.com/three-globe/example/img/earth-topology.png";
const EARTH_NIGHT_TEXTURE =
  "https://unpkg.com/three-globe/example/img/earth-night.jpg";

interface CountryPolygon {
  properties?: {
    NAME?: string;
    name?: string;
  };
}

interface GlobeMapProps {
  events: ConflictEvent[];
  impacts: ImpactPulse[];
  selectedCountry: string | null;
  onCountrySelect: (country: string | null) => void;
}

interface SatellitePoint {
  id: string;
  lat: number;
  lng: number;
  size: number;
}

export function GlobeMap({
  events,
  impacts,
  selectedCountry,
  onCountrySelect,
}: GlobeMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const globeRef = useRef<{
    controls: () => {
      autoRotate: boolean;
      autoRotateSpeed: number;
      enableDamping: boolean;
      dampingFactor: number;
    };
    globeMaterial: () => {
      emissive: Color;
      emissiveIntensity: number;
      emissiveMap: unknown;
      needsUpdate: boolean;
    };
  } | null>(null);
  const [globeSize, setGlobeSize] = useState({ width: 800, height: 500 });
  const [countries, setCountries] = useState<CountryPolygon[]>([]);
  const [satellites, setSatellites] = useState<SatellitePoint[]>([]);

  const webglReady = useMemo<boolean | null>(() => {
    if (typeof document === "undefined") {
      return null;
    }
    const canvas = document.createElement("canvas");
    return Boolean(
      canvas.getContext("webgl2", { powerPreference: "low-power" }) ||
        canvas.getContext("webgl", { powerPreference: "low-power" }) ||
        canvas.getContext("experimental-webgl"),
    );
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const updateSize = () => {
      const width = Math.max(300, Math.min(1200, Math.floor(container.clientWidth)));
      const height = Math.max(360, Math.min(780, Math.floor(container.clientHeight)));
      setGlobeSize({ width, height });
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const t0 = Date.now();
    const tick = () => {
      const elapsed = (Date.now() - t0) / 1000;
      const next = Array.from({ length: 12 }, (_, i) => {
        const speed = 0.18 + i * 0.02;
        const lng = ((elapsed * 55 * speed + i * 30) % 360) - 180;
        const lat = Math.sin(elapsed * speed + i) * (50 - (i % 4) * 6);
        return { id: `sat-${i}`, lat, lng, size: 0.12 + (i % 3) * 0.04 };
      });
      setSatellites(next);
    };

    const interval = setInterval(tick, 250);
    tick();
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    void fetch(
      "https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson",
      { cache: "force-cache" },
    )
      .then((response) => response.json())
      .then((json: { features: CountryPolygon[] }) =>
        setCountries(json.features ?? []),
      )
      .catch(() => setCountries([]));
  }, []);

  useEffect(() => {
    if (!globeRef.current) {
      return;
    }
    globeRef.current.controls().autoRotate = true;
    globeRef.current.controls().autoRotateSpeed = 0.34;
    globeRef.current.controls().enableDamping = true;
    globeRef.current.controls().dampingFactor = 0.05;

    const material = globeRef.current.globeMaterial();
    material.emissive = new Color("#1f2937");
    material.emissiveIntensity = 0.8;
    material.emissiveMap = new TextureLoader().load(EARTH_NIGHT_TEXTURE);
    material.needsUpdate = true;
  }, []);

  const arcsData = useMemo(
    () =>
      events.map((event) => ({
        ...event,
        color:
          event.attackType === "missile"
            ? "#fb7185"
            : event.attackType === "drone"
              ? "#f97316"
              : "#38bdf8",
      })),
    [events],
  );

  const heatPoints = useMemo(
    () =>
      events.map((event) => ({
        lat: event.endLat,
        lng: event.endLng,
        weight:
          event.attackType === "missile"
            ? 3
            : event.attackType === "airstrike"
              ? 2
              : 1,
      })),
    [events],
  );

  const impactPoints = useMemo(
    () =>
      impacts.map((impact) => ({
        ...impact,
        color:
          impact.attackType === "missile"
            ? "#f43f5e"
            : impact.attackType === "drone"
              ? "#fb7185"
              : "#f97316",
      })),
    [impacts],
  );

  const radarRing = useMemo(() => [{ lat: 18, lng: -20, maxR: 18 }], []);
  const selectedCountryInsights = useMemo(() => {
    if (!selectedCountry) {
      return { targeted: 0, outgoing: 0 };
    }
    let targeted = 0;
    let outgoing = 0;
    for (const event of events) {
      if (event.target === selectedCountry) {
        targeted += 1;
      }
      if (event.attacker === selectedCountry) {
        outgoing += 1;
      }
    }
    return { targeted, outgoing };
  }, [events, selectedCountry]);

  const selectedCountryRings = useMemo(
    () =>
      selectedCountry
        ? events
            .filter(
              (event) =>
                event.target === selectedCountry || event.attacker === selectedCountry,
            )
            .slice(0, 12)
            .map((event) => ({
              lat: event.endLat,
              lng: event.endLng,
              maxR: 16,
              selectedCountryFocus: true,
            }))
        : [],
    [events, selectedCountry],
  );

  return (
    <div
      ref={containerRef}
      className={`relative h-full min-h-[420px] overflow-hidden rounded-2xl border bg-slate-950/70 sm:min-h-[500px] lg:min-h-0 ${
        selectedCountry
          ? "country-focus-glow border-cyan-300/70"
          : "border-cyan-500/30"
      }`}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(56,189,248,0.12),transparent_38%),radial-gradient(circle_at_70%_80%,rgba(244,63,94,0.14),transparent_35%)]" />
      <div className="radar-overlay pointer-events-none absolute inset-0 z-10" />
      {selectedCountry ? (
        <div className="absolute top-3 left-3 z-20 rounded-xl border border-cyan-300/45 bg-slate-950/85 px-3 py-2 text-[11px] shadow-[0_0_24px_rgba(56,189,248,0.35)] backdrop-blur">
          <p className="tracking-[0.14em] text-cyan-100 uppercase">
            Focus: {selectedCountry}
          </p>
          <p className="mt-1 text-slate-300">
            Incoming attacks:{" "}
            <span className="font-semibold text-red-300">
              {selectedCountryInsights.targeted}
            </span>
          </p>
          <p className="text-slate-300">
            Outgoing attacks:{" "}
            <span className="font-semibold text-amber-300">
              {selectedCountryInsights.outgoing}
            </span>
          </p>
        </div>
      ) : null}

      <div className="flex h-full w-full items-center justify-center">
        {webglReady === false ? (
          <div className="mx-4 w-full max-w-md rounded-xl border border-cyan-500/30 bg-slate-900/80 p-4 text-sm text-slate-200">
            <p className="font-semibold text-cyan-200">3D Globe Unavailable</p>
            <p className="mt-2 text-slate-300">
              This device/browser could not create a WebGL context. Try reducing open tabs, disabling battery saver,
              or using a different browser.
            </p>
          </div>
        ) : (
          <Globe
            ref={globeRef}
            width={globeSize.width}
            height={globeSize.height}
            rendererConfig={{ antialias: false, powerPreference: "low-power", precision: "mediump" }}
            backgroundColor="rgba(2, 6, 23, 0.9)"
            globeImageUrl={EARTH_DAY_TEXTURE}
            bumpImageUrl={EARTH_BUMP_TEXTURE}
            showAtmosphere
            atmosphereColor="#60a5fa"
            atmosphereAltitude={0.18}
            polygonsData={countries}
            polygonCapColor={(polygon: CountryPolygon) => {
              const name =
                polygon.properties?.NAME ?? polygon.properties?.name ?? "";
              if (selectedCountry && selectedCountry === name) {
                return "rgba(34, 211, 238, 0.68)";
              }
              return "rgba(59, 130, 246, 0.08)";
            }}
            polygonSideColor={(polygon: CountryPolygon) => {
              const name =
                polygon.properties?.NAME ?? polygon.properties?.name ?? "";
              return selectedCountry && selectedCountry === name
                ? "rgba(34, 211, 238, 0.22)"
                : "rgba(2, 132, 199, 0.08)";
            }}
            polygonStrokeColor={(polygon: CountryPolygon) => {
              const name =
                polygon.properties?.NAME ?? polygon.properties?.name ?? "";
              return selectedCountry && selectedCountry === name
                ? "rgba(103, 232, 249, 0.9)"
                : "rgba(56, 189, 248, 0.3)";
            }}
            polygonLabel={(polygon: CountryPolygon) =>
              polygon.properties?.NAME ?? polygon.properties?.name ?? "Unknown"
            }
            onPolygonClick={(polygon: CountryPolygon) =>
              onCountrySelect(
                polygon.properties?.NAME ?? polygon.properties?.name ?? null,
              )
            }
            arcsData={arcsData}
            arcStartLat="startLat"
            arcStartLng="startLng"
            arcEndLat="endLat"
            arcEndLng="endLng"
            arcColor="color"
            arcAltitude={(arc: { attackType: string }) =>
              arc.attackType === "missile" ? 0.31 : 0.18
            }
            arcStroke={0.55}
            arcDashLength={0.32}
            arcDashGap={0.62}
            arcDashInitialGap={() => Math.random()}
            arcDashAnimateTime={1300}
            arcLabel={(event: ConflictEvent) =>
              `<b>${event.attacker}</b> -> <b>${event.target}</b><br/>${event.attackType}<br/>${event.description}`
            }
            pointsData={[...impactPoints, ...satellites]}
            pointLat="lat"
            pointLng="lng"
            pointColor={(point: { color?: string }) => point.color ?? "#93c5fd"}
            pointAltitude={(point: { size?: number }) => point.size ?? 0.04}
            pointRadius={(point: { size?: number }) => point.size ?? 0.08}
            pointsMerge
            ringsData={[...impactPoints, ...selectedCountryRings, ...radarRing]}
            ringLat="lat"
            ringLng="lng"
            ringColor={(ring: { color?: string; selectedCountryFocus?: boolean }) =>
              () =>
                ring.selectedCountryFocus
                  ? "rgba(34, 211, 238, 0.88)"
                  : ring.color ?? "rgba(239, 68, 68, 0.7)"
            }
            ringMaxRadius={(ring: { maxR?: number }) => ring.maxR ?? 8}
            ringPropagationSpeed={(ring: { maxR?: number; selectedCountryFocus?: boolean }) =>
              ring.selectedCountryFocus ? 1.9 : ring.maxR ? 1.2 : 2.6
            }
            ringRepeatPeriod={(ring: { maxR?: number; selectedCountryFocus?: boolean }) =>
              ring.selectedCountryFocus ? 760 : ring.maxR ? 900 : 1300
            }
            hexBinPointsData={heatPoints}
            hexBinPointLat="lat"
            hexBinPointLng="lng"
            hexBinPointWeight="weight"
            hexAltitude={0.025}
            hexTopColor={() => "rgba(248, 113, 113, 0.58)"}
            hexSideColor={() => "rgba(248, 113, 113, 0.15)"}
            hexBinResolution={3}
          />
        )}
      </div>
    </div>
  );
}
