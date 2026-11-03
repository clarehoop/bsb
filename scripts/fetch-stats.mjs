// Writes data/league.json and data/teams/<ABBR>.json from ESPN. Run with: node scripts/fetch-stats.mjs
import { writeFile, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { fetchLeague, fetchTeam, TEAM_IDS } from "../js/espn.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = join(root, "data");
let last = "";
const league = await fetchLeague({ onProgress: msg => { if (msg !== last) { console.log("·", msg); last = msg; } } });
const nDef = Object.keys(league.defenders).length, nTeams = Object.keys(league.teams).length;
console.log(`Season ${league.season}, week ${league.week}: ${nTeams} teams, ${nDef} defenders with stats`);
if (nTeams < 32 || nDef < 300) { console.error("League data looks incomplete; not writing."); process.exit(1); }

const teams = {};
for (const abbr of Object.keys(TEAM_IDS)) {
  const t = await fetchTeam(abbr);
  if (t.players.length < 15 || !t.scheme) { console.error(`${abbr} looks incomplete (${t.players.length} defenders); not writing.`); process.exit(1); }
  teams[abbr] = t;
}
console.log("· Fetched 32 rosters, depth charts and schedules");

await mkdir(join(dataDir, "teams"), { recursive: true });
await writeFile(join(dataDir, "league.json"), JSON.stringify(league) + "\n");
for (const [abbr, t] of Object.entries(teams)) await writeFile(join(dataDir, "teams", abbr + ".json"), JSON.stringify(t) + "\n");
await rm(join(dataDir, "stats.json"), { force: true }); // replaced by league.json + teams/
console.log("Wrote data/league.json and data/teams/*.json");
