export type AttackType = "missile" | "drone" | "airstrike";
export type EventSource = "openrouter" | "simulation";
export type VerificationLevel = "trusted" | "unverified";

export interface ConflictEvent {
  id: string;
  attacker: string;
  target: string;
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  attackType: AttackType;
  timestamp: string;
  description: string;
  source: EventSource;
  verification: VerificationLevel;
  sourcePublisher: string;
  sourceUrl: string;
  sourceHeadline: string;
  evidenceQuote: string;
  sourcePublishedAt: string;
}

export interface ConflictStats {
  totalAttacksToday: number;
  mostTargetedCountry: string;
  mostActiveAttacker: string;
  globalAlertLevel: "LOW" | "ELEVATED" | "HIGH" | "CRITICAL";
}

export interface ImpactPulse {
  id: string;
  lat: number;
  lng: number;
  eventId: string;
  attackType: AttackType;
  createdAt: number;
}
