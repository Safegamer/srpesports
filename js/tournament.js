/* ========================================================================
   SRP-ESPORTS SEASON 6 — PUBLIC LEADERBOARD & TOURNAMENT RENDERER
   Depends on js/firebase.js (shared SRP core) and css/theme.css.
   ======================================================================== */
(function () {
  'use strict';

  const MAPS = ['Bermuda', 'Purgatory', 'Kalahari', 'Alpine', 'NeXTerra', 'Solara'];
  const STAGE_KEYS = {
    league: ['grove league', 'stage 1', 'stage1', 'league'],
    knockout: ['canopy knockout', 'stage 2', 'stage2', 'knockout'],
    playoff: ['banyan', 'pine', 'playoff', 'semi-final', 'semifinal', 'group final'],
    grand: ['evergreen grand final', 'grand final', 'grand-final', 'stage 4', 'stage4']
  };
  const $ = (id) => document.getElementById(id);
  const state = { filteredStandings: null, modalMatchId: null };

  function srp() { return window.SRP || { teams: [], players: [], matches: [], slots: [], tMatches: [], settings: {} }; }
  function esc(value) { return typeof window.escHtml === 'function' ? window.escHtml(value) : String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c])); }
  function num(value, fallback = 0) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; }
  function getScore(match, side) {
    const candidates = side === 'A'
      ? [match.teamAScore, match.scoreA, match.aScore, match.score?.a]
      : [match.teamBScore, match.scoreB, match.bScore, match.score?.b];
    for (const value of candidates) if (value !== undefined && value !== null && value !== '') return num(value, 0);
    return null;
  }
  function getTeam(teamId) { return srp().teams.find((team) => team.id === teamId) || null; }
  function getTeamName(match, side) {
    const id = side === 'A' ? match.teamAId : match.teamBId;
    const direct = side === 'A' ? (match.teamAName || match.teamA) : (match.teamBName || match.teamB);
    if (direct && typeof direct === 'object') return direct.name || direct.teamName || 'TBD';
    const resolved = getTeam(id || direct);
    if (resolved && (!direct || direct === id || direct === resolved.id)) return resolved.name || 'TBD';
    return direct || resolved?.name || 'TBD';
  }
  function getMatchTime(match) {
    const raw = match.timestamp ?? match.scheduledAt ?? match.matchDate ?? match.date ?? match.createdAt ?? match.updatedAt;
    if (raw && typeof raw.toDate === 'function') return raw.toDate().getTime();
    if (raw && typeof raw === 'object' && Number.isFinite(raw.seconds)) return raw.seconds * 1000;
    if (typeof raw === 'number') return raw < 1e12 ? raw * 1000 : raw;
    const parsed = raw ? Date.parse(raw) : NaN;
    return Number.isFinite(parsed) ? parsed : 0;
  }
  function formatDate(match) {
    const time = getMatchTime(match);
    if (!time) return match.dayLabel || match.matchDay || match.day ? `Matchday ${esc(match.dayLabel || match.matchDay || match.day)}` : 'Date TBA';
    return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(time));
  }
  function isCompleted(match) {
    const status = String(match.status || match.matchStatus || '').toLowerCase();
    return ['complete', 'completed', 'finished', 'played', 'done', 'result'].includes(status) || match.completed === true || match.isComplete === true || (getScore(match, 'A') !== null && getScore(match, 'B') !== null);
  }
  function safeUrl(value) {
    if (!value || typeof value !== 'string') return '';
    try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : ''; } catch (_) { return ''; }
  }
  function scoreLabel(match) {
    const a = getScore(match, 'A'); const b = getScore(match, 'B');
    return a === null || b === null ? 'VS' : `${a} : ${b}`;
  }
  function sortedMatches(list) { return [...(list || [])].sort((a, b) => getMatchTime(b) - getMatchTime(a)); }
  function matchCard(match, options = {}) {
    const a = getTeamName(match, 'A'); const b = getTeamName(match, 'B');
    const scoreA = getScore(match, 'A'); const scoreB = getScore(match, 'B');
    const winner = scoreA !== null && scoreB !== null ? (scoreA === scoreB ? 'Draw' : (scoreA > scoreB ? a : b)) : '';
    const completed = isCompleted(match);
    const matchNo = match.matchNo || match.matchNumber || match.number || '';
    const status = options.preview ? 'Preview fixture' : (completed ? 'Result published' : (match.status || 'Scheduled'));
    const openAttr = !options.preview && match.id ? `data-match-id="${esc(match.id)}" role="button" tabindex="0"` : '';
    return `<article class="match-card-v2 ${completed ? 'complete' : ''} ${options.preview ? 'opacity-90' : ''}" ${openAttr} aria-label="${esc(a)} versus ${esc(b)}">
      <div class="mb-3 flex items-center justify-between gap-2"><span class="text-[10px] font-black uppercase tracking-wider text-slate-400">${esc(matchNo ? `Match ${matchNo}` : (match.roundName || match.round || 'Clash Squad'))}</span><span class="text-[10px] font-bold ${completed ? 'text-emerald-300' : 'text-slate-400'}">${esc(status)}</span></div>
      <div class="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
        <div class="min-w-0"><div class="truncate text-sm font-black text-white">${esc(a)}</div><div class="mt-1 text-[10px] text-slate-500">Team A</div></div>
        <div class="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm font-black ${completed ? 'text-amber-300' : 'text-slate-400'}">${esc(scoreLabel(match))}</div>
        <div class="min-w-0 text-right"><div class="truncate text-sm font-black text-white">${esc(b)}</div><div class="mt-1 text-[10px] text-slate-500">Team B</div></div>
      </div>
      <div class="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/5 pt-3 text-[10px] text-slate-400"><span><i class="fas fa-map-marker-alt mr-1 text-emerald-300"></i>${esc(match.map || match.mapName || match.matchMap || 'Map TBA')}</span><span>${esc(match.dayLabel || formatDate(match))}</span></div>
      ${winner ? `<div class="mt-2 text-[10px] font-bold text-emerald-300"><i class="fas fa-crown mr-1"></i>${winner === 'Draw' ? 'Match drawn' : `${esc(winner)} won`}</div>` : ''}
      ${!options.preview && match.id ? `<div class="mt-2 text-[10px] font-bold text-emerald-300">View match report <i class="fas fa-arrow-right ml-1"></i></div>` : ''}
    </article>`;
  }
  function groupForTeam(team, index, sorted) {
    const slot = srp().slots.find((item) => item.teamId === team.id || item.id === team.slotId) || {};
    const raw = String(slot.groupName || slot.group || team.groupName || team.group || team.pool || '').toLowerCase();
    if (raw.includes('sundar') || raw === 'b' || raw.includes('group b') || raw.includes('grove b')) return 'B';
    if (raw.includes('amazon') || raw === 'a' || raw.includes('group a') || raw.includes('grove a')) return 'A';
    const stableTeams = [...srp().teams].sort((left, right) => {
      const leftOrder = num(left.registrationOrder ?? left.slotOrder ?? left.seed, Number.MAX_SAFE_INTEGER);
      const rightOrder = num(right.registrationOrder ?? right.slotOrder ?? right.seed, Number.MAX_SAFE_INTEGER);
      if (leftOrder !== rightOrder) return leftOrder - rightOrder;
      const leftCreated = left.createdAt && typeof left.createdAt.toMillis === 'function' ? left.createdAt.toMillis() : (Date.parse(left.createdAt || '') || 0);
      const rightCreated = right.createdAt && typeof right.createdAt.toMillis === 'function' ? right.createdAt.toMillis() : (Date.parse(right.createdAt || '') || 0);
      if (leftCreated !== rightCreated) return leftCreated - rightCreated;
      return String(left.name || '').localeCompare(String(right.name || ''));
    });
    const position = Math.max(0, stableTeams.findIndex((item) => item.id === team.id));
    return position < Math.ceil(stableTeams.length / 2) ? 'A' : 'B';
  }
  function groupTeams(groupKey) {
    const sorted = typeof window.getSortedTeams === 'function' ? window.getSortedTeams() : [...srp().teams];
    return sorted.filter((team, index) => groupForTeam(team, index, sorted) === groupKey);
  }
  function renderSmallTeamList(targetId, list, max = 6) {
    const target = $(targetId); if (!target) return;
    const rows = list.slice(0, max);
    if (!rows.length) { target.innerHTML = '<div class="empty-state text-xs">No teams registered in this group yet.</div>'; return; }
    target.innerHTML = rows.map((team, index) => `<button type="button" data-team-id="${esc(team.id)}" class="flex w-full items-center gap-2 rounded-xl border border-white/5 bg-white/[.025] p-2 text-left transition hover:border-emerald-400/30 hover:bg-emerald-400/5">
      <span class="seed-pill">${index + 1}</span><span class="min-w-0 flex-1 truncate text-xs font-bold ${team.disqualified ? 'text-slate-500 line-through' : 'text-white'}">${esc(team.name || 'Unnamed team')}</span><span class="text-xs font-black text-emerald-300">${num(team.P)} PTS</span>
    </button>`).join('');
  }
  function renderStandingsRows(list) {
    if (!list.length) return '<tr><td colspan="9"><div class="empty-state">No teams have been registered yet.</div></td></tr>';
    return list.map((team, index) => {
      const rank = index + 1;
      const rowClass = team.disqualified ? 'disqualified-tr' : rank === 1 ? 'top1' : rank === 2 ? 'top2' : rank === 3 ? 'top3' : 'custom-tr';
      const form = Array.isArray(team.form) && team.form.length ? team.form.map((item) => `<span class="inline-flex h-5 min-w-5 items-center justify-center rounded px-1 text-[9px] font-black ${item === 'W' ? 'bg-emerald-500/20 text-emerald-300' : item === 'L' ? 'bg-red-500/20 text-red-300' : 'bg-slate-500/20 text-slate-300'}">${esc(item)}</span>`).join('') : '<span class="text-slate-600">—</span>';
      return `<tr class="${rowClass}"><td class="font-black text-slate-300">${rank}</td><td><button type="button" data-team-id="${esc(team.id)}" class="flex max-w-[210px] items-center gap-2 text-left font-bold ${team.disqualified ? 'text-slate-400 line-through' : 'text-white'}">${typeof window.getTeamBadge === 'function' ? window.getTeamBadge(team, 'w-8 h-8', 'text-[10px]') : ''}<span class="truncate">${esc(team.name || 'Unnamed team')}</span></button>${team.disqualified ? `<div class="mt-1 text-[9px] font-bold text-red-300"><i class="fas fa-ban mr-1"></i>DQ${team.dqReason ? ` · ${esc(team.dqReason)}` : ''}</div>` : ''}</td><td class="text-center">${num(team.M)}</td><td class="text-center font-bold text-emerald-300">${num(team.W)}</td><td class="text-center">${num(team.D)}</td><td class="text-center">${num(team.L)}</td><td class="text-center font-semibold ${num(team.RD) > 0 ? 'text-emerald-300' : num(team.RD) < 0 ? 'text-red-300' : 'text-slate-300'}">${num(team.RD) > 0 ? '+' : ''}${num(team.RD)}</td><td class="text-center text-sm font-black text-white">${num(team.P)}</td><td><div class="flex items-center gap-1">${form}</div></td></tr>`;
    }).join('');
  }
  function renderHome() {
    const standings = typeof window.getSortedTeams === 'function' ? window.getSortedTeams() : [];
    const teams = srp().teams; const players = typeof window.getAllPlayersWithStats === 'function' ? window.getAllPlayersWithStats() : srp().players;
    const matches = sortedMatches(srp().matches);
    const complete = matches.filter(isCompleted);
    if ($('stat-teams')) $('stat-teams').textContent = teams.length.toLocaleString('en-IN');
    if ($('stat-team-target')) $('stat-team-target').textContent = `${num(srp().settings.totalTeams, 24)} team season capacity`;
    if ($('stat-matches')) $('stat-matches').textContent = complete.length.toLocaleString('en-IN');
    if ($('stat-players')) $('stat-players').textContent = players.length.toLocaleString('en-IN');
    if ($('stat-prize')) {
      const prize = srp().settings.prizePool ?? srp().settings.prize_pool ?? srp().settings.prize ?? null;
      $('stat-prize').textContent = prize === null || prize === '' ? 'TBA' : (typeof prize === 'number' ? `₹${prize.toLocaleString('en-IN')}` : String(prize));
    }
    if ($('home-standings-body')) {
      const q = String($('home-standings-search')?.value || '').trim().toLowerCase();
      const filtered = q ? standings.filter((team) => String(team.name || '').toLowerCase().includes(q)) : standings;
      state.filteredStandings = standings;
      $('home-standings-body').innerHTML = renderStandingsRows(filtered);
    }
    renderSmallTeamList('group-a-table', groupTeams('A'));
    renderSmallTeamList('group-b-table', groupTeams('B'));
    const announcement = srp().settings.announcement || {};
    const announcementSlot = $('announcement-slot');
    if (announcementSlot) {
      if (announcement.active && String(announcement.text || '').trim()) {
        announcementSlot.classList.remove('hidden');
        announcementSlot.innerHTML = `<div class="flex items-start gap-3"><div class="rounded-xl bg-amber-300/10 p-3 text-amber-300"><i class="fas fa-bullhorn"></i></div><div class="min-w-0 flex-1"><div class="text-[10px] font-black uppercase tracking-[.16em] text-amber-300">Announcement board</div><p class="mt-1 whitespace-pre-wrap text-sm leading-6 text-white">${esc(announcement.text)}</p>${announcement.timestamp ? `<div class="mt-2 text-[10px] text-slate-500">${esc(announcement.timestamp)}</div>` : ''}</div></div>`;
      } else { announcementSlot.classList.add('hidden'); announcementSlot.innerHTML = ''; }
    }
    const matchGrid = $('recent-match-grid');
    if (matchGrid) {
      const recent = matches.slice(0, 6);
      matchGrid.innerHTML = recent.length ? recent.map((match) => matchCard(match)).join('') : '<div class="empty-state md:col-span-2 xl:col-span-3"><i class="fas fa-clipboard-list mb-2 block text-xl text-slate-600"></i>No match scoreboards have been published yet.</div>';
      if ($('match-centre-count')) $('match-centre-count').textContent = `${matches.length} scoreboard${matches.length === 1 ? '' : 's'}`;
    }
  }
  function filterHomeStandings() {
    if (!$('home-standings-body')) return;
    const standings = state.filteredStandings || (typeof window.getSortedTeams === 'function' ? window.getSortedTeams() : []);
    const query = String($('home-standings-search')?.value || '').trim().toLowerCase();
    $('home-standings-body').innerHTML = renderStandingsRows(query ? standings.filter((team) => String(team.name || '').toLowerCase().includes(query)) : standings);
  }

  function showMatch(matchId) {
    const match = srp().matches.find((item) => item.id === matchId) || srp().tMatches.find((item) => item.id === matchId);
    if (!match) return;
    state.modalMatchId = matchId;
    const a = getTeamName(match, 'A'); const b = getTeamName(match, 'B');
    const scoreA = getScore(match, 'A'); const scoreB = getScore(match, 'B');
    const map = MAPS.includes(match.map || match.mapName || match.matchMap) ? (match.map || match.mapName || match.matchMap) : (match.map || match.mapName || match.matchMap || 'Not specified');
    const vod = safeUrl(match.vodUrl || match.proofUrl || match.matchProofUrl || match.youtubeUrl || '');
    const stats = Array.isArray(match.stats) ? match.stats : [];
    const statsMarkup = stats.length ? `<div class="mt-5"><div class="mb-2 text-[11px] font-black uppercase tracking-wider text-emerald-300">Player performance</div><div class="overflow-x-auto"><table class="w-full min-w-[440px] text-left text-xs"><thead class="text-[10px] uppercase text-slate-500"><tr><th class="p-2">Player</th><th class="p-2">Team</th><th class="p-2 text-center">K</th><th class="p-2 text-center">D</th><th class="p-2 text-center">A</th></tr></thead><tbody>${stats.map((item) => `<tr class="border-t border-white/5"><td class="p-2 font-bold text-white">${esc(item.player || item.ign || 'Player')}</td><td class="p-2 text-slate-300">${esc(item.team || item.teamName || '')}</td><td class="p-2 text-center font-black text-emerald-300">${num(item.kills)}</td><td class="p-2 text-center text-red-300">${num(item.deaths)}</td><td class="p-2 text-center text-amber-300">${num(item.assists)}</td></tr>`).join('')}</tbody></table></div></div>` : '<div class="mt-5 rounded-xl border border-white/5 bg-white/[.025] p-3 text-xs text-slate-500">Player-level stats have not been added to this match.</div>';
    const content = $('match-modal-content');
    if (content) content.innerHTML = `<div class="rounded-2xl border border-white/10 bg-black/25 p-4 sm:p-5"><div class="flex flex-wrap items-center justify-between gap-2"><span class="cs-pill">${esc(match.roundName || match.round || match.stageName || 'Clash Squad')}</span><span class="text-[10px] font-bold uppercase tracking-wider ${isCompleted(match) ? 'text-emerald-300' : 'text-slate-400'}">${isCompleted(match) ? 'Result published' : esc(match.status || 'Scheduled')}</span></div><div class="mt-5 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3"><div class="min-w-0 text-center"><div class="break-words text-base font-black text-white sm:text-lg">${esc(a)}</div><div class="mt-1 text-[10px] text-slate-500">Team A</div></div><div class="rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-xl font-black text-amber-300">${scoreA === null || scoreB === null ? 'VS' : `${scoreA} : ${scoreB}`}</div><div class="min-w-0 text-center"><div class="break-words text-base font-black text-white sm:text-lg">${esc(b)}</div><div class="mt-1 text-[10px] text-slate-500">Team B</div></div></div><div class="mt-5 grid grid-cols-2 gap-2"><div class="rounded-xl border border-white/5 bg-white/[.025] p-3"><div class="text-[10px] uppercase text-slate-500">Map</div><div class="mt-1 font-bold text-white">${esc(map)}</div></div><div class="rounded-xl border border-white/5 bg-white/[.025] p-3"><div class="text-[10px] uppercase text-slate-500">Match date</div><div class="mt-1 font-bold text-white">${esc(formatDate(match))}</div></div></div>${vod ? `<a href="${esc(vod)}" target="_blank" rel="noopener noreferrer" class="custom-btn mt-4 w-full"><i class="fab fa-youtube"></i> Open Match VOD / Proof</a>` : `<div class="mt-4 rounded-xl border border-dashed border-white/10 p-3 text-center text-xs text-slate-500">No VOD / proof link has been attached to this scoreboard.</div>`}</div>${statsMarkup}`;
    const modal = $('srp-match-modal');
    if (modal) { modal.classList.remove('hidden'); modal.classList.add('flex'); document.body.classList.add('overflow-hidden'); }
  }
  function closeMatchModal() {
    const modal = $('srp-match-modal');
    if (modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); }
    document.body.classList.remove('overflow-hidden'); state.modalMatchId = null;
  }

  function stageForMatch(match) {
    const text = [match.stage, match.stageKey, match.stageName, match.stageId, match.stageType, match.tournamentStage, match.phase, match.competition, match.roundName, match.round].filter(Boolean).join(' ').toLowerCase();
    if (STAGE_KEYS.grand.some((token) => text.includes(token)) || (text.includes('evergreen') && text.includes('final'))) return 'grand';
    if (STAGE_KEYS.knockout.some((token) => text.includes(token))) return 'knockout';
    if (STAGE_KEYS.playoff.some((token) => text.includes(token))) return 'playoff';
    if (STAGE_KEYS.league.some((token) => text.includes(token))) return 'league';
    return '';
  }
  function stageMatches(stage) { return sortedMatches(srp().tMatches.filter((match) => stageForMatch(match) === stage)); }
  function buildLeagueFixtures(teams, matchesPerTeam) {
    if (teams.length < 2) return [];
    const rotation = [...teams];
    if (rotation.length % 2) rotation.push(null);
    const roundCount = rotation.length - 1;
    const rounds = Math.min(Math.max(1, matchesPerTeam), roundCount);
    const games = [];
    for (let round = 0; round < rounds; round += 1) {
      for (let index = 0; index < rotation.length / 2; index += 1) {
        const first = rotation[index]; const second = rotation[rotation.length - 1 - index];
        if (first && second) games.push({ id: `preview-league-${round + 1}-${index + 1}`, teamAId: first.id, teamAName: first.name, teamBId: second.id, teamBName: second.name, day: Math.floor(games.length / 4) + 1, round: round + 1, matchNo: games.length + 1, preview: true });
      }
      rotation.splice(1, 0, rotation.pop());
    }
    return games;
  }
  function groupByDay(matches, chunkSize = 4) {
    const groups = new Map();
    matches.forEach((match, index) => {
      const label = match.dayLabel || match.matchDay || match.dayNumber || match.day || match.dateLabel || `Day ${Math.floor(index / chunkSize) + 1}`;
      const key = String(label);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(match);
    });
    return [...groups.entries()].sort((a, b) => {
      const na = Number(String(a[0]).replace(/\D/g, '')); const nb = Number(String(b[0]).replace(/\D/g, ''));
      if (na && nb) return na - nb;
      return a[0].localeCompare(b[0]);
    });
  }
  function teamMiniRow(team, rank, label) {
    return `<button type="button" data-team-id="${esc(team.id)}" class="flex w-full items-center gap-2 rounded-xl border border-white/5 bg-black/20 p-2 text-left hover:border-emerald-400/25"><span class="seed-pill">${esc(label || rank)}</span><span class="min-w-0 flex-1 truncate text-xs font-bold ${team.disqualified ? 'line-through text-slate-500' : 'text-white'}">${esc(team.name || 'Unnamed team')}</span><span class="text-[10px] font-black text-emerald-300">${num(team.P)} PTS</span></button>`;
  }
  function renderLeagueSchedule() {
    const published = stageMatches('league');
    const teams = typeof window.getSortedTeams === 'function' ? window.getSortedTeams().filter((team) => !team.disqualified) : [];
    const matchesPerTeam = Math.max(1, Math.min(50, num(srp().settings.matchesPerTeam, 5)));
    const fixtures = published.length ? published : buildLeagueFixtures(teams, matchesPerTeam);
    const target = $('league-schedule'); if (!target) return;
    if ($('tourney-league-count')) $('tourney-league-count').textContent = fixtures.length.toLocaleString('en-IN');
    const days = groupByDay(fixtures, 4);
    if ($('tourney-days-count')) $('tourney-days-count').textContent = days.length.toLocaleString('en-IN');
    if ($('league-schedule-note')) $('league-schedule-note').textContent = published.length ? 'Official fixtures published by tournament administrators.' : `Preview rotation: ${matchesPerTeam} rounds per team where the current field allows; four matches are grouped per matchday.`;
    if ($('league-schedule-status')) $('league-schedule-status').textContent = published.length ? 'Official schedule' : 'Generated preview';
    if (!fixtures.length) { target.innerHTML = '<div class="empty-state">At least two registered teams are needed to generate the Grove League schedule.</div>'; return; }
    target.innerHTML = days.map(([day, games]) => `<section><div class="day-heading mb-3 flex items-center justify-between"><h4 class="text-sm font-black text-white">${/^day\s/i.test(day) ? esc(day) : `Matchday ${esc(day)}`}</h4><span class="text-[10px] text-slate-500">${games.length} match${games.length === 1 ? '' : 'es'}</span></div><div class="grid grid-cols-1 gap-3 md:grid-cols-2">${games.map((match) => matchCard(match, { preview: !published.length })).join('')}</div></section>`).join('');
  }
  function renderKnockout() {
    const list = $('knockout-matches'); if (!list) return;
    const published = stageMatches('knockout');
    const qualifiers = (typeof window.getSortedTeams === 'function' ? window.getSortedTeams() : []).filter((team) => !team.disqualified).slice(0, 16);
    if ($('knockout-qualifier-count')) $('knockout-qualifier-count').textContent = `${qualifiers.length} / 16 qualified`;
    if (published.length) { list.innerHTML = published.map((match) => matchCard(match)).join(''); return; }
    if (qualifiers.length < 16) { list.innerHTML = `<div class="empty-state md:col-span-2">${qualifiers.length} of 16 qualifying positions are currently filled. The Canopy Knockout bracket will be generated when all qualifying teams are determined.</div>`; return; }
    const previews = Array.from({ length: 8 }, (_, index) => ({ id: `preview-knockout-${index + 1}`, teamAName: qualifiers[index].name, teamAId: qualifiers[index].id, teamBName: qualifiers[15 - index].name, teamBId: qualifiers[15 - index].id, matchNo: index + 1, day: Math.floor(index / 2) + 1, roundName: 'Round of 16 · BO3' }));
    list.innerHTML = previews.map((match) => `<div class="rounded-2xl border border-white/10 bg-white/[.025] p-3"><div class="mb-2 flex items-center justify-between"><span class="text-[10px] font-black uppercase tracking-wider text-emerald-300">Day ${match.day} · Match ${match.matchNo}</span><span class="cs-pill">BO3</span></div>${matchCard(match, { preview: true })}</div>`).join('');
  }
  function renderPlayoffGroups() {
    const qualified = (typeof window.getSortedTeams === 'function' ? window.getSortedTeams() : []).filter((team) => !team.disqualified).slice(0, 8);
    const banyan = qualified.slice(0, 4); const pine = qualified.slice(4, 8);
    const groupA = $('banyan-group'); const groupB = $('pine-group');
    if (groupA) groupA.innerHTML = banyan.length ? banyan.map((team, index) => teamMiniRow(team, index + 1, `#${index + 1}`)).join('') : '<div class="empty-state text-xs">No Banyan seeds determined yet.</div>';
    if (groupB) groupB.innerHTML = pine.length ? pine.map((team, index) => teamMiniRow(team, index + 5, `#${index + 5}`)).join('') : '<div class="empty-state text-xs">No Pine seeds determined yet.</div>';
    const playoffMatches = stageMatches('playoff');
    const semis = playoffMatches.filter((match) => /semi/i.test(`${match.roundName || ''} ${match.round || ''} ${match.matchType || ''}`));
    const finals = playoffMatches.filter((match) => /final/i.test(`${match.roundName || ''} ${match.round || ''} ${match.matchType || ''}`) && !/semi/i.test(`${match.roundName || ''} ${match.round || ''}`));
    const semiTarget = $('playoff-semifinals');
    if (semiTarget) {
      if (semis.length) semiTarget.innerHTML = semis.map((match) => matchCard(match)).join('');
      else if (banyan.length >= 2 && pine.length >= 2) semiTarget.innerHTML = `<div class="rounded-2xl border border-white/10 bg-white/[.025] p-3"><div class="mb-2 text-[10px] font-black uppercase tracking-wider text-amber-300">Semifinal 1 · BO3</div>${matchCard({ teamAName: banyan[0].name, teamBName: pine[1].name, roundName: 'Banyan #1 vs Pine #2' }, { preview: true })}</div><div class="rounded-2xl border border-white/10 bg-white/[.025] p-3"><div class="mb-2 text-[10px] font-black uppercase tracking-wider text-amber-300">Semifinal 2 · BO3</div>${matchCard({ teamAName: pine[0].name, teamBName: banyan[1].name, roundName: 'Pine #1 vs Banyan #2' }, { preview: true })}</div>`;
      else semiTarget.innerHTML = '<div class="empty-state md:col-span-2">The semifinal bracket unlocks when at least two Banyan and two Pine seeds are set.</div>';
    }
    const finalTarget = $('playoff-finals');
    if (finalTarget) finalTarget.innerHTML = finals.length ? finals.map((match) => matchCard(match)).join('') : `<div class="rounded-2xl border border-white/10 bg-white/[.025] p-3 md:col-span-2"><div class="mb-2 text-[10px] font-black uppercase tracking-wider text-amber-300">Playoff final · BO3</div>${matchCard({ teamAName: 'Winner Semifinal 1', teamBName: 'Winner Semifinal 2', roundName: 'Group Finals' }, { preview: true })}</div>`;
  }
  function renderGrandFinal() {
    const target = $('grand-final-match'); if (!target) return;
    const final = stageMatches('grand')[0];
    if (final) { target.innerHTML = matchCard(final); return; }
    target.innerHTML = `<div class="rounded-2xl border border-amber-300/20 bg-black/20 p-4 sm:p-5"><div class="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3"><div class="text-center"><div class="text-lg font-black text-white">W_A</div><div class="mt-1 text-[10px] text-slate-500">Group A winner</div></div><div class="rounded-xl bg-amber-300/10 px-4 py-3 text-xl font-black text-amber-300">VS</div><div class="text-center"><div class="text-lg font-black text-white">W_B</div><div class="mt-1 text-[10px] text-slate-500">Group B winner</div></div></div><div class="mt-4 text-center"><span class="cs-pill">BO3 · Match details pending publication</span></div></div>`;
  }
  function renderTournament() {
    const teams = typeof window.getSortedTeams === 'function' ? window.getSortedTeams() : [];
    if ($('tourney-team-count')) $('tourney-team-count').textContent = srp().teams.length.toLocaleString('en-IN');
    if ($('tourney-team-target')) $('tourney-team-target').textContent = `${num(srp().settings.totalTeams, 24)} configured season slots`;
    renderSmallTeamList('league-group-a', groupTeams('A'), 12);
    renderSmallTeamList('league-group-b', groupTeams('B'), 12);
    renderLeagueSchedule(); renderKnockout(); renderPlayoffGroups(); renderGrandFinal();
  }
  function renderSocialLinks() {
    const target = $('social-links'); if (!target) return;
    const settings = srp().settings || {}; const links = settings.socialLinks || {};
    const discord = safeUrl(links.discord || settings.discordUrl || settings.discordInvite || '');
    const youtube = safeUrl(links.youtube || settings.youtubeUrl || settings.youtubeChannel || '');
    const output = [];
    if (discord) output.push(`<a class="discord" href="${esc(discord)}" target="_blank" rel="noopener noreferrer" aria-label="Open SRP Discord"><i class="fab fa-discord"></i></a>`);
    if (youtube) output.push(`<a class="youtube" href="${esc(youtube)}" target="_blank" rel="noopener noreferrer" aria-label="Open SRP YouTube"><i class="fab fa-youtube"></i></a>`);
    target.innerHTML = output.join('');
  }

  document.addEventListener('click', function (event) {
    const matchButton = event.target.closest('[data-match-id]');
    if (matchButton && matchButton.dataset.matchId) { showMatch(matchButton.dataset.matchId); return; }
    const teamButton = event.target.closest('[data-team-id]');
    if (teamButton && teamButton.dataset.teamId && typeof window.openTeamDrawer === 'function') window.openTeamDrawer(teamButton.dataset.teamId);
  });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') closeMatchModal();
    if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('[data-match-id]')) { event.preventDefault(); showMatch(event.target.dataset.matchId); }
  });

  window.SRPTournament = {
    renderHome,
    filterHomeStandings,
    renderTournament,
    renderSocialLinks,
    showMatch,
    closeMatchModal,
    maps: MAPS
  };
})();
