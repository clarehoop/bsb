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

// ---------- Offense ----------
// One overall rating per skill player, from the same percentile-and-shrink method.
// Offensive linemen have no individual stats, so the app rates them from their team's
// sack rate and rushing success instead.
export const ORANGES = { QB: [68, 96], RB: [64, 92], WR: [62, 95], TE: [60, 90] };
const OREG = {
  QB: s => s.att / s.gp >= 15, RB: s => s.car / s.gp >= 6,
  WR: s => s.tgt / s.gp >= 3.5, TE: s => s.tgt / s.gp >= 2.5,
};
// [metric, weight]; percentiles are blended by weight.
const OMETRICS = {
  QB: [[s => (s.pyds - s.skYds + 20 * s.ptd - 45 * s.int) / Math.max(1, s.att + s.sk) + 0.01 * s.ryds / s.gp, 1]],
  RB: [[s => s.ryds / Math.max(1, s.car), 0.45], [s => (s.ryds + s.reyds) / s.gp, 0.55]],
  WR: [[s => (s.reyds + 20 * s.retd) / Math.max(1, s.tgt), 0.4], [s => s.reyds / s.gp, 0.6]],
  TE: [[s => (s.reyds + 20 * s.retd) / Math.max(1, s.tgt), 0.4], [s => s.reyds / s.gp, 0.6]],
};
const OTRUST = { QB: s => s.att / (s.att + 90), RB: s => s.car / (s.car + 40), WR: s => s.tgt / (s.tgt + 20), TE: s => s.tgt / (s.tgt + 20) };

export function makeOffRater(offense) {
  const dist = {};
  for (const pos of Object.keys(ORANGES)) dist[pos] = OMETRICS[pos].map(() => []);
  for (const s of Object.values(offense || {})) {
    if (!dist[s.pos] || s.gp < 2 || !OREG[s.pos](s)) continue;
    OMETRICS[s.pos].forEach(([f], i) => dist[s.pos][i].push(f(s)));
  }
  for (const p in dist) for (const a of dist[p]) a.sort((x, y) => x - y);
  const pct = (v, arr) => {
    if (!arr.length) return 0.5;
    let lo = 0, hi = arr.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < v) lo = m + 1; else hi = m; }
    return lo / arr.length;
  };
  return function rateOff(id, pos) {
    const R = ORANGES[pos]; if (!R) return { rt: 60, basis: "no stats" };
    const [lo, hi] = R, backup = lo + BACKUP * (hi - lo);
    const s = offense?.[id];
    if (!s || !s.gp) return { rt: Math.round(backup), basis: "no stats" };
    let p = 0; OMETRICS[pos].forEach(([f, w], i) => { p += w * pct(f(s), dist[pos][i]); });
    const raw = lo + p * (hi - lo);
    const trust = Math.min(1, OTRUST[pos](s) * (s.gp / (s.gp + 1)));
    return { rt: Math.round(backup + (raw - backup) * trust), basis: `${s.gp} G of stats` };
  };
}
