// ==========================================================================
// SRP-ESPORTS SEASON 6 — SHARED CORE (Firebase, Auth, RBAC, Drawer, PWA)
// ==========================================================================

const firebaseConfig = {
  apiKey: "AIzaSyA5jlILopvGXUWOw37L560ZcFvLP_8fm_Q",
  authDomain: "srpweb-52fd9.firebaseapp.com",
  projectId: "srpweb-52fd9",
  storageBucket: "srpweb-52fd9.firebasestorage.app",
  messagingSenderId: "728798447384",
  appId: "1:728798447384:web:df76949566b05e2480006d",
  measurementId: "G-CFVPK1RCEV"
};

if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

const AUTH_SALT = "SRP_ESPORTS_CS_BERMUDA_2026_SECURE_SALT";
const SESSION_KEY = "srp_s6_session_v1";
const LOCKOUT_KEY = "srp_s6_login_lock_v1";
const MAX_LOGIN_ATTEMPTS = 2;
const LOCKOUT_SECONDS = 60;

// Granular permission definitions for Sub-Admins
const PERMISSION_GROUPS = [
  {
    group: "Teams & Players",
    icon: "fa-users",
    items: [
      { key: "team_add", label: "Add Team Manually" },
      { key: "team_edit_info", label: "Edit Team Name & Logo" },
      { key: "player_edit_details", label: "Edit Player IGN / UID / Device / Role" },
      { key: "player_edit_photo", label: "Upload / Change Player Photo" },
      { key: "player_manage_subs", label: "Add / Remove Substitutes" },
      { key: "team_lock_roster", label: "Lock / Unlock Roster" },
      { key: "team_dq", label: "Disqualify / Reinstate Team", danger: true },
      { key: "team_delete", label: "Delete Team", danger: true }
    ]
  },
  {
    group: "Matches & Scoreboards",
    icon: "fa-gamepad",
    items: [
      { key: "match_create", label: "Create Match Session" },
      { key: "match_edit_score", label: "Edit Match Score & Map" },
      { key: "match_edit_stats", label: "Edit Player K/D/A Stats" },
      { key: "match_edit_vod", label: "Add / Edit VOD & Proof Link" },
      { key: "match_delete", label: "Delete Match", danger: true }
    ]
  },
  {
    group: "Registration Tokens",
    icon: "fa-ticket-alt",
    items: [
      { key: "token_view", label: "View & Copy Tokens" },
      { key: "token_create", label: "Generate Season Tokens" },
      { key: "token_delete", label: "Revoke / Delete Tokens", danger: true }
    ]
  },
  {
    group: "Announcements & Live Stream",
    icon: "fa-bullhorn",
    items: [
      { key: "announcement_edit", label: "Post / Edit Announcement Board" },
      { key: "livestream_edit", label: "Toggle & Edit Live Now YouTube Banner" }
    ]
  },
  {
    group: "Tournament & Grove Slots",
    icon: "fa-sitemap",
    items: [
      { key: "tourney_scores", label: "Enter League / Knockout / Playoff Results" },
      { key: "tourney_slots", label: "Edit Amazon & Sundarbans Grove Slots" }
    ]
  },
  {
    group: "Rules & Prize Pool",
    icon: "fa-scale-balanced",
    items: [
      { key: "rules_edit", label: "Edit Room Rules & Format" },
      { key: "prize_edit", label: "Edit Prize Pool (₹)" }
    ]
  }
];

const FREE_FIRE_MAPS = ["Bermuda", "Purgatory", "Kalahari", "Alpine", "NeXTerra", "Solara"];

// Global reactive state
window.SRP = {
  teams: [],
  players: [],
  matches: [],
  tokens: [],
  slots: [],
  tMatches: [],
  subAdmins: [],
  settings: {
    season: "Season 6",
    theme: "save-trees",
    registrationOpen: false,
    maintenanceMode: false,
    maintenanceNotice: "We’re making a few updates. Please check back soon.",
    announcement: { text: "", active: false, timestamp: "" },
    liveStream: { active: false, title: "SRP-ESPORTS Season 6 Live", url: "" },
    totalTeams: 24,
    matchesPerTeam: 5,
    maxSubs: 2,
    autoAssign: true
  },
  pastSeason: {},
  rulesData: null,
  session: null,
  listeners: [],
  deferredInstallPrompt: null
};

// --- SHA-256 WITH PURE JS FALLBACK ---
function sha256Fallback(ascii) {
  function rr(v, a) { return (v >>> a) | (v << (32 - a)); }
  const maxWord = Math.pow(2, 32);
  let i, j, result = '', words = [], asciiBitLength = ascii.length * 8;
  let hash = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const k = [
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
  ];
  ascii += '\x80';
  while ((ascii.length % 64) - 56) ascii += '\x00';
  for (i = 0; i < ascii.length; i++) {
    j = ascii.charCodeAt(i);
    words[i >> 2] |= j << (((3 - i) % 4) * 8);
  }
  words[words.length] = (asciiBitLength / maxWord) | 0;
  words[words.length] = asciiBitLength | 0;
  for (j = 0; j < words.length;) {
    const w = words.slice(j, (j += 16)), oldHash = hash;
    hash = hash.slice(0, 8);
    for (i = 0; i < 64; i++) {
      const w15 = w[i - 15], w2 = w[i - 2], a = hash[0], e = hash[4];
      const t1 = hash[7] + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25)) + ((e & hash[5]) ^ (~e & hash[6])) + k[i] +
        (w[i] = i < 16 ? w[i] : (w[i - 16] + (rr(w15, 7) ^ rr(w15, 18) ^ (w15 >>> 3)) + w[i - 7] + (rr(w2, 17) ^ rr(w2, 19) ^ (w2 >>> 10))) | 0);
      const t2 = (rr(a, 2) ^ rr(a, 13) ^ rr(a, 22)) + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
      hash = [(t1 + t2) | 0].concat(hash);
      hash[4] = (hash[4] + t1) | 0;
    }
    for (i = 0; i < 8; i++) hash[i] = (hash[i] + oldHash[i]) | 0;
  }
  for (i = 0; i < 8; i++) for (j = 3; j + 1; j--) {
    const b = (hash[i] >> (j * 8)) & 255;
    result += (b < 16 ? '0' : '') + b.toString(16);
  }
  return result;
}

async function sha256(text) {
  const salted = text + AUTH_SALT;
  if (window.crypto?.subtle) {
    try {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salted));
      return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch (_) {}
  }
  return sha256Fallback(salted);
}

// --- SESSION & GRANULAR RBAC ---
function loadSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY);
    SRP.session = raw ? JSON.parse(raw) : null;
  } catch (_) { SRP.session = null; }
  return SRP.session;
}

function saveSession(sessionObj) {
  SRP.session = sessionObj;
  localStorage.setItem(SESSION_KEY, JSON.stringify(sessionObj));
}

function logoutSession(redirect = 'index.html') {
  SRP.session = null;
  localStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(SESSION_KEY);
  showToast("Logged out successfully.");
  setTimeout(() => { window.location.href = redirect; }, 350);
}

function isMasterAdmin() { return SRP.session?.role === 'master'; }
function isAnyAdmin() { return SRP.session?.role === 'master' || SRP.session?.role === 'sub'; }

function hasPerm(permKey) {
  if (isMasterAdmin()) return true;
  if (SRP.session?.role !== 'sub') return false;
  // Always check live sub_admins list if loaded so revoked permissions apply immediately
  const liveSub = SRP.subAdmins.find((s) => s.id === SRP.session.id);
  if (liveSub) {
    if (!liveSub.active) return false;
    return !!liveSub.permissions?.[permKey];
  }
  return !!SRP.session.permissions?.[permKey];
}

// --- 2-ATTEMPT LOGIN LOCKOUT (PERSISTED) ---
function getLockoutState() {
  try {
    const raw = localStorage.getItem(LOCKOUT_KEY);
    const data = raw ? JSON.parse(raw) : { attempts: 0, lockedUntil: 0 };
    if (data.lockedUntil && Date.now() >= data.lockedUntil) {
      localStorage.removeItem(LOCKOUT_KEY);
      return { attempts: 0, lockedUntil: 0 };
    }
    return data;
  } catch (_) { return { attempts: 0, lockedUntil: 0 }; }
}

function recordFailedLogin() {
  const st = getLockoutState();
  st.attempts = (st.attempts || 0) + 1;
  if (st.attempts >= MAX_LOGIN_ATTEMPTS) {
    st.lockedUntil = Date.now() + LOCKOUT_SECONDS * 1000;
  }
  localStorage.setItem(LOCKOUT_KEY, JSON.stringify(st));
  return st;
}

function clearLoginLockout() { localStorage.removeItem(LOCKOUT_KEY); }

// --- HELPERS ---
function escHtml(val) {
  return String(val ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function showToast(message, type = 'success') {
  let container = document.getElementById('alerts-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'alerts-container';
    container.className = 'fixed top-5 right-5 z-[300] flex flex-col gap-2.5 max-w-sm';
    document.body.appendChild(container);
  }
  const el = document.createElement('div');
  const bg = type === 'error' ? 'bg-red-500/20 border-red-500/50' : 'bg-emerald-500/20 border-emerald-400/50';
  const icon = type === 'error' ? 'fa-exclamation-circle text-red-400' : 'fa-check-circle text-emerald-400';
  el.className = `flex items-center gap-3 px-4 py-3 rounded-xl border backdrop-blur-md shadow-2xl text-white text-sm modal-content ${bg}`;
  el.innerHTML = `<i class="fas ${icon}"></i><span class="font-semibold">${escHtml(message)}</span>`;
  container.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(-12px) scale(0.95)';
    el.style.transition = 'all 0.3s ease';
    setTimeout(() => el.remove(), 320);
  }, 3200);
}

function copyText(text, label = 'Copied to clipboard!') {
  navigator.clipboard.writeText(text).then(() => showToast(label)).catch(() => showToast('Copy failed', 'error'));
}

function compressImageToWebP(file, maxSize = 220, quality = 0.84) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error("No file selected"));
    const allowed = ['image/png', 'image/jpeg', 'image/webp'];
    if (!allowed.includes(file.type)) return reject(new Error("Use PNG, JPG, or WEBP only."));
    if (file.size > 5 * 1024 * 1024) return reject(new Error("Image must be 5 MB or smaller."));
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w > h && w > maxSize) { h *= maxSize / w; w = maxSize; }
        else if (h >= w && h > maxSize) { w *= maxSize / h; h = maxSize; }
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(w);
        canvas.height = Math.round(h);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/webp', quality));
      };
      img.onerror = () => reject(new Error("Could not read image."));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error("File read failed."));
    reader.readAsDataURL(file);
  });
}

function getTeamBadge(team, size = "w-9 h-9", text = "text-xs") {
  const name = team?.name || 'T';
  const initials = name.split(' ').map((w) => w[0]).join('').substring(0, 2).toUpperCase();
  if (team?.logoUrl?.trim()) {
    return `<img src="${escHtml(team.logoUrl.trim())}" alt="${escHtml(name)}" class="${size} rounded-lg object-cover border border-white/15 flex-shrink-0" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><div style="display:none" class="${size} rounded-lg bg-emerald-500/15 border border-emerald-400/25 items-center justify-center font-black ${text} text-emerald-300 flex-shrink-0">${escHtml(initials)}</div>`;
  }
  return `<div class="${size} rounded-lg bg-emerald-500/15 border border-emerald-400/25 flex items-center justify-center font-black ${text} text-emerald-300 flex-shrink-0">${escHtml(initials)}</div>`;
}

function getPlayerAvatar(player, size = "w-11 h-11", text = "text-sm") {
  const ign = player?.ign || 'P';
  const init = ign.substring(0, 2).toUpperCase();
  if (player?.photoUrl?.trim()) {
    return `<img src="${escHtml(player.photoUrl.trim())}" alt="${escHtml(ign)}" class="${size} rounded-xl object-cover border border-emerald-400/30 flex-shrink-0">`;
  }
  return `<div class="${size} rounded-xl bg-emerald-500/15 border border-emerald-400/25 flex items-center justify-center font-black ${text} text-emerald-300 flex-shrink-0">${escHtml(init)}</div>`;
}

// --- STANDINGS & PLAYER STATS ENGINE ---
function getSortedTeams() {
  return SRP.teams.map((team) => {
    let M = 0, W = 0, L = 0, D = 0, RD = 0;
    const form = [];
    const teamMatches = [...SRP.matches]
      .filter((m) => m.teamAId === team.id || m.teamBId === team.id)
      .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

    teamMatches.forEach((m) => {
      const sA = parseInt(m.teamAScore) || 0;
      const sB = parseInt(m.teamBScore) || 0;
      const isA = m.teamAId === team.id;
      const my = isA ? sA : sB;
      const opp = isA ? sB : sA;
      M++; RD += (my - opp);
      if (my > opp) { W++; form.push('W'); }
      else if (my < opp) { L++; form.push('L'); }
      else { D++; form.push('D'); }
    });
    return { ...team, M, W, L, D, RD, P: W * 3 + D, form: form.slice(-5) };
  }).sort((a, b) => {
    if (a.disqualified && !b.disqualified) return 1;
    if (!a.disqualified && b.disqualified) return -1;
    if (b.P !== a.P) return b.P - a.P;
    if (b.RD !== a.RD) return b.RD - a.RD;
    return String(a.name || '').localeCompare(String(b.name || ''));
  });
}

function getPlayersForTeam(team) {
  if (!team) return [];
  const fromCollection = SRP.players.filter((p) => p.teamId === team.id);
  if (fromCollection.length) {
    return fromCollection.sort((a, b) => (a.isSub ? 1 : 0) - (b.isSub ? 1 : 0) || (a.slotOrder || 0) - (b.slotOrder || 0));
  }
  // Backward compatibility with Season 4/5 teams that only stored `team.roster`
  const r = team.roster || {};
  const fallback = [];
  ['p1', 'p2', 'p3', 'p4'].forEach((k, idx) => {
    if (r[k]?.trim()) fallback.push({ id: `legacy_${team.id}_${k}`, teamId: team.id, ign: r[k].trim(), uid: '', device: '', role: idx === 0 ? 'IGL' : 'Starter', isSub: false, photoUrl: '' });
  });
  ['sub1', 'sub2', 'sub3', 'sub4'].forEach((k) => {
    if (r[k]?.trim()) fallback.push({ id: `legacy_${team.id}_${k}`, teamId: team.id, ign: r[k].trim(), uid: '', device: '', role: 'Sub', isSub: true, photoUrl: '' });
  });
  return fallback;
}

function getAllPlayersWithStats() {
  const statMap = {};
  SRP.matches.forEach((m) => {
    (m.stats || []).forEach((s) => {
      const key = `${(s.team || '').toLowerCase()}::${(s.player || '').trim().toLowerCase()}`;
      if (!statMap[key]) statMap[key] = { kills: 0, deaths: 0, assists: 0, matches: 0 };
      statMap[key].kills += parseInt(s.kills) || 0;
      statMap[key].deaths += parseInt(s.deaths) || 0;
      statMap[key].assists += parseInt(s.assists) || 0;
      statMap[key].matches += 1;
    });
  });

  const all = [];
  SRP.teams.forEach((team) => {
    getPlayersForTeam(team).forEach((p) => {
      const key = `${(team.name || '').toLowerCase()}::${(p.ign || '').trim().toLowerCase()}`;
      const st = statMap[key] || { kills: 0, deaths: 0, assists: 0, matches: 0 };
      const kd = st.deaths > 0 ? (st.kills / st.deaths).toFixed(2) : st.kills.toFixed(2);
      all.push({ ...p, teamName: team.name, teamLogo: team.logoUrl || '', teamDisqualified: !!team.disqualified, ...st, kd });
    });
  });
  return all;
}

// --- UNIVERSAL SLIDE-UP PROFILE DRAWER (TEAM <-> PLAYER) ---
function ensureDrawerMarkup() {
  if (document.getElementById('srp-profile-drawer')) return;
  const div = document.createElement('div');
  div.id = 'srp-profile-drawer';
  div.className = 'drawer-overlay hidden';
  div.onclick = (e) => { if (e.target === div) closeProfileDrawer(); };
  div.innerHTML = `<div class="drawer-panel" id="srp-drawer-body"></div>`;
  document.body.appendChild(div);
}

function closeProfileDrawer() {
  const el = document.getElementById('srp-profile-drawer');
  if (el) el.classList.add('hidden');
}

function openTeamDrawer(teamId) {
  ensureDrawerMarkup();
  const team = getSortedTeams().find((t) => t.id === teamId);
  if (!team) return;
  const roster = getPlayersForTeam(team);
  const teamMatches = [...SRP.matches]
    .filter((m) => m.teamAId === team.id || m.teamBId === team.id)
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
    .slice(0, 5);

  const formHtml = team.form.length
    ? team.form.map((f) => `<span class="px-2 py-0.5 rounded text-[11px] font-black ${f === 'W' ? 'bg-emerald-500/20 text-emerald-300' : f === 'L' ? 'bg-red-500/20 text-red-300' : 'bg-slate-600/30 text-slate-300'}">${f}</span>`).join('')
    : `<span class="text-xs text-slate-500">No matches yet</span>`;

  document.getElementById('srp-drawer-body').innerHTML = `
    <div class="flex items-start justify-between gap-3 mb-5">
      <div class="flex items-center gap-3 min-w-0">
        ${getTeamBadge(team, 'w-14 h-14', 'text-lg')}
        <div class="min-w-0">
          <h3 class="text-xl font-black text-white truncate">${escHtml(team.name)}</h3>
          <div class="flex flex-wrap items-center gap-2 mt-1">
            ${team.disqualified
              ? `<span class="text-xs font-bold text-red-400"><i class="fas fa-ban mr-1"></i>Disqualified${team.dqReason ? ': ' + escHtml(team.dqReason) : ''}</span>`
              : `<span class="cs-pill">${team.P} PTS · ${team.W}W-${team.L}L · RD ${team.RD >= 0 ? '+' : ''}${team.RD}</span>`}
          </div>
        </div>
      </div>
      <button onclick="closeProfileDrawer()" class="text-slate-400 hover:text-white text-xl p-1"><i class="fas fa-times"></i></button>
    </div>

    <div class="mb-5">
      <div class="text-[11px] uppercase tracking-wider text-slate-400 font-bold mb-2">Recent Form</div>
      <div class="flex items-center gap-1.5">${formHtml}</div>
    </div>

    <div class="mb-5">
      <div class="flex items-center justify-between mb-2">
        <span class="text-[11px] uppercase tracking-wider text-emerald-400 font-bold">Squad Roster (Tap player for info)</span>
        <span class="text-[11px] text-slate-400">${roster.length} players</span>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        ${roster.length ? roster.map((p) => `
          <button type="button" onclick="openPlayerDrawer('${escHtml(p.id)}', '${escHtml(team.id)}')"
            class="flex items-center gap-3 p-2.5 rounded-xl bg-white/5 hover:bg-emerald-500/15 border border-white/10 hover:border-emerald-400/40 transition-all text-left">
            ${getPlayerAvatar(p, 'w-10 h-10', 'text-xs')}
            <div class="min-w-0 flex-1">
              <div class="text-sm font-bold text-white truncate">${escHtml(p.ign)}</div>
              <div class="text-[10px] text-emerald-300 font-semibold uppercase">${escHtml(p.role || (p.isSub ? 'Sub' : 'Starter'))}${p.uid ? ' · UID ' + escHtml(p.uid) : ''}</div>
            </div>
            <i class="fas fa-chevron-right text-xs text-slate-500"></i>
          </button>
        `).join('') : `<div class="col-span-2 text-xs text-slate-500 italic p-3">No roster registered yet.</div>`}
      </div>
    </div>

    <div>
      <div class="text-[11px] uppercase tracking-wider text-slate-400 font-bold mb-2">Recent Matches</div>
      <div class="space-y-2">
        ${teamMatches.length ? teamMatches.map((m) => `
          <div class="flex items-center justify-between p-2.5 rounded-xl bg-black/35 border border-white/5 text-xs">
            <span class="truncate max-w-[38%] font-semibold text-white">${escHtml(m.teamAName)}</span>
            <span class="px-2 py-0.5 rounded bg-white/5 font-black text-yellow-400">${m.teamAScore || 0} : ${m.teamBScore || 0}</span>
            <span class="truncate max-w-[38%] font-semibold text-white text-right">${escHtml(m.teamBName)}</span>
          </div>
        `).join('') : `<div class="text-xs text-slate-500 italic">No matches recorded yet.</div>`}
      </div>
    </div>
  `;
  document.getElementById('srp-profile-drawer').classList.remove('hidden');
}

function openPlayerDrawer(playerId, backTeamId = null) {
  ensureDrawerMarkup();
  const all = getAllPlayersWithStats();
  const p = all.find((x) => x.id === playerId);
  if (!p) return;
  const team = SRP.teams.find((t) => t.id === p.teamId);
  const shareUrl = `${location.origin}${location.pathname.replace(/[^/]*$/, '')}players.html?player=${encodeURIComponent(p.id)}`;

  document.getElementById('srp-drawer-body').innerHTML = `
    <div class="flex items-center justify-between mb-4">
      ${backTeamId
        ? `<button type="button" onclick="openTeamDrawer('${escHtml(backTeamId)}')" class="custom-btn secondary !py-1.5 !px-3 text-xs"><i class="fas fa-arrow-left"></i> Back to Team</button>`
        : `<span class="cs-pill">Player Profile</span>`}
      <button onclick="closeProfileDrawer()" class="text-slate-400 hover:text-white text-xl p-1"><i class="fas fa-times"></i></button>
    </div>

    <div class="p-4 rounded-2xl bg-gradient-to-br from-emerald-950/80 to-black/60 border border-emerald-400/25 mb-4">
      <div class="flex items-center gap-4">
        ${getPlayerAvatar(p, 'w-20 h-20', 'text-2xl')}
        <div class="min-w-0 flex-1">
          <span class="cs-pill mb-1">${escHtml(p.role || (p.isSub ? 'Substitute' : 'Starter'))}</span>
          <h3 class="text-2xl font-black text-white truncate">${escHtml(p.ign)}</h3>
          <button type="button" onclick="openTeamDrawer('${escHtml(p.teamId)}')" class="flex items-center gap-2 mt-1.5 text-xs text-emerald-300 hover:underline">
            ${getTeamBadge(team, 'w-5 h-5', 'text-[9px]')}
            <span class="font-bold truncate">${escHtml(p.teamName)}</span>
          </button>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-2.5 mt-4">
        <div class="p-3 rounded-xl bg-black/40 border border-white/10">
          <div class="text-[10px] uppercase text-slate-400 font-bold">Free Fire UID</div>
          <div class="flex items-center justify-between gap-2 mt-1">
            <span class="font-mono font-bold text-sm text-white truncate">${escHtml(p.uid || 'Not Set')}</span>
            ${p.uid ? `<button type="button" onclick="copyText('${escHtml(p.uid)}', 'UID copied!')" class="text-emerald-400 hover:text-emerald-300 text-xs"><i class="fas fa-copy"></i></button>` : ''}
          </div>
        </div>
        <div class="p-3 rounded-xl bg-black/40 border border-white/10">
          <div class="text-[10px] uppercase text-slate-400 font-bold">Device</div>
          <div class="font-bold text-sm text-white truncate mt-1">${escHtml(p.device || 'Not Set')}</div>
        </div>
      </div>
    </div>

    <div class="grid grid-cols-4 gap-2 mb-4 text-center">
      <div class="p-2.5 rounded-xl bg-white/5 border border-white/10"><div class="text-[10px] text-slate-400 uppercase">Kills</div><div class="text-lg font-black text-emerald-400">${p.kills}</div></div>
      <div class="p-2.5 rounded-xl bg-white/5 border border-white/10"><div class="text-[10px] text-slate-400 uppercase">Deaths</div><div class="text-lg font-black text-red-400">${p.deaths}</div></div>
      <div class="p-2.5 rounded-xl bg-white/5 border border-white/10"><div class="text-[10px] text-slate-400 uppercase">Assists</div><div class="text-lg font-black text-yellow-400">${p.assists}</div></div>
      <div class="p-2.5 rounded-xl bg-white/5 border border-white/10"><div class="text-[10px] text-slate-400 uppercase">K/D</div><div class="text-lg font-black text-white">${p.kd}</div></div>
    </div>

    <button type="button" onclick="copyText('${escHtml(shareUrl)}', 'Player profile link copied!')" class="custom-btn w-full">
      <i class="fas fa-share-nodes"></i> Copy Shareable Profile Link
    </button>
  `;
  document.getElementById('srp-profile-drawer').classList.remove('hidden');
}

// --- SHARED SHELL (SIDEBAR, MOBILE BOTTOM BAR, LIVE BANNER, PWA) ---
function renderSharedShell(activePage) {
  loadSession();
  const isMaster = isMasterAdmin();
  const isStaff = isAnyAdmin();

  const navItems = [
    { id: 'index', href: 'index.html', icon: 'fa-trophy', label: 'Leaderboard' },
    { id: 'tournament', href: 'tournament.html', icon: 'fa-sitemap', label: 'Tournament' },
    { id: 'players', href: 'players.html', icon: 'fa-users', label: 'Players & MVP' },
    { id: 'rules', href: 'rules.html', icon: 'fa-scale-balanced', label: 'Rules & Prize' },
    { id: 'save-trees', href: 'save-trees.html', icon: 'fa-tree', label: 'Save Trees' },
    { id: 'register', href: 'register.html', icon: 'fa-user-plus', label: 'Register' },
    { id: 'hall-of-fame', href: 'hall-of-fame.html', icon: 'fa-crown', label: 'Hall of Fame' },
    { id: 'admin', href: 'admin.html', icon: 'fa-shield-halved', label: isStaff ? 'Admin Ops' : 'Admin Login' }
  ];
  if (isMaster) navItems.push({ id: 'vault', href: 'vault.html', icon: 'fa-vault', label: 'System Vault' });

  const sidebar = document.getElementById('app-sidebar');
  if (sidebar) {
    sidebar.innerHTML = `
      <div>
        <div class="px-2 mb-6 hidden md:block">
          <a href="index.html" class="no-underline">
            <h2 class="text-2xl font-black tracking-wider uppercase glow-title brand-text">SRP-ESPORTS</h2>
            <div class="season-label text-xs text-emerald-400 font-bold tracking-widest uppercase mt-0.5">${escHtml(SRP.settings.season)}</div>
          </a>
        </div>
        <nav class="space-y-1">
          ${navItems.map((n) => `
            <a href="${n.href}" class="nav-link ${activePage === n.id ? 'active' : ''}">
              <i class="fas ${n.icon} w-5 text-center"></i><span>${n.label}</span>
            </a>
          `).join('')}
        </nav>
        <button id="pwa-install-btn" type="button" onclick="triggerPwaInstall()" class="hidden custom-btn secondary w-full mt-4 text-xs">
          <i class="fas fa-download"></i> Install App
        </button>
      </div>
      ${isStaff ? `
        <div class="p-3 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between mt-4">
          <div class="min-w-0">
            <div class="text-[10px] uppercase text-emerald-400 font-bold">${isMaster ? 'Master Admin' : 'Sub-Admin'}</div>
            <div class="text-sm font-bold text-white truncate">${escHtml(SRP.session.username)}</div>
          </div>
          <button onclick="logoutSession()" title="Logout" class="text-slate-400 hover:text-red-400 p-2"><i class="fas fa-sign-out-alt"></i></button>
        </div>
      ` : ''}
    `;
  }

  // Mobile header + bottom bar
  const mobileBar = document.getElementById('mobile-bottom-nav');
  if (mobileBar) {
    mobileBar.innerHTML = `
      <a href="index.html" class="mobile-nav-item ${activePage === 'index' ? 'active' : ''}"><i class="fas fa-trophy"></i><span>Home</span></a>
      <a href="tournament.html" class="mobile-nav-item ${activePage === 'tournament' ? 'active' : ''}"><i class="fas fa-sitemap"></i><span>Matches</span></a>
      <a href="players.html" class="mobile-nav-item ${activePage === 'players' ? 'active' : ''}"><i class="fas fa-users"></i><span>Players</span></a>
      <a href="rules.html" class="mobile-nav-item ${activePage === 'rules' ? 'active' : ''}"><i class="fas fa-scale-balanced"></i><span>Rules</span></a>
      <button type="button" onclick="toggleMobileDrawer()" class="mobile-nav-item bg-transparent border-0"><i class="fas fa-bars"></i><span>More</span></button>
    `;
  }
}

function toggleMobileDrawer() {
  const s = document.getElementById('app-sidebar');
  if (s) s.classList.toggle('-translate-x-full');
}

function renderLiveStreamBanner() {
  const slot = document.getElementById('live-stream-slot');
  if (!slot) return;
  const ls = SRP.settings.liveStream || {};
  if (!ls.active || !ls.url) { slot.innerHTML = ''; return; }
  slot.innerHTML = `
    <div class="live-stream-banner">
      <div class="flex items-center gap-3 min-w-0">
        <span class="live-dot flex-shrink-0"></span>
        <div class="min-w-0">
          <div class="text-[10px] uppercase tracking-widest text-red-300 font-black">Live Now on YouTube</div>
          <div class="text-sm font-bold text-white truncate">${escHtml(ls.title || 'SRP-ESPORTS Season 6 Live')}</div>
        </div>
      </div>
      <a href="${escHtml(ls.url)}" target="_blank" rel="noopener noreferrer" class="custom-btn delete !py-2 !px-4 text-xs">
        <i class="fab fa-youtube"></i> Watch Live
      </a>
    </div>
  `;
}

// --- CONFIRMATION MODAL ---
let _confirmCb = null;
function openConfirmModal(title, message, onConfirm, btnText = 'Confirm', btnClass = 'delete') {
  let modal = document.getElementById('srp-confirm-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'srp-confirm-modal';
    modal.className = 'fixed inset-0 modal-overlay z-[280] hidden flex items-center justify-center p-4';
    modal.innerHTML = `
      <div class="custom-card w-full max-w-sm modal-content !m-0 text-center">
        <i class="fas fa-exclamation-triangle text-red-400 text-4xl mb-3"></i>
        <h3 id="srp-confirm-title" class="text-xl font-black text-white mb-2"></h3>
        <p id="srp-confirm-msg" class="text-xs text-slate-400 mb-5"></p>
        <div class="flex gap-3">
          <button type="button" onclick="closeConfirmModal()" class="flex-1 custom-btn secondary">Cancel</button>
          <button type="button" id="srp-confirm-yes" class="flex-1 custom-btn delete">Confirm</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    document.getElementById('srp-confirm-yes').onclick = () => { if (_confirmCb) _confirmCb(); closeConfirmModal(); };
  }
  document.getElementById('srp-confirm-title').textContent = title;
  document.getElementById('srp-confirm-msg').textContent = message;
  const yes = document.getElementById('srp-confirm-yes');
  yes.textContent = btnText;
  yes.className = `flex-1 custom-btn ${btnClass}`;
  _confirmCb = onConfirm;
  modal.classList.remove('hidden');
}
function closeConfirmModal() { document.getElementById('srp-confirm-modal')?.classList.add('hidden'); _confirmCb = null; }

// --- REALTIME FIRESTORE SYNC ---
function onSrpDataUpdate(cb) { SRP.listeners.push(cb); }
function notifySrpUpdate() {
  document.body.setAttribute('data-theme', SRP.settings.theme || 'save-trees');
  document.querySelectorAll('.season-label').forEach((el) => (el.textContent = SRP.settings.season || 'Season 6'));
  renderMaintenanceMode();
  renderLiveStreamBanner();
  SRP.listeners.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });
}

function renderMaintenanceMode() {
  let screen = document.getElementById('srp-maintenance-screen');
  if (SRP.settings.maintenanceMode !== true) {
    screen?.remove();
    return;
  }
  if (!screen) {
    screen = document.createElement('div');
    screen.id = 'srp-maintenance-screen';
    screen.className = 'srp-maintenance-screen';
    screen.setAttribute('role', 'alertdialog');
    screen.setAttribute('aria-modal', 'true');
    screen.setAttribute('aria-labelledby', 'srp-maintenance-title');
    screen.innerHTML = '<section class="srp-maintenance-card"><div class="srp-maintenance-mark" aria-hidden="true">SRP</div><div class="srp-maintenance-kicker">SRP-ESPORTS · SEASON 6</div><h1 id="srp-maintenance-title">We’ll be back soon</h1><p id="srp-maintenance-notice"></p><div class="srp-maintenance-foot"><span class="srp-maintenance-dot"></span> The tournament site is temporarily paused.</div></section>';
    document.body.appendChild(screen);
  }
  const notice = String(SRP.settings.maintenanceNotice || '').trim() || 'We’re making a few updates. Please check back soon.';
  screen.querySelector('#srp-maintenance-notice').textContent = notice;
}

function initSrpCore(activePage) {
  renderSharedShell(activePage);

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    SRP.deferredInstallPrompt = e;
    document.getElementById('pwa-install-btn')?.classList.remove('hidden');
  });

  db.collection('settings').doc('tournament').onSnapshot((doc) => {
    if (doc.exists) SRP.settings = { ...SRP.settings, ...doc.data() };
    notifySrpUpdate();
  });
  db.collection('settings').doc('past_season').onSnapshot((doc) => {
    if (doc.exists) SRP.pastSeason = doc.data();
    notifySrpUpdate();
  });
  db.collection('settings').doc('rules').onSnapshot((doc) => {
    if (doc.exists) SRP.rulesData = doc.data();
    notifySrpUpdate();
  });
  db.collection('teams').onSnapshot((snap) => {
    SRP.teams = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    notifySrpUpdate();
  });
  db.collection('players').onSnapshot((snap) => {
    SRP.players = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    notifySrpUpdate();
  });
  db.collection('matches').onSnapshot((snap) => {
    SRP.matches = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    notifySrpUpdate();
  });
  db.collection('tournament_slots').onSnapshot((snap) => {
    SRP.slots = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    notifySrpUpdate();
  });
  db.collection('tournament_matches').onSnapshot((snap) => {
    SRP.tMatches = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    notifySrpUpdate();
  });
  if (isAnyAdmin()) {
    db.collection('tokens').onSnapshot((snap) => {
      SRP.tokens = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      notifySrpUpdate();
    });
    db.collection('sub_admins').onSnapshot((snap) => {
      SRP.subAdmins = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      notifySrpUpdate();
    });
  }
}

async function triggerPwaInstall() {
  if (!SRP.deferredInstallPrompt) return;
  SRP.deferredInstallPrompt.prompt();
  await SRP.deferredInstallPrompt.userChoice;
  SRP.deferredInstallPrompt = null;
  document.getElementById('pwa-install-btn')?.classList.add('hidden');
}
