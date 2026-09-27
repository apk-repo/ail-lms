// Pulls fixtures and results for all five AIL men's divisions from the
// sportsmanager.ie feed (the same feed irishrugby.ie uses) and writes:
//   data/fixtures.json  - what the app reads
//   data/health.json    - feed status, shown on the Admin tab only
// Runs on a schedule in GitHub Actions. No command line needed.

import fs from 'node:fs/promises';

const COMPETITIONS = ['215682', '215683', '215684', '215685', '215686'];
const USER_ID = '7533';
const SEASON = { from: '2026-09-01', to: '2027-04-30' };
const BASE = 'https://sportsmanager.ie/dataFeed/index.php';

const feedUrl = (type, comp) => {
  const p = new URLSearchParams({
    feedType: 'fixture', type, user_id: USER_ID,
    date_from: SEASON.from, date_to: SEASON.to, competition_id: comp,
  });
  if (type === 'fixtures') p.set('sort', 'date');
  return `${BASE}?${p}`;
};

async function getFeed(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (club last-man-standing app)', Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return Array.isArray(json.data) ? json.data : [];
}

const cleanName = n => String(n || '')
  .replace(/[\u2018\u2019]/g, "'")
  .replace(/\s+(RFC|R\.F\.C\.|FC)$/i, '')
  .trim();

// Scores come as "points;tries", e.g. "24;3" = 24 points, 3 tries. Plain numbers work too.
const toScore = v => {
  if (v === null || v === undefined) return null;
  const m = String(v).trim().match(/^(\d+)\s*(?:;.*)?$/);
  return m ? +m[1] : null;
};

// The results feed doesn't always name the score fields the same way as the fixtures feed,
// so try the likely names, then a combined "25 - 10" style field, then any field that looks right.
const scoreKeys = side => [`${side}Score`, `${side}TeamScore`, `${side}_score`, `${side}FinalScore`, `${side}Points`,
  `${side}TeamPoints`, `${side}Goals`, `${side}Total`, `${side}FTScore`, `${side}ScoreFT`];
function pickScores(r) {
  const get = side => {
    for (const k of scoreKeys(side)) { const v = toScore(r[k]); if (v !== null) return v; }
    for (const [k, v] of Object.entries(r)) {
      if (new RegExp(`^${side}`, 'i').test(k) && /score|points|total/i.test(k) && !/half|ht|bonus|try|tries/i.test(k)) { const n = toScore(v); if (n !== null) return n; }
    }
    return null;
  };
  let home = get('home'), away = get('away');
  if (home === null || away === null) {
    for (const k of ['score', 'result', 'fullTimeScore', 'ftScore', 'finalScore', 'fixtureResult', 'matchResult']) {
      const m = String(r[k] ?? '').match(/(\d+)\s*[-–:v]\s*(\d+)/);
      if (m) { home = +m[1]; away = +m[2]; break; }
    }
  }
  return { home, away };
}

const isPostponed = r => {
  const p = r.postponed;
  const flagged = p !== null && p !== undefined && p !== '' && p !== false &&
    String(p) !== '0' && String(p).toLowerCase() !== 'no';
  return flagged || /postpon|cancel|abandon|void/i.test(r.fixtureStatus || '');
};

const division = r => {
  const t = `${r.competitionShortName || ''} ${r.competitionName || ''}`;
  // 2026/27: old 2B and 2C became 2B North (2BN) and 2B South (2BS)
  if (/\b2\s?BN\b|\b2B\s+North/i.test(t)) return '2BN';
  if (/\b2\s?BS\b|\b2B\s+South/i.test(t)) return '2BS';
  const m = t.match(/\b([12][ABC])\b/);
  return m ? m[1] : (r.competitionShortName || r.competitionId);
};

const normalise = r => ({
  id: String(r.fixtureId),
  comp: String(r.competitionId),
  div: division(r),
  round: parseInt(r.round, 10) || 0,
  kickoff: parseInt(r.fixtureDate, 10) || 0,
  venue: r.venue || '',
  status: r.fixtureStatus || '',
  postponed: isPostponed(r),
  home: { id: String(r.homeTeamId), name: cleanName(r.homeTeam), logo: r.homeClubLogo || '', score: pickScores(r).home },
  away: { id: String(r.awayTeamId), name: cleanName(r.awayTeam), logo: r.awayClubLogo || '', score: pickScores(r).away },
});

async function readJson(path, fallback) {
  try { return JSON.parse(await fs.readFile(path, 'utf8')); } catch { return fallback; }
}

const previous = await readJson('data/fixtures.json', { fixtures: [] });
const prevHealth = await readJson('data/health.json', {});
const byId = new Map((previous.fixtures || []).map(f => [f.id, f]));
const health = [];

for (const comp of COMPETITIONS) {
  try {
    const [fixtures, results] = await Promise.all([
      getFeed(feedUrl('fixtures', comp)),
      getFeed(feedUrl('results', comp)),
    ]);
    for (const row of fixtures) {
      const f = normalise(row);
      if (!/result/i.test(f.status) && !f.home.score && !f.away.score) { f.home.score = null; f.away.score = null; }
      if (f.kickoff && f.round) byId.set(f.id, f);
    }
    // Results: merge the scores into the game we already have, matched by fixture id,
    // or failing that by the two teams. Keep our kickoff/round if the result row lacks them.
    let matched = 0;
    for (const row of results) {
      const f = normalise(row);
      let cur = byId.get(f.id);
      if (!cur) cur = [...byId.values()].find(x => x.comp === comp &&
        ((x.home.id === f.home.id && x.away.id === f.away.id) || (x.home.name === f.home.name && x.away.name === f.away.name)) &&
        (!f.kickoff || Math.abs(x.kickoff - f.kickoff) < 3 * 86400));
      if (cur) {
        byId.set(cur.id, { ...cur,
          status: f.status || cur.status, postponed: f.postponed || cur.postponed,
          home: { ...cur.home, score: f.home.score ?? cur.home.score },
          away: { ...cur.away, score: f.away.score ?? cur.away.score } });
        if (f.home.score !== null && f.away.score !== null) matched++;
      } else if (f.kickoff && f.round) byId.set(f.id, f);
    }
    if (results.length) {
      const r0 = results[0];
      console.log(`  ${comp} results feed fields: ${Object.keys(r0).join(', ')}`);
      console.log(`  ${comp} first result: ${JSON.stringify(Object.fromEntries(Object.entries(r0).filter(([k]) => /score|result|point|home|away|fixture|round|date|status/i.test(k))))}`);
      console.log(`  ${comp}: scores read for ${matched} of ${results.length} results`);
    }
    const rows = [...byId.values()].filter(f => f.comp === comp);
    health.push({ comp, division: rows[0]?.div || '?', ok: true, fixtures: fixtures.length, results: results.length,
      scored: rows.filter(x => x.home.score !== null && x.away.score !== null).length });
  } catch (err) {
    // Keep what we had for this division rather than wiping it.
    const kept = [...byId.values()].filter(f => f.comp === comp).length;
    health.push({ comp, ok: false, error: String(err.message || err), keptPrevious: kept });
  }
}

const fixtures = [...byId.values()].sort((a, b) => a.kickoff - b.kickoff || a.div.localeCompare(b.div) || a.id.localeCompare(b.id));
const newFixturesText = JSON.stringify({ fixtures }, null, 1);
const oldFixturesText = JSON.stringify({ fixtures: previous.fixtures || [] }, null, 1);
const changed = newFixturesText !== oldFixturesText;

if (changed) await fs.writeFile('data/fixtures.json', newFixturesText + '\n');

const summary = health.map(({ comp, division, ok, error }) => ({ comp, division, ok, error }));
const prevSummary = (prevHealth.divisions || []).map(({ comp, division, ok, error }) => ({ comp, division, ok, error }));
if (changed || JSON.stringify(summary) !== JSON.stringify(prevSummary)) {
  await fs.writeFile('data/health.json', JSON.stringify({
    fixturesChangedAt: changed ? new Date().toISOString() : (prevHealth.fixturesChangedAt || null),
    checkedAt: new Date().toISOString(),
    total: fixtures.length,
    divisions: health,
  }, null, 1) + '\n');
}

console.log(changed ? `Updated: ${fixtures.length} fixtures` : 'No changes');
for (const h of health) console.log(h.ok ? `  ${h.division} (${h.comp}): ${h.fixtures} fixtures, ${h.results} results` : `  ${h.comp}: FAILED ${h.error}`);
if (health.every(h => !h.ok)) process.exit(1);
