// Fetches stats from ESPN's public JSON feeds, in two parts:
//   fetchLeague()  – every team's offense, points allowed, and every defender's season stats
//   fetchTeam(abbr) – one team's roster, depth chart and schedule
// Used by the browser ("Refresh live") and by scripts/fetch-stats.mjs (weekly GitHub Action).
// These feeds are unofficial and can change shape; every field read here falls back to null.

const SITE = "https://site.api.espn.com/apis/site/v2/sports/football/nfl";
const WEB = "https://site.web.api.espn.com/apis/common/v3/sports/football/nfl";

// ESPN's team list feed blocks browsers, so ids are fixed here (they don't change).
export const TEAM_IDS = {
  ARI: 22, ATL: 1, BAL: 33, BUF: 2, CAR: 29, CHI: 3, CIN: 4, CLE: 5, DAL: 6, DEN: 7, DET: 8, GB: 9,
  HOU: 34, IND: 11, JAX: 30, KC: 12, LV: 13, LAC: 24, LAR: 14, MIA: 15, MIN: 16, NE: 17, NO: 18,
  NYG: 19, NYJ: 20, PHI: 21, PIT: 23, SF: 25, SEA: 26, TB: 27, TEN: 10, WSH: 28,
};
export const DEF_POS = {
  DE: "DE", EDGE: "DE", DT: "DT", NT: "DT", LB: "LB", OLB: "LB", ILB: "LB", MLB: "LB",
  WLB: "LB", SLB: "LB", CB: "CB", DB: "CB", S: "S", SS: "S", FS: "S", SAF: "S",
};

export const OFF_POS = { QB: "QB", RB: "RB", FB: "RB", HB: "RB", WR: "WR", TE: "TE", OT: "OL", T: "OL", G: "OL", OG: "OL", C: "OL", OL: "OL" };

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function getJSON(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return await r.json();
      if (r.status === 404) return null;
    } catch (e) { if (i === tries - 1) throw e; }
    await sleep(400 * (i + 1));
  }
  throw new Error("ESPN request failed: " + url);
}
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); }
  }));
  return out;
}
function flatStats(categories) {
  const m = {};
  for (const c of categories || []) for (const s of c.stats || []) {
    const k = c.name + "." + s.name;
    if (!(k in m) && s.value !== null && s.value !== undefined) m[k] = s.value;
  }
  return m;
}
const num = x => (typeof x === "number" && isFinite(x) ? x : null);
const toNum = x => { const v = parseFloat(String(x).replace(/,/g, "")); return isFinite(v) ? v : 0; };

export async function fetchLeague({ onProgress = () => {} } = {}) {
  onProgress("Season and week", 0.02);
  const cur = await getJSON(`${SITE}/scoreboard`);
  const season = cur?.season?.year || new Date().getFullYear();
  const curWeek = cur?.season?.type === 2 ? (cur?.week?.number || 18) : 18;

  // Team offense
  const teams = {}; let done = 0;
  await mapLimit(Object.entries(TEAM_IDS), 8, async ([abbr, id]) => {
    const s = await getJSON(`${SITE}/teams/${id}/statistics`);
    const m = flatStats(s?.results?.stats?.categories);
    const att = num(m["passing.passingAttempts"]), sacks = num(m["passing.sacks"]) ?? 0;
    const netPass = num(m["passing.netPassingYards"]), rushAtt = num(m["rushing.rushingAttempts"]);
    const rushYds = num(m["rushing.rushingYards"]), plays = num(m["rushing.totalOffensivePlays"]);
    const yds = num(m["rushing.totalYards"]);
    teams[abbr] = {
      id: String(id), name: s?.team?.shortDisplayName || s?.team?.name || abbr,
      gp: num(m["general.gamesPlayed"]) ?? num(m["passing.teamGamesPlayed"]) ?? 0,
      ppg: num(m["scoring.totalPointsPerGame"]),
      passAtt: att, sacks, rushAtt,
      nypa: att ? netPass / (att + sacks) : null,
      ypc: rushAtt ? rushYds / rushAtt : null,
      ypp: plays ? yds / plays : null,
      sackRate: att ? sacks / (att + sacks) : null,
      passRate: att && rushAtt ? (att + sacks) / (att + sacks + rushAtt) : null,
      defSacks: num(m["defensive.sacks"]), takeaways: num(m["miscellaneous.totalTakeaways"]),
      pa: 0, paGames: 0, color: null, alt: null,
    };
    onProgress("Team offense", 0.05 + 0.45 * (++done / 32));
  });

  // Points allowed, from weekly scoreboards
  onProgress("Scores by week", 0.5);
  const weeks = Array.from({ length: curWeek }, (_, i) => i + 1);
  await mapLimit(weeks, 6, async w => {
    const sb = w === curWeek && cur?.season?.year === season ? cur : await getJSON(`${SITE}/scoreboard?dates=${season}&seasontype=2&week=${w}`);
    for (const e of sb?.events || []) {
      const c = e.competitions?.[0];
      if (!c?.status?.type?.completed) continue;
      const [a, b] = c.competitors || [];
      if (!a || !b) continue;
      for (const [x, y] of [[a, b], [b, a]]) {
        const t = teams[x.team?.abbreviation];
        if (t) { t.pa += Number(y.score) || 0; t.paGames++; }
      }
    }
  });
  for (const t of Object.values(teams)) t.papg = t.paGames ? t.pa / t.paGames : null;

  // Every defender's season stats (3 pages of 500)
  onProgress("Defender stats", 0.6);
  const defenders = {};
  for (let page = 1; page <= 6; page++) {
    const d = await getJSON(`${WEB}/statistics/byathlete?region=us&lang=en&isqualified=false&limit=500&page=${page}&category=defense&season=${season}&seasontype=2`);
    const names = {}; for (const c of d?.categories || []) names[c.name] = c.names || [];
    for (const a of d?.athletes || []) {
      const at = a.athlete || {};
      const pos = DEF_POS[at.position?.abbreviation];
      const team = at.teamShortName;
      if (team && teams[team] && !teams[team].color && at.teams?.[0]) { teams[team].color = at.teams[0].color || null; teams[team].alt = at.teams[0].alternateColor || null; }
      if (!pos) continue;
      const v = {};
      for (const c of a.categories || []) (names[c.name] || []).forEach((n, i) => { v[c.name + "." + n] = toNum(c.totals?.[i]); });
      defenders[String(at.id)] = {
        name: at.displayName, pos, team,
        gp: v["general.gamesPlayed"] || 0, tkl: v["defensive.totalTackles"] || 0,
        sacks: v["defensive.sacks"] || 0, tfl: v["defensive.tacklesForLoss"] || 0,
        pd: v["defensive.passesDefended"] || 0, ints: v["defensiveinterceptions.interceptions"] || 0,
        ff: v["general.fumblesForced"] || 0,
      };
    }
    onProgress("Defender stats", 0.6 + 0.3 * page / (d?.pagination?.pages || 3));
    if (!d || page >= (d.pagination?.pages || 1)) break;
  }

  // Every skill player's passing, rushing and receiving (2 pages of 500)
  onProgress("Offense player stats", 0.9);
  const offense = {};
  for (let page = 1; page <= 4; page++) {
    const d = await getJSON(`${WEB}/statistics/byathlete?region=us&lang=en&isqualified=false&limit=500&page=${page}&category=offense&season=${season}&seasontype=2`);
    const names = {}; for (const c of d?.categories || []) names[c.name] = c.names || [];
    for (const a of d?.athletes || []) {
      const at = a.athlete || {};
      const pos = OFF_POS[at.position?.abbreviation];
      if (!pos || pos === "OL") continue;
      const v = {};
      for (const c of a.categories || []) (names[c.name] || []).forEach((n, i) => { v[c.name + "." + n] = toNum(c.totals?.[i]); });
      offense[String(at.id)] = {
        name: at.displayName, pos, team: at.teamShortName, gp: v["general.gamesPlayed"] || 0,
        att: v["passing.passingAttempts"] || 0, cmp: v["passing.completions"] || 0, pyds: v["passing.passingYards"] || 0,
        ptd: v["passing.passingTouchdowns"] || 0, int: v["passing.interceptions"] || 0, sk: v["passing.sacks"] || 0, skYds: v["passing.sackYardsLost"] || 0,
        car: v["rushing.rushingAttempts"] || 0, ryds: v["rushing.rushingYards"] || 0, rtd: v["rushing.rushingTouchdowns"] || 0,
        tgt: v["receiving.receivingTargets"] || 0, rec: v["receiving.receptions"] || 0, reyds: v["receiving.receivingYards"] || 0,
        retd: v["receiving.receivingTouchdowns"] || 0, fum: v["rushing.rushingFumblesLost"] + v["receiving.receivingFumblesLost"] || 0,
      };
    }
    if (!d || page >= (d.pagination?.pages || 1)) break;
  }

  onProgress("Done", 1);
  return { source: "ESPN public feeds", fetchedAt: new Date().toISOString(), season, week: curWeek, teams, defenders, offense };
}

export async function fetchTeam(abbr) {
  const id = TEAM_IDS[abbr];
  if (!id) throw new Error("Unknown team " + abbr);
  const [roster, depth, sched] = await Promise.all([
    getJSON(`${SITE}/teams/${abbr.toLowerCase()}/roster`),
    getJSON(`${SITE}/teams/${id}/depthcharts`),
    getJSON(`${SITE}/teams/${id}/schedule`),
  ]);

  const players = [];
  const statusOf = { offense: "active", defense: "active", injuredReserveOrOut: "out", suspended: "out", practiceSquad: "ps" };
  for (const g of roster?.athletes || []) {
    const status = statusOf[g.position];
    if (!status) continue;
    for (const a of g.items || []) {
      const abbrPos = a.position?.abbreviation;
      const pos = DEF_POS[abbrPos] || OFF_POS[abbrPos];
      if (!pos) continue;
      players.push({ id: String(a.id), name: a.displayName, pos, side: DEF_POS[abbrPos] ? "D" : "O", status,
        injury: a.injuries?.[0]?.status || a.injuries?.[0]?.type?.description || null });
    }
  }

  // Defensive depth chart, raw: {key: [ids]}; offense: starter names
  let scheme = null; const dkeys = {}; const offense = {}; const okeys = {};
  for (const chart of depth?.depthchart || []) {
    const pos = chart.positions || {};
    if (pos.lcb || pos.fs) {
      scheme = pos.nt || pos.lilb ? "3-4" : "4-3";
      for (const [k, v] of Object.entries(pos)) dkeys[k] = (v.athletes || []).map(a => String(a.id));
    }
    if (pos.qb && pos.wr1) for (const k of ["qb", "wr1", "wr2", "wr3", "te", "rb", "lt", "lg", "c", "rg", "rt"]) {
      offense[k] = pos[k]?.athletes?.[0]?.displayName || null;
      okeys[k] = (pos[k]?.athletes || []).map(a => String(a.id));
    }
  }

  const schedule = (sched?.events || []).map(e => {
    const c = e.competitions?.[0] || {};
    const me = c.competitors?.find(x => String(x.team?.id) === String(id));
    const op = c.competitors?.find(x => String(x.team?.id) !== String(id));
    const score = x => num(Number(x?.score?.value ?? x?.score?.displayValue ?? x?.score));
    return { week: e.week?.number ?? null, date: e.date, opp: op?.team?.abbreviation || null,
      home: me?.homeAway === "home", final: c.status?.type?.completed === true, us: score(me), them: score(op) };
  });

  return { abbr, id: String(id), name: roster?.team?.name || abbr, fetchedAt: new Date().toISOString(),
    season: sched?.requestedSeason?.year || null, players, scheme, depth: dkeys, offense, odepth: okeys, schedule };
}
