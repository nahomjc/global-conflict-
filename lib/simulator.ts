import { randomUUID } from "crypto";
import type { AttackType, ConflictEvent } from "@/lib/conflict-types";

interface CityNode {
  country: string;
  city: string;
  lat: number;
  lng: number;
}

const CITY_NODES: CityNode[] = [
  { country: "United States", city: "Washington", lat: 38.9072, lng: -77.0369 },
  { country: "United Kingdom", city: "London", lat: 51.5072, lng: -0.1276 },
  { country: "France", city: "Paris", lat: 48.8566, lng: 2.3522 },
  { country: "Germany", city: "Berlin", lat: 52.52, lng: 13.405 },
  { country: "Ukraine", city: "Kyiv", lat: 50.4501, lng: 30.5234 },
  { country: "Russia", city: "Moscow", lat: 55.7558, lng: 37.6176 },
  { country: "India", city: "New Delhi", lat: 28.6139, lng: 77.209 },
  { country: "Pakistan", city: "Islamabad", lat: 33.6844, lng: 73.0479 },
  { country: "China", city: "Beijing", lat: 39.9042, lng: 116.4074 },
  { country: "Japan", city: "Tokyo", lat: 35.6762, lng: 139.6503 },
  { country: "South Korea", city: "Seoul", lat: 37.5665, lng: 126.978 },
  { country: "Iran", city: "Tehran", lat: 35.6892, lng: 51.389 },
  { country: "Israel", city: "Jerusalem", lat: 31.7683, lng: 35.2137 },
  { country: "Saudi Arabia", city: "Riyadh", lat: 24.7136, lng: 46.6753 },
  { country: "Turkey", city: "Ankara", lat: 39.9334, lng: 32.8597 },
  { country: "Egypt", city: "Cairo", lat: 30.0444, lng: 31.2357 },
  { country: "Ethiopia", city: "Addis Ababa", lat: 8.9806, lng: 38.7578 },
  { country: "Nigeria", city: "Abuja", lat: 9.0765, lng: 7.3986 },
  { country: "South Africa", city: "Pretoria", lat: -25.7479, lng: 28.2293 },
  { country: "Brazil", city: "Brasilia", lat: -15.7939, lng: -47.8828 },
];

const ATTACK_TYPES: AttackType[] = ["missile", "drone", "airstrike"];

function pick<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

function randomOffset() {
  return (Math.random() - 0.5) * 0.8;
}

export function generateSimulatedEvent(): ConflictEvent {
  const attacker = pick(CITY_NODES);
  let target = pick(CITY_NODES);
  while (target.country === attacker.country) {
    target = pick(CITY_NODES);
  }

  const attackType = pick(ATTACK_TYPES);

  return {
    id: randomUUID(),
    attacker: attacker.country,
    target: target.country,
    startLat: attacker.lat + randomOffset(),
    startLng: attacker.lng + randomOffset(),
    endLat: target.lat + randomOffset(),
    endLng: target.lng + randomOffset(),
    attackType,
    timestamp: new Date().toISOString(),
    description: `${attackType.toUpperCase()} strike reported from ${attacker.city} toward ${target.city}.`,
    source: "simulation",
    verification: "unverified",
    sourcePublisher: "Simulator",
    sourceUrl: "",
    sourceHeadline: "Synthetic simulation event",
    evidenceQuote: "simulation",
    sourcePublishedAt: "",
  };
}
