# Defense Lab

Pick any NFL team, keep its offense locked, swap defensive players in and out, and simulate games against other offenses to find the spots costing you points. The Bengals are the default.

- **Team picker:** all 32 teams. The page recolors to the team's colors, and each team keeps its own lineup, rating edits and custom players.
- **Lineup:** 11 spots in a nickel 4-2-5, preset from ESPN's depth chart. 3-4 teams are mapped too: outside linebackers rush from the edge, and the ends play inside. Injured and cut players are swapped out automatically.
- **Opponents:** the other 31 teams. Teams left on the schedule come first. Quick picks: next game, rest of schedule, division, all teams.
- **Best swaps:** every bench, practice squad, free-agent type and custom player is tested in every spot they can play, ranked by points saved per game.
- **Player report:** each starter's value against a league-average player at that spot, plus their season stats.

## Ratings

Every defender has four ratings on a 40–99 scale: pass rush, run defense, coverage and tackling.

- **Bengals:** hand-set ratings (`DEFAULT_POOL` in `index.html`). With "Adjust ratings with this season's stats" on, season stats nudge them by up to 6 points.
- **Every other team:** calculated from public stats by `js/ratings.js`:
  1. Each player is ranked per game against the league's regulars at the same role (DE, DT, LB, CB, S). The stats are sacks and forced fumbles for pass rush; non-sack tackles for loss plus tackle volume for run defense; passes defended and interceptions for coverage; and tackles per game for tackling.
  2. The percentile maps to a rating range whose middle is an average starter.
  3. Small samples and low snap counts are pulled toward a backup-level rating.
  4. A calibration lift is added, plus a team factor based on the defense's real points allowed.
- **Custom:** you can edit any rating or add players on any team. Edits are saved in your browser, per team.

**Calibration (2026, week 8):**
- Points allowed: across all 32 teams' default lineups, simulated points allowed average 23.0 against a real 23.1. They track real results with a correlation of 0.86 and are off by 2.3 points per game on average.
- Points scored: simulated points scored match real points scored with a correlation of 0.99.

The knobs are `STAT_LIFT` and `TEAM_DEF_K` in `index.html`.

## Stats

Stats come from ESPN's public JSON feeds. These feeds are unofficial and can change without notice.

They update in two ways:

1. **Weekly snapshot.** The `Refresh stats` GitHub Action runs every Tuesday after Monday Night Football and commits `data/league.json` plus `data/teams/<TEAM>.json`. You can also run it any time from **Actions → Refresh stats → Run workflow**.
2. **Live in the browser.** When the page loads from GitHub Pages, it shows the snapshot first, then fetches fresh stats in the background. The **Refresh live** button does the same on demand.

## Run it

Open the site on GitHub Pages: **Settings → Pages → Deploy from a branch → `main` / root**.

To run it locally, the page needs a web server (ES modules don't load from `file://`):

```bash
python3 -m http.server 8000
```

To update the snapshot by hand (Node 18+, about 10 seconds):

```bash
node scripts/fetch-stats.mjs
```

## Files

- `index.html` is the app: UI and simulation engine.
- `js/espn.js` fetches from ESPN. It is shared by the browser and the script.
- `js/ratings.js` turns stats into ratings.
- `scripts/fetch-stats.mjs` writes the `data/` snapshot.
- `.github/workflows/refresh-stats.yml` runs the weekly refresh.
