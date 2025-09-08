// scripts/valorant_update.mjs
import { writeFile, mkdir } from "fs/promises";

const RIOT_ID = "Back to Draxon#hoi";
const PLAYLIST = "competitive";
const SEASON   = "5adc33fa-4f30-2899-f131-6fba64c5dd3a";

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

// Twee mogelijke hosts:
const HOSTS = [
  // officiële public host
  { base: "https://public-api.tracker.gg/v2/valorant/standard/profile/riot", agents: true, overview: true },
  // alternatieve host (sommige keys werken alleen hier)
  { base: "https://api.tracker.gg/api/v2/valorant/standard/profile/riot", agents: true, overview: true }
];

const commonHeaders = {
  "TRN-Api-Key": TRN,
  "Accept": "application/json",
  "User-Agent": "Moksi-Gaming GitHub Action (Valorant)"
};

async function trnGet(url) {
  const res = await fetch(url, { headers: commonHeaders });
  const text = await res.text(); // lees body altijd voor debug
  let json = null;
  try { json = JSON.parse(text); } catch {}
  if (!res.ok) {
    const msg = json?.message || json?.errors?.[0]?.message || text || res.statusText;
    throw new Error(`${res.status} ${res.statusText} :: ${msg}`);
  }
  return json;
}

async function tryHosts() {
  let lastErr = null;
  for (const h of HOSTS) {
    try {
      const profUrl   = `${h.base}/${encoded}${suffix}`;
      const agentsUrl = `${h.base}/${encoded}/segments/agent${suffix}`;

      const prof = await trnGet(profUrl);
      const seg  = prof?.data?.segments?.[0]?.stats || {};

      let topAgent = null;
      try {
        const agents = await trnGet(agentsUrl);
        topAgent = agents?.data?.[0]?.metadata?.name ?? null;
      } catch (e) {
        console.warn("Agent endpoint warning:", e.message);
      }

      return {
        generatedAt: nowISO,
        riotId: RIOT_ID,
        filters: { playlist: PLAYLIST || null, season: SEASON || null },
        rank: seg?.rank?.metadata?.tierName ?? null,
        kd: seg?.kd?.displayValue ?? null,
        winrate: seg?.winPercentage?.displayValue ?? null,
        matches: seg?.matchesPlayed?.displayValue ?? null,
        topAgent
      };
    } catch (e) {
      lastErr = e;
      console.warn(`Host failed (${h.base}):`, e.message);
    }
  }
  throw lastErr || new Error("All hosts failed");
}

const payload = await tryHosts();

await mkdir("data", { recursive: true });
await writeFile("data/valorant_draxon.json", JSON.stringify(payload, null, 2));
console.log("Wrote data/valorant_draxon.json");
