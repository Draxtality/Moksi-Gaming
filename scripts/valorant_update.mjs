// scripts/valorant_update.mjs
import { writeFile, mkdir } from "fs/promises";

// ---- jouw settings ----
const RIOT_ID = "Back to Draxon#hoi";
const PLAYLIST = "competitive";
const SEASON   = "5adc33fa-4f30-2899-f131-6fba64c5dd3a";
// -----------------------

const TRN = process.env.TRN_API_KEY;
if (!TRN) {
  console.error("Missing TRN_API_KEY env (repo secret).");
  process.exit(1);
}

const nowISO = new Date().toISOString();
const encoded = encodeURIComponent(RIOT_ID);
const qs = new URLSearchParams();
if (PLAYLIST) qs.set("playlist", PLAYLIST);
if (SEASON)   qs.set("season", SEASON);
const suffix = qs.toString() ? `?${qs.toString()}` : "";

const base = "https://public-api.tracker.gg/v2/valorant/standard/profile/riot";
const headers = { "TRN-Api-Key": TRN };

// overview
const profRes = await fetch(`${base}/${encoded}${suffix}`, { headers });
if (!profRes.ok) throw new Error(`Profile: ${profRes.status} ${profRes.statusText}`);
const prof = await profRes.json();
const seg = prof?.data?.segments?.[0]?.stats || {};

// top agent
let topAgent = null;
try {
  const agentRes = await fetch(`${base}/${encoded}/segments/agent${suffix}`, { headers });
  if (agentRes.ok) {
    const agents = await agentRes.json();
    topAgent = agents?.data?.[0]?.metadata?.name ?? null;
  }
} catch {}

// output JSON
const payload = {
  generatedAt: nowISO,
  riotId: RIOT_ID,
  filters: { playlist: PLAYLIST || null, season: SEASON || null },
  rank: seg?.rank?.metadata?.tierName ?? null,
  kd: seg?.kd?.displayValue ?? null,
  winrate: seg?.winPercentage?.displayValue ?? null,
  matches: seg?.matchesPlayed?.displayValue ?? null,
  topAgent,
};

await mkdir("data", { recursive: true });
await writeFile("data/valorant_draxon.json", JSON.stringify(payload, null, 2));
console.log("Wrote data/valorant_draxon.json");
