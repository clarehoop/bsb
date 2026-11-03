// Turns public season stats into 40–99 style ratings (pass rush, run defense, coverage, tackling).
//
// Method: for each role (DE, DT, LB, CB, S), take the league's regulars (2+ games and real
// tackle volume) and rank every player against them per game. Percentile → rating inside a
// range whose middle is a league-average starter. Small samples and low snap counts are pulled
// toward a backup-level rating, so a backup with one big game doesn't rate like a star.

// [low, high] per role and rating; the midpoint is roughly an average starter.
export const RANGES = {
  DE: { pr: [52, 88], rs: [58, 82], cov: [36, 48], tk: [60, 80] },
  DT: { pr: [44, 80], rs: [60, 84], cov: [28, 36], tk: [60, 80] },
  LB: { pr: [38, 66], rs: [57, 81], cov: [51, 79], tk: [61, 81] },
  CB: { pr: [26, 34], rs: [48, 68], cov: [58, 86], tk: [56, 76] },
  S:  { pr: [32, 48], rs: [58, 82], cov: [56, 84], tk: [62, 82] },
};
// Tackles per game a regular at each role makes at minimum.
const MIN_TKL = { DE: 1.2, DT: 1.0, LB: 2.5, CB: 2.0, S: 2.5 };
const BACKUP = 0.22; // backups sit this far up each range

const METRICS = {
  pr: s => (s.sacks + 0.3 * s.ff) / s.gp,
  rs: s => Math.max(0, s.tfl - s.sacks) / s.gp + 0.04 * s.tkl / s.gp,
  cov: s => (s.pd + 2 * s.ints) / s.gp,
  tk: s => s.tkl / s.gp,
};

// Role from ESPN's position, moving pass-rushing linebackers (3-4 OLBs) to the edge.
export function statRole(s) {
  if (s.pos === "LB" && s.gp >= 2 && s.sacks / s.gp >= 0.35) return "DE";
  return s.pos;
}

export function makeRater(defenders) {
  const dist = {};
  for (const role of Object.keys(RANGES)) dist[role] = { pr: [], rs: [], cov: [], tk: [] };
  for (const s of Object.values(defenders || {})) {
    const role = statRole(s);
    if (!dist[role] || s.gp < 2 || s.tkl / s.gp < MIN_TKL[role]) continue;
    for (const k in METRICS) dist[role][k].push(METRICS[k](s));
  }
  for (const r in dist) for (const k in dist[r]) dist[r][k].sort((a, b) => a - b);

  const pct = (v, arr) => {
    if (!arr.length) return 0.5;
    let lo = 0, hi = arr.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < v) lo = m + 1; else hi = m; }
    let eq = lo; while (eq < arr.length && arr[eq] === v) eq++;
    return (lo + (eq - lo) / 2) / arr.length;
  };

  // Returns {pr, rs, cov, tk, basis} for a player at a role.
  return function rate(id, role) {
    const R = RANGES[role] || RANGES.LB;
    const s = defenders?.[id];
    const out = { basis: "no stats" };
    if (!s || !s.gp) {
      for (const k in R) out[k] = Math.round(R[k][0] + BACKUP * (R[k][1] - R[k][0]));
      return out;
    }
    const volume = Math.min(1, Math.max(0.35, (s.tkl / s.gp) / MIN_TKL[role]));
    const trust = (s.gp / (s.gp + 1.5)) * volume;
    for (const k in R) {
      const [lo, hi] = R[k];
      const backup = lo + BACKUP * (hi - lo);
      const raw = lo + pct(METRICS[k](s), dist[role]?.[k] || []) * (hi - lo);
      out[k] = Math.round(backup + (raw - backup) * trust);
    }
    out.basis = `${s.gp} G of stats`;
    return out;
  };
}
