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
  const [countries, setCountries] = useState<CountryPolygon[]>([]);
  const [satellites, setSatellites] = useState<SatellitePoint[]>([]);

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

  return (
    <div className="relative h-full min-h-[420px] overflow-hidden rounded-2xl border border-cyan-500/30 bg-slate-950/70 sm:min-h-[500px] lg:min-h-[560px]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(56,189,248,0.12),transparent_38%),radial-gradient(circle_at_70%_80%,rgba(244,63,94,0.14),transparent_35%)]" />
      <div className="radar-overlay pointer-events-none absolute inset-0 z-10" />

      <div className="h-full w-full translate-x-0 sm:-translate-x-[10%] md:-translate-x-[18%] lg:-translate-x-[30%]">
        <Globe
          ref={globeRef}
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
              return "rgba(56, 189, 248, 0.45)";
            }
            return "rgba(59, 130, 246, 0.08)";
          }}
          polygonSideColor={() => "rgba(2, 132, 199, 0.08)"}
          polygonStrokeColor={() => "rgba(56, 189, 248, 0.3)"}
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
          ringsData={[...impactPoints, ...radarRing]}
          ringLat="lat"
          ringLng="lng"
          ringColor={(ring: { color?: string }) => () =>
            ring.color ?? "rgba(239, 68, 68, 0.7)"
          }
          ringMaxRadius={(ring: { maxR?: number }) => ring.maxR ?? 8}
          ringPropagationSpeed={(ring: { maxR?: number }) =>
            ring.maxR ? 1.2 : 2.6
          }
          ringRepeatPeriod={(ring: { maxR?: number }) =>
            ring.maxR ? 900 : 1300
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
      </div>
    </div>
  );
}
