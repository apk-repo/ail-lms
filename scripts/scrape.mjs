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

const toScore = v => (v === null || v === undefined || v === '' || !Number.isFinite(+v)) ? null : +v;

const isPostponed = r => {
  const p = r.postponed;
  const flagged = p !== null && p !== undefined && p !== '' && p !== false &&
    String(p) !== '0' && String(p).toLowerCase() !== 'no';
  return flagged || /postpon|cancel|abandon|void/i.test(r.fixtureStatus || '');
};

const division = r => {
  const m = `${r.competitionShortName || ''} ${r.competitionName || ''}`.match(/\b([12][ABC])\b/);
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
  home: { id: String(r.homeTeamId), name: cleanName(r.homeTeam), logo: r.homeClubLogo || '', score: toScore(r.homeScore) },
  away: { id: String(r.awayTeamId), name: cleanName(r.awayTeam), logo: r.awayClubLogo || '', score: toScore(r.awayScore) },
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
    // Results come second so played games take their scores from the results feed.
    for (const row of [...fixtures, ...results]) {
      const f = normalise(row);
      if (f.kickoff && f.round) byId.set(f.id, f);
    }
    const rows = [...byId.values()].filter(f => f.comp === comp);
    health.push({ comp, division: rows[0]?.div || '?', ok: true, fixtures: fixtures.length, results: results.length });
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
