// scripts/valorant_update.mjs
import { writeFile, mkdir } from "fs/promises";

// ---- jouw instellingen ----
const RIOT_ID = "Back to Draxon#hoi";
const REGION  = "eu";                     // pas aan als nodig: na, eu, ap, kr, latam, br
const PLAYLIST = "competitive";
const SEASON   = "5adc33fa-4f30-2899-f131-6fba64c5dd3a"; // alleen gebruikt bij TRN
// ---------------------------

const TRN = process.env.TRN_API_KEY;      // mag leeg zijn; dan gaat hij direct naar fallback
const nowISO = new Date().toISOString();

// hulpfns
const encodedId = encodeURIComponent(RIOT_ID);
const [NAME, TAG] = RIOT_ID.split("#");
const enc = (s) => encodeURIComponent(s ?? "");

async function writeOut(payload) {
  await mkdir("data", { recursive: true });
  await writeFile("data/valorant_draxon.json", JSON.stringify(payload, null, 2));
  console.log("Wrote data/valorant_draxon.json (source:", payload.source, ")");
}

// -------- 1) Probeer Tracker.gg (met key) --------
async function fetchFromTRN() {
  if (!TRN) throw new Error("TRN key ontbreekt");
  const qs = new URLSearchParams();
  if (PLAYLIST) qs.set("playlist", PLAYLIST);
  if (SEASON)   qs.set("season", SEASON);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";

  const HOSTS = [
    "https://public-api.tracker.gg/v2/valorant/standard/profile/riot",
    "https://api.tracker.gg/api/v2/valorant/standard/profile/riot",
  ];
  const headers = {
    "TRN-Api-Key": TRN,
    "Accept": "application/json",
    "User-Agent": "Moksi-Gaming GitHub Action (Valorant)"
  };

  async function getJson(url) {
    const res = await fetch(url, { headers });
    const text = await res.text();
    let json = null; try { json = JSON.parse(text); } catch {}
    if (!res.ok) {
      const msg = json?.message || json?.errors?.[0]?.message || res.statusText;
      throw new Error(`${res.status} ${res.statusText} :: ${msg}`);
    }
    return json;
  }

  let lastErr = null;
  for (const base of HOSTS) {
    try {
      const overview = await getJson(`${base}/${encodedId}${suffix}`);
      const stats = overview?.data?.segments?.[0]?.stats || {};
      let topAgent = null;
      try {
        const agents = await getJson(`${base}/${encodedId}/segments/agent${suffix}`);
        topAgent = agents?.data?.[0]?.metadata?.name ?? null;
      } catch (e) {
        console.warn("TRN agent warning:", e.message);
      }

      return {
        generatedAt: nowISO,
        riotId: RIOT_ID,
        filters: { playlist: PLAYLIST || null, season: SEASON || null },
        rank: stats?.rank?.metadata?.tierName ?? null,
        kd: stats?.kd?.displayValue ?? null,
        winrate: stats?.winPercentage?.displayValue ?? null,   // vaak bv. "52%"
        matches: stats?.matchesPlayed?.displayValue ?? null,
        topAgent,
        source: "TRN"
      };
    } catch (e) {
      lastErr = e;
      console.warn(`TRN host fail: ${base} ->`, e.message);
    }
  }
  throw lastErr || new Error("TRN failed");
}

// -------- 2) Fallback: HenrikDev (geen key) --------
async function fetchFromHenrik() {
  const base = "https://api.henrikdev.xyz/valorant";
  // Rank / MMR
  const mmrRes = await fetch(`${base}/v1/mmr/${enc(REGION)}/${enc(NAME)}/${enc(TAG)}`);
  if (!mmrRes.ok) throw new Error(`Henrik MMR ${mmrRes.status}`);
  const mmr = await mmrRes.json();

  // Recent matches (competitive), pak er 20 voor KD/winrate/top agent
  const matchesRes = await fetch(`${base}/v3/matches/${enc(REGION)}/${enc(NAME)}/${enc(TAG)}?filter=${enc(PLAYLIST)}&size=20`);
  if (!matchesRes.ok) throw new Error(`Henrik matches ${matchesRes.status}`);
  const matchesJ = await matchesRes.json();
  const games = Array.isArray(matchesJ?.data) ? matchesJ.data : [];

  let kills = 0, deaths = 0, wins = 0, total = games.length;
  const agentCount = {};
  for (const g of games) {
    const me = (g?.players?.all_players || []).find(p => `${p.name}#${p.tag}`.toLowerCase() === RIOT_ID.toLowerCase());
    if (!me) continue;
    kills += me.stats?.kills ?? 0;
    deaths += me.stats?.deaths ?? 0;
    const agent = me.character ?? me?.assets?.agent?.name;
    if (agent) agentCount[agent] = (agentCount[agent] || 0) + 1;

    const teamKey = me.team?.toLowerCase?.();
    const teamRes = g?.teams?.[teamKey]?.has_won;
    if (teamRes) wins += 1;
  }
  const kd = deaths > 0 ? (kills / deaths) : kills;
  const winratePct = total > 0 ? Math.round((wins / total) * 100) : null;
  const topAgent = Object.entries(agentCount).sort((a,b) => b[1]-a[1])[0]?.[0] ?? null;

  // rank naam uit mmr
  const rankName =
    mmr?.data?.current_data?.currenttierpatched ||
    mmr?.data?.current_data?.images?.small_text ||
    null;

  return {
    generatedAt: nowISO,
    riotId: RIOT_ID,
    filters: { playlist: PLAYLIST || null, season: SEASON || null },
    rank: rankName,
    kd: kd ? kd.toFixed(2) : null,
    winrate: winratePct !== null ? `${winratePct}%` : null,
    matches: total || null,
    topAgent,
    source: "HenrikDev"
  };
}

// -------- main --------
try {
  let payload = null;
  try {
    payload = await fetchFromTRN();
  } catch (e) {
    console.warn("TRN failed, using HenrikDev fallback:", e.message);
    payload = await fetchFromHenrik();
  }
  await writeOut(payload);
} catch (e) {
  console.error("Both sources failed:", e);
  process.exit(1);
}
