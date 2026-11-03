# Lineup Lab

Pick any NFL team, set the lineup on both sides of the ball, and simulate games against real NFL rosters to find the players costing you points. The Bengals are the default.

## Run it

https://nfl-teams-sim.vercel.app/



- **Team picker:** all 32 teams. The page recolors to the team's colors, and each team keeps its own lineups, rating edits and custom players.
- **Defense:** 11 spots in a nickel 4-2-5, preset from ESPN's depth chart. 3-4 teams are mapped too: outside linebackers rush from the edge, and the ends play inside.
- **Offense:** QB, RB, three receivers, a tight end and five linemen, preset from the depth chart. Switch between the two with the Defense / Offense tabs.
- **Every game is simulated play by play on both sides.** Your offense faces each opponent's real defensive starters, rated the same way as yours. Your defense faces their offense.
- **Opponents:** the other 31 teams. Teams left on the schedule come first. Quick picks: next game, rest of schedule, division, all teams.
- **Best swaps:** every bench, practice squad, free-agent type and custom player is tested in every spot they can play. Ranked by points saved on defense, or points gained on offense.
- **Player report:** each starter's value against a league-average player at that spot, their season stats, and their simulated stats.
- **Injuries:** injured and cut players are swapped out automatically.

## Ratings

Defenders have four ratings on a 40–99 scale (pass rush, run defense, coverage, tackling). Offensive players have one.

- **Bengals:** hand-set ratings (`DEFAULT_POOL` and `OFF_POOL` in `index.html`). With "Adjust ratings with this season's stats" on, season stats nudge the defenders by up to 6 points.
- **Every other team:** calculated from public stats by `js/ratings.js`.
  - Each player is ranked per game against the league's regulars at the same role.
  - The percentile maps to a rating range whose middle is an average starter.
  - Small samples and low playing time are pulled toward a backup-level rating.
  - Defense stats: sacks and forced fumbles for pass rush; non-sack tackles for loss plus tackle volume for run defense; passes defended and interceptions for coverage; tackles per game for tackling.
  - Offense stats: QBs use adjusted net yards per attempt plus rushing. RBs use yards per carry and scrimmage yards. WRs and TEs use yards per target and receiving yards per game.
  - Offensive linemen have no individual stats, so they're rated from their team's sack rate and yards per carry. Backups sit 7 points lower.
  - A calibration lift is added, plus a team factor based on real points allowed (defense) or scored (offense).
- **Custom:** you can edit any rating or add players on any team. Edits are saved in your browser, per team.

**Calibration (2026, week 8):** every team's default lineups were simulated against every other team's.
- Points scored: simulated 23.1 per game against a real 23.1. Correlation 0.88, off by 2.2 points on average.
- Points allowed: simulated 22.9 per game against a real 23.0. Correlation 0.88, off by 2.3 points on average.

The knobs are `STAT_LIFT`, `TEAM_DEF_K`, `OFF_LIFT` and `TEAM_OFF_K` in `index.html`.

## Stats

Stats come from ESPN's public JSON feeds. These feeds are unofficial and can change without notice.

They update in two ways:

1. **Weekly snapshot.** The `Refresh stats` GitHub Action runs every Tuesday after Monday Night Football and commits `data/league.json` plus `data/teams/<TEAM>.json`. You can also run it any time from **Actions → Refresh stats → Run workflow**.
2. **Live in the browser.** When the page loads from GitHub Pages, it shows the snapshot first, then fetches fresh stats in the background. The **Refresh live** button does the same on demand.


## Files

- `index.html` is the app: UI and simulation engine.
- `js/espn.js` fetches from ESPN. It is shared by the browser and the script.
- `js/ratings.js` turns stats into ratings (defense and offense).
- `scripts/fetch-stats.mjs` writes the `data/` snapshot.
- `.github/workflows/refresh-stats.yml` runs the weekly refresh.
