/* SRP-ESPORTS Season 6 — modular administrator interface.
 * All database writes are still checked by Firestore Security Rules.
 */
(function () {
  'use strict';

  const { auth, db, functions, readAdminIdentity } = window.SRPAdminFirebase;
  const $ = (id) => document.getElementById(id);
  const PERMISSIONS = [
    { group: 'Teams', items: [
      ['team_add', 'Add teams'], ['team_edit_info', 'Edit team name and logo'],
      ['team_lock_roster', 'Lock / unlock rosters'], ['team_dq', 'Disqualify / reinstate teams'], ['team_delete', 'Delete teams']
    ]},
    { group: 'Players', items: [
      ['player_edit_details', 'Edit player details / add starters'], ['player_edit_photo', 'Change player photos'], ['player_manage_subs', 'Add / remove substitutes']
    ]},
    { group: 'Matches', items: [
      ['match_create', 'Create match sessions'], ['match_edit_score', 'Edit scores, map and round'],
      ['match_edit_stats', 'Edit player K/D/A statistics'], ['match_edit_vod', 'Add / edit proof and VOD links'], ['match_delete', 'Delete matches']
    ]},
    { group: 'Tokens', items: [
      ['token_view', 'View and copy tokens'], ['token_create', 'Generate season tokens'], ['token_delete', 'Revoke tokens']
    ]},
    { group: 'Public content', items: [
      ['announcement_edit', 'Publish announcements'], ['livestream_edit', 'Manage livestream banner'],
      ['rules_edit', 'Edit tournament rules'], ['prize_edit', 'Edit prize pool']
    ]},
    { group: 'Tournament progression', items: [
      ['tourney_scores', 'Edit tournament stage results'], ['tourney_slots', 'Manage tournament slots']
    ]}
  ];

  const state = {
    identity: null,
    activePage: 'overview',
    teams: [], players: [], matches: [], slots: [], tournamentMatches: [], tokens: [], subAdmins: [], applications: [],
    settings: { tournament: {}, rules: {}, past_season: {} },
    unsubs: [],
    loaded: false
  };

  const TITLES = {
    overview: 'Dashboard', teams: 'Teams', players: 'Players', matches: 'Match Center',
    tournament: 'Tournament Progression', content: 'Content & Settings', tokens: 'Season Tokens',
    subadmins: 'Sub-admin Management', backups: 'Backups', applications: 'Team Applications'
  };

  const PAGE_ACCESS = {
    teams: ['team_add','team_edit_info','team_lock_roster','team_dq','team_delete'],
    players: ['player_edit_details','player_edit_photo','player_manage_subs'],
    matches: ['match_create','match_edit_score','match_edit_stats','match_edit_vod','match_delete'],
    tournament: ['tourney_slots','tourney_scores'],
    content: ['announcement_edit','livestream_edit','rules_edit','prize_edit'],
    tokens: ['token_view','token_create','token_delete']
  };

  function isMaster() { return state.identity?.role === 'master'; }
  function can(permission) {
    return isMaster() || (!!state.identity && state.identity.role === 'sub' && state.identity.permissions?.[permission] === true);
  }
  function canAny(keys) { return isMaster() || keys.some(can); }
  function requirePermission(permission) {
    if (!can(permission)) throw new Error('Your sub-admin account does not have this permission.');
  }
  function requireMaster() {
    if (!isMaster()) throw new Error('Only the master administrator can perform this action.');
  }
  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  }
  function asDate(value) {
    if (!value) return '';
    try {
      if (typeof value.toDate === 'function') return value.toDate().toLocaleString('en-IN');
      if (typeof value === 'number') return new Date(value).toLocaleString('en-IN');
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('en-IN');
    } catch (_) { return String(value); }
  }
  function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = 'toast' + (type === 'error' ? ' error' : '');
    toast.textContent = message;
    $('toast-stack').appendChild(toast);
    setTimeout(() => toast.remove(), 4200);
  }
  function openModal(title, body, footer) {
    $('modal-title').textContent = title;
    $('modal-body').innerHTML = body;
    $('modal-foot').innerHTML = footer || '<button class="quiet-action" data-modal-close>Close</button>';
    $('admin-modal').classList.add('open');
  }
  function closeModal() { $('admin-modal').classList.remove('open'); $('modal-body').innerHTML = ''; $('modal-foot').innerHTML = ''; }
  function makeInput(label, id, value = '', type = 'text', extra = '') {
    return `<div class="form-row"><label class="field-label" for="${esc(id)}">${esc(label)}</label><input class="admin-field" id="${esc(id)}" type="${esc(type)}" value="${esc(value)}" ${extra}></div>`;
  }
  function makeSelect(label, id, value, options, extra = '') {
    return `<div class="form-row"><label class="field-label" for="${esc(id)}">${esc(label)}</label><select class="admin-select" id="${esc(id)}" ${extra}>${options.map(o => `<option value="${esc(o.value)}" ${String(o.value) === String(value) ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select></div>`;
  }
  function setAuthScreen(showApp) {
    $('auth-screen').hidden = !!showApp;
    $('admin-app').hidden = !showApp;
  }

  function buildNavigation() {
    const items = [
      { label: 'Workspace', pages: [{id:'overview',icon:'fa-gauge-high',label:'Overview'}] },
      { label: 'Tournament management', pages: [
        {id:'teams',icon:'fa-users',label:'Teams'}, {id:'players',icon:'fa-user-group',label:'Players'},
        {id:'matches',icon:'fa-gamepad',label:'Match Center'}, {id:'tournament',icon:'fa-trophy',label:'Tournament Progression'}
      ]},
      { label: 'Registration', pages: [{id:'applications',icon:'fa-clipboard-check',label:'Team Applications',master:true}] },
      { label: 'System', pages: [
        {id:'content',icon:'fa-sliders',label:'Content & Settings'}, {id:'tokens',icon:'fa-ticket',label:'Season Tokens'},
        {id:'subadmins',icon:'fa-user-shield',label:'Sub-admins',master:true}, {id:'backups',icon:'fa-box-archive',label:'Backups',master:true}
      ]}
    ];
    $('admin-navigation').innerHTML = items.map(group => {
      const available = group.pages.filter(page => {
        if (page.master) return isMaster();
        if (page.id === 'overview') return true;
        return canAny(PAGE_ACCESS[page.id] || []);
      });
      if (!available.length) return '';
      return `<div class="sidebar-group"><div class="sidebar-label">${esc(group.label)}</div>${available.map(p => `<button class="side-link ${state.activePage === p.id ? 'active' : ''}" data-page="${p.id}"><i class="fa-solid ${p.icon}"></i><span>${esc(p.label)}</span></button>`).join('')}</div>`;
    }).join('');
  }

  function openPage(page) {
    if (page !== 'overview' && page !== 'subadmins' && page !== 'backups' && page !== 'applications' && !canAny(PAGE_ACCESS[page] || [])) {
      showToast('Your account has no access to this section.', 'error');
      return;
    }
    if (page === 'subadmins' || page === 'backups' || page === 'applications') {
      if (!isMaster()) return showToast('Master administrator access required.', 'error');
    }
    state.activePage = page;
    document.querySelectorAll('.admin-page').forEach(el => el.classList.toggle('active', el.id === `page-${page}`));
    $('topbar-title').textContent = TITLES[page] || 'Admin';
    buildNavigation();
    $('admin-sidebar').classList.remove('open');
    $('mobile-backdrop').classList.remove('open');
    renderActivePage();
  }

  function subscribeCollection(name, key, predicate = () => true) {
    const unsubscribe = db.collection(name).onSnapshot(snapshot => {
      state[key] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(predicate);
      if (key === 'teams' || key === 'players' || key === 'matches' || key === 'tokens') renderStats();
      renderActivePage();
    }, error => {
      console.error(`SRP admin: ${name} read failed`, error);
      showToast(`${name}: ${error.message || 'Could not read data.'}`, 'error');
    });
    state.unsubs.push(unsubscribe);
  }

  function subscribeDocument(id, key) {
    const unsubscribe = db.collection('settings').doc(id).onSnapshot(doc => {
      state.settings[key] = doc.exists ? doc.data() : {};
      if (key === 'tournament') {
        $('overview-season').textContent = state.settings.tournament.season || 'Season 6';
        $('overview-theme').textContent = state.settings.tournament.theme || 'save-trees';
      }
      if (state.activePage === 'content') fillContentSettings();
    }, error => {
      console.error(`settings/${id} read failed`, error);
      showToast(`Settings read failed: ${error.message}`, 'error');
    });
    state.unsubs.push(unsubscribe);
  }

  function startDataListeners() {
    state.unsubs.forEach(fn => { try { fn(); } catch (_) {} });
    state.unsubs = [];
    subscribeCollection('teams', 'teams');
    subscribeCollection('players', 'players');
    subscribeCollection('matches', 'matches');
    subscribeCollection('tournament_slots', 'slots');
    subscribeCollection('tournament_matches', 'tournamentMatches');
    subscribeDocument('tournament', 'tournament');
    subscribeDocument('rules', 'rules');
    subscribeDocument('past_season', 'past_season');
    if (can('token_view') || isMaster()) subscribeCollection('tokens', 'tokens');
    if (isMaster()) subscribeCollection('sub_admins', 'subAdmins');
    if (isMaster()) {
      loadApplications();
      initializeRegistrationCounter().catch(error => { console.error('Registration capacity setup failed:', error); });
    }
  }

  async function loadApplications() {
    if (!isMaster()) return;
    try {
      const snapshot = await db.collection('registration_applications').orderBy('createdAt', 'desc').limit(100).get();
      state.applications = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      renderActivePage();
    } catch (error) {
      console.error('Applications could not be loaded:', error);
      if (state.activePage === 'applications') showToast(error.message || 'Could not load applications.', 'error');
    }
  }

  async function initializeRegistrationCounter() {
    if (!isMaster()) return;
    const settingsRef = db.collection('settings').doc('tournament');
    const [teams, applications] = await Promise.all([
      db.collection('teams').get(),
      db.collection('registration_applications').where('status', '==', 'pending').get()
    ]);
    await db.runTransaction(async transaction => {
      const settingsSnap = await transaction.get(settingsRef);
      const settings = settingsSnap.exists ? settingsSnap.data() : {};
      if (typeof settings.registrationReservedCount === 'number' && Number.isInteger(settings.registrationReservedCount)) return;
      transaction.set(settingsRef, {
        registrationReservedCount: teams.size + applications.size,
        lastRegistrationId: null
      }, { merge: true });
    });
  }

  function renderApplications() {
    const target = $('applications-body');
    if (!target) return;
    target.innerHTML = state.applications.length ? state.applications.map(app => `<tr>
      <td><div class="table-primary">${esc(app.teamName || 'Team application')}</div><span class="table-secondary">${esc(app.id)}</span></td>
      <td><div class="table-primary">${esc(app.captainName || '—')}</div><span class="table-secondary">${esc(app.email || '')}</span></td>
      <td>${(app.players || []).length}</td><td>${esc(asDate(app.createdAt) || '—')}</td>
      <td><span class="status-pill ${app.status === 'pending' ? 'warning' : app.status === 'rejected' ? 'danger' : ''}">${esc(app.status || 'pending')}</span></td>
      <td><div class="table-actions"><button class="mini-action" data-view-application="${esc(app.id)}"><i class="fa-solid fa-eye"></i> View</button></div></td></tr>`).join('') : '<tr><td colspan="6"><div class="empty-state">No team applications have been submitted yet.</div></td></tr>';
  }

  async function viewApplication(id) {
    requireMaster();
    const snapshot = await db.collection('registration_applications').doc(id).get();
    if (!snapshot.exists) throw new Error('Application not found.');
    const app = { id: snapshot.id, ...snapshot.data() };
    const players = (app.players || []).map((p, index) => `<div class="info-tile" style="margin-top:10px"><strong>${p.isSub ? 'Substitute' : 'Player'} ${index + 1} · ${esc(p.ign || '')}</strong><div class="table-secondary">UID: ${esc(p.uid || '')} · Device: ${esc(p.device || '')}</div>${p.photo ? `<img src="${esc(p.photo)}" alt="${esc(p.ign)} player photo" style="display:block;max-width:150px;max-height:150px;object-fit:cover;border-radius:12px;margin-top:8px">` : ''}</div>`).join('');
    const body = `<div class="info-tile"><strong>${esc(app.teamName)}</strong><div class="table-secondary">Captain: ${esc(app.captainName)} · ${esc(app.email)}${app.discord ? ` · Discord: ${esc(app.discord)}` : ''}</div><div class="table-secondary">Status: ${esc(app.status || 'pending')}</div></div>${players}`;
    const actions = app.status === 'pending' ? `<button class="quiet-action" data-modal-close>Close</button><button class="quiet-action" data-review-application="reject|${esc(id)}">Reject</button><button class="primary-action" data-review-application="approve|${esc(id)}">Approve and add team</button>` : '<button class="quiet-action" data-modal-close>Close</button>';
    openModal('Review team application', body, actions);
  }

  async function reviewApplication(decision, id) {
    requireMaster();
    const label = decision === 'approve' ? 'approve this application and create its team and players' : 'reject this application and return its token';
    if (!window.confirm(`Are you sure you want to ${label}?`)) return;
    const appRef = db.collection('registration_applications').doc(id);
    const settingsRef = db.collection('settings').doc('tournament');
    const teamRef = db.collection('teams').doc();
    const playerRefs = Array.from({ length: 6 }, () => db.collection('players').doc());
    await db.runTransaction(async transaction => {
      const appSnap = await transaction.get(appRef);
      const settingsSnap = await transaction.get(settingsRef);
      if (!appSnap.exists) throw new Error('Application not found.');
      const app = appSnap.data();
      if (app.status !== 'pending') throw new Error('This application has already been reviewed.');
      const settings = settingsSnap.exists ? settingsSnap.data() : {};
      if (decision === 'reject') {
        const tokenRef = app.tokenDocumentId ? db.collection('tokens').doc(app.tokenDocumentId) : null;
        const tokenSnap = tokenRef ? await transaction.get(tokenRef) : null;
        transaction.update(appRef, { status: 'rejected', reviewedAt: firebase.firestore.FieldValue.serverTimestamp(), reviewedBy: auth.currentUser.uid });
        if (tokenSnap?.exists) transaction.update(tokenRef, {
          used: false, usedBy: null,
          registrationApplicationId: firebase.firestore.FieldValue.delete(),
          redeemedAt: firebase.firestore.FieldValue.delete()
        });
        transaction.update(settingsRef, {
          registrationReservedCount: Math.max(0, Number(settings.registrationReservedCount) - 1)
        });
        return;
      }
      if (decision !== 'approve') throw new Error('Choose approve or reject.');
      const capacity = Math.max(1, Math.min(128, Number(settings.totalTeams) || 24));
      if (state.teams.length >= capacity) throw new Error('The season is full. Free a team place before approving.');
      const group = String.fromCharCode(65 + Math.min(3, Math.floor(state.teams.length / Math.max(1, Math.ceil(capacity / 4)))));
      transaction.set(teamRef, {
        name: app.teamName, group, disqualified: false, rosterLocked: false,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        registrationApplicationId: id
      });
      (app.players || []).forEach((player, index) => transaction.set(playerRefs[index], {
        teamId: teamRef.id, ign: player.ign, uid: player.uid, device: player.device,
        role: player.isSub ? 'Sub' : (index === 0 ? 'Captain' : 'Starter'),
        isSub: !!player.isSub, slotOrder: index,
        photoUrl: player.photo || '',
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      }));
      transaction.update(appRef, {
        status: 'approved', teamId: teamRef.id,
        reviewedAt: firebase.firestore.FieldValue.serverTimestamp(), reviewedBy: auth.currentUser.uid
      });
    });
    closeModal();
    showToast(decision === 'approve' ? 'Application approved; team and players added.' : 'Application rejected; token returned.');
    await loadApplications();
  }

  function renderStats() {
    $('stat-teams').textContent = state.teams.length.toLocaleString('en-IN');
    $('stat-players').textContent = state.players.length.toLocaleString('en-IN');
    $('stat-matches').textContent = state.matches.length.toLocaleString('en-IN');
    $('stat-tokens').textContent = state.tokens.filter(t => !t.used).length.toLocaleString('en-IN');
  }

  function renderOverview() {
    $('welcome-name').textContent = state.identity?.displayName?.split(' ')[0] || 'Administrator';
    $('status-auth').textContent = 'Verified';
    $('status-db').textContent = 'Connected';
    $('status-auth').className = 'status-pill';
    $('status-db').className = 'status-pill';
    renderStats();
    const recent = [...state.matches].sort((a,b) => Number(b.timestamp || 0) - Number(a.timestamp || 0)).slice(0,5);
    $('overview-recent-matches').innerHTML = recent.length ? recent.map(m => `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,.05)">
        <div style="min-width:0"><div class="table-primary">${esc(m.teamAName || 'Team A')} <span style="color:#718176">vs</span> ${esc(m.teamBName || 'Team B')}</div><span class="table-secondary">${esc(m.map || m.roundName || 'Match')}</span></div>
        <strong style="white-space:nowrap;color:#fde68a;font-size:12px">${esc(m.teamAScore ?? '—')} : ${esc(m.teamBScore ?? '—')}</strong>
      </div>`).join('') : '<div class="empty-state"><i class="fa-solid fa-gamepad"></i>No match records yet.</div>';
  }

  function filtered(items, query, fields) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return items;
    return items.filter(item => fields.some(field => String(item[field] ?? '').toLowerCase().includes(q)) || item.id.toLowerCase().includes(q));
  }

  function renderTeams() {
    const items = filtered(state.teams, $('team-search').value, ['name','group','logoUrl']);
    $('teams-body').innerHTML = items.length ? items.map(team => `
      <tr><td><div class="table-primary">${esc(team.name || 'Unnamed team')}</div><span class="table-secondary">${esc(team.id)}</span></td>
      <td>${esc(team.group || '—')}</td>
      <td>${team.disqualified ? '<span class="status-pill danger">Disqualified</span>' : '<span class="status-pill">Active</span>'}</td>
      <td>${team.rosterLocked ? '<span class="status-pill warning">Locked</span>' : '<span class="status-pill">Open</span>'}</td>
      <td><div class="table-actions">${canAny(['team_edit_info','team_dq','team_lock_roster']) ? `<button class="mini-action" data-edit-team="${esc(team.id)}"><i class="fa-solid fa-pen"></i> Edit</button>` : ''}${can('team_delete') ? `<button class="mini-action delete" data-delete-team="${esc(team.id)}"><i class="fa-solid fa-trash"></i></button>` : ''}</div></td></tr>`).join('') : '<tr><td colspan="5"><div class="empty-state"><i class="fa-solid fa-users"></i>No teams found.</div></td></tr>';
    $('add-team-button').hidden = !can('team_add');
  }

  function teamName(id) { return state.teams.find(t => t.id === id)?.name || 'Unknown team'; }
  function renderPlayers() {
    const items = filtered(state.players, $('player-search').value, ['ign','uid','device','role','teamId']);
    $('players-body').innerHTML = items.length ? items.map(p => `
      <tr><td><div class="table-primary">${esc(p.ign || 'Unnamed player')}</div><span class="table-secondary">${p.isSub ? 'Substitute' : 'Starter'} · ${esc(p.id)}</span></td>
      <td>${esc(teamName(p.teamId))}</td><td>${esc(p.uid || '—')}</td><td>${esc(p.device || '—')}</td><td>${esc(p.role || (p.isSub ? 'Sub' : 'Starter'))}</td>
      <td><div class="table-actions">${canAny(['player_edit_details','player_edit_photo','player_manage_subs']) ? `<button class="mini-action" data-edit-player="${esc(p.id)}"><i class="fa-solid fa-pen"></i> Edit</button>` : ''}${can('player_manage_subs') ? `<button class="mini-action delete" data-delete-player="${esc(p.id)}"><i class="fa-solid fa-trash"></i></button>` : ''}</div></td></tr>`).join('') : '<tr><td colspan="6"><div class="empty-state"><i class="fa-solid fa-user-group"></i>No players found.</div></td></tr>';
    $('add-player-button').hidden = !canAny(['player_edit_details','player_manage_subs']);
  }

  function renderMatches() {
    const items = filtered(state.matches, $('match-search').value, ['teamAName','teamBName','map','roundName','date']);
    $('matches-body').innerHTML = items.length ? [...items].sort((a,b) => Number(b.timestamp || 0)-Number(a.timestamp || 0)).map(m => `
      <tr><td><div class="table-primary">${esc(m.teamAName || 'Team A')} vs ${esc(m.teamBName || 'Team B')}</div><span class="table-secondary">${esc(m.id)}</span></td>
      <td><strong style="color:#fde68a">${esc(m.teamAScore ?? 0)} : ${esc(m.teamBScore ?? 0)}</strong></td><td>${esc(m.map || '—')}<span class="table-secondary">${esc(m.roundName || m.round || '')}</span></td><td>${esc(asDate(m.timestamp || m.date) || '—')}</td>
      <td><div class="table-actions">${canAny(['match_edit_score','match_edit_stats','match_edit_vod']) ? `<button class="mini-action" data-edit-match="${esc(m.id)}"><i class="fa-solid fa-pen"></i> Edit</button>` : ''}${can('match_delete') ? `<button class="mini-action delete" data-delete-match="${esc(m.id)}"><i class="fa-solid fa-trash"></i></button>` : ''}</div></td></tr>`).join('') : '<tr><td colspan="5"><div class="empty-state"><i class="fa-solid fa-gamepad"></i>No matches found.</div></td></tr>';
    $('add-match-button').hidden = !can('match_create');
  }

  function renderRawList(targetId, list, collection, permission) {
    const target = $(targetId);
    if (!list.length) { target.innerHTML = '<div class="empty-state">No records yet.</div>'; return; }
    target.innerHTML = list.slice().sort((a,b) => String(a.id).localeCompare(String(b.id))).map(doc => `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px;border-bottom:1px solid rgba(255,255,255,.05)">
        <div style="min-width:0"><div class="table-primary">${esc(doc.teamName || doc.roundName || doc.id)}</div><span class="table-secondary">${esc(doc.id)} · ${esc(JSON.stringify(doc).slice(0,90))}</span></div>
        <button class="mini-action" data-raw-edit="${esc(collection)}|${esc(doc.id)}" ${can(permission) ? '' : 'disabled'}><i class="fa-solid fa-code"></i> JSON</button>
      </div>`).join('');
  }

  function renderTokens() {
    const items = filtered(state.tokens.filter(token => !token.migratedTo), $('token-search').value, ['token','season','usedBy']);
    $('tokens-body').innerHTML = items.length ? items.map(t => `
      <tr><td><code style="color:#fde68a;font-weight:900;letter-spacing:.08em">${esc(t.token || t.id)}</code></td><td>${esc(t.season || '—')}</td><td>${t.used ? '<span class="status-pill warning">Redeemed</span>' : '<span class="status-pill">Unused</span>'}</td><td>${esc(t.usedBy || '—')}</td>
      <td><div class="table-actions">${can('token_view') ? `<button class="mini-action" data-copy-token="${esc(t.token || t.id)}"><i class="fa-solid fa-copy"></i> Copy</button>` : ''}${!t.used && can('token_delete') ? `<button class="mini-action delete" data-delete-token="${esc(t.id)}"><i class="fa-solid fa-ban"></i> Revoke</button>` : ''}</div></td></tr>`).join('') : '<tr><td colspan="5"><div class="empty-state"><i class="fa-solid fa-ticket"></i>No tokens found.</div></td></tr>';
    $('generate-token').hidden = !can('token_create');
    if ($('migrate-tokens')) $('migrate-tokens').hidden = !isMaster();
  }

  function renderSubAdmins() {
    $('subadmins-body').innerHTML = state.subAdmins.length ? state.subAdmins.map(a => {
      const count = Object.values(a.permissions || {}).filter(Boolean).length;
      return `<tr><td><div class="table-primary">${esc(a.displayName || a.email || a.uid || a.id)}</div><span class="table-secondary">${esc(a.email || a.uid || a.id)}</span></td><td>${a.active === false ? '<span class="status-pill danger">Disabled</span>' : '<span class="status-pill">Active</span>'}</td><td>${count} permissions</td><td>${esc(asDate(a.createdAt) || '—')}</td><td><div class="table-actions"><button class="mini-action" data-edit-subadmin="${esc(a.uid || a.id)}"><i class="fa-solid fa-sliders"></i> Permissions</button><button class="mini-action" data-reset-subadmin="${esc(a.uid || a.id)}"><i class="fa-solid fa-key"></i></button><button class="mini-action delete" data-delete-subadmin="${esc(a.uid || a.id)}"><i class="fa-solid fa-trash"></i></button></div></td></tr>`;
    }).join('') : '<tr><td colspan="5"><div class="empty-state"><i class="fa-solid fa-user-shield"></i>No sub-admin accounts yet. Create the first one when Cloud Functions are deployed.</div></td></tr>';
  }

  function fillContentSettings() {
    const t = state.settings.tournament || {};
    const announcement = t.announcement || {};
    const live = t.liveStream || {};
    if (document.activeElement !== $('announcement-text')) $('announcement-text').value = announcement.text || '';
    $('announcement-active').checked = !!announcement.active;
    if (document.activeElement !== $('live-title')) $('live-title').value = live.title || '';
    if (document.activeElement !== $('live-url')) $('live-url').value = live.url || '';
    $('live-active').checked = !!live.active;
    $('setting-season').value = t.season || 'Season 6';
    $('setting-theme').value = t.theme || 'save-trees';
    $('setting-team-limit').value = t.totalTeams ?? 24;
    $('setting-matches-per-team').value = t.matchesPerTeam ?? 5;
    $('setting-max-subs').value = t.maxSubs ?? 2;
    $('setting-prize').value = t.prizePool ?? t.prize_pool ?? t.prize ?? '';
    $('setting-registration-open').checked = t.registrationOpen === true || t.registration?.open === true;
    $('setting-maintenance-note').value = t.maintenanceNotice || '';
    $('setting-maintenance').checked = !!t.maintenanceMode;
    $('rules-json').value = JSON.stringify(state.settings.rules || {}, null, 2);
    const master = isMaster();
    $('setting-season').disabled = !master; $('setting-theme').disabled = !master;
    $('setting-team-limit').disabled = !master; $('setting-matches-per-team').disabled = !master;
    $('setting-max-subs').disabled = !master; $('setting-maintenance-note').disabled = !master;
    $('setting-registration-open').disabled = !master; $('setting-maintenance').disabled = !master;
    $('setting-prize').disabled = !can('prize_edit');
    $('save-settings').disabled = !canAny(['prize_edit']) && !master;
    $('announcement-text').disabled = !can('announcement_edit'); $('announcement-active').disabled = !can('announcement_edit'); $('save-announcement').disabled = !can('announcement_edit');
    $('live-title').disabled = !can('livestream_edit'); $('live-url').disabled = !can('livestream_edit'); $('live-active').disabled = !can('livestream_edit'); $('save-livestream').disabled = !can('livestream_edit');
    $('rules-json').disabled = !can('rules_edit'); $('save-rules').disabled = !can('rules_edit');
  }

  function renderActivePage() {
    switch (state.activePage) {
      case 'overview': renderOverview(); break;
      case 'teams': renderTeams(); break;
      case 'players': renderPlayers(); break;
      case 'matches': renderMatches(); break;
      case 'tournament': renderRawList('slots-list', state.slots, 'tournament_slots', 'tourney_slots'); renderRawList('tournament-matches-list', state.tournamentMatches, 'tournament_matches', 'tourney_scores'); $('add-slot-button').disabled = !can('tourney_slots'); $('add-tmatch-button').disabled = !can('tourney_scores'); break;
      case 'content': fillContentSettings(); break;
      case 'tokens': renderTokens(); break;
      case 'subadmins': renderSubAdmins(); break;
      case 'backups': break;
      case 'applications': renderApplications(); break;
    }
  }

  function getTeamRecord(id) { return state.teams.find(x => x.id === id) || null; }
  function getPlayerRecord(id) { return state.players.find(x => x.id === id) || null; }
  function getMatchRecord(id) { return state.matches.find(x => x.id === id) || null; }

  function openTeamEditor(id = null) {
    const old = id ? getTeamRecord(id) : null;
    if (!old) requirePermission('team_add');
    else if (!canAny(['team_edit_info','team_dq','team_lock_roster'])) throw new Error('You do not have permission to edit this team.');
    const canEdit = !old || can('team_edit_info');
    const canDq = !old || can('team_dq');
    const canLock = !old || can('team_lock_roster');
    openModal(old ? 'Edit team' : 'Add team', `
      <div class="form-grid">
        ${makeInput('Team name','team-name',old?.name || '', 'text', `maxlength="48" ${canEdit ? '' : 'disabled'}`)}
        ${makeInput('Logo URL','team-logo',old?.logoUrl || '', 'url', canEdit ? '' : 'disabled')}
        ${makeSelect('Group','team-group',old?.group || 'A',[{value:'A',label:'Group A'},{value:'B',label:'Group B'}],canEdit ? '' : 'disabled')}
        <div class="form-row"><label class="field-label">Roster status</label><label class="check-row"><input id="team-roster-lock" type="checkbox" ${old?.rosterLocked ? 'checked' : ''} ${canLock ? '' : 'disabled'}> Lock roster</label></div>
        <div class="form-row full"><label class="check-row"><input id="team-disqualified" type="checkbox" ${old?.disqualified ? 'checked' : ''} ${canDq ? '' : 'disabled'}> Disqualified</label></div>
        <div class="form-row full"><label class="field-label" for="team-dq-reason">Disqualification reason</label><input class="admin-field" id="team-dq-reason" value="${esc(old?.dqReason || '')}" ${canDq ? '' : 'disabled'}></div>
      </div>
      <p class="form-hint">Team rosters are managed separately in the Players section. Existing unknown team fields are preserved.</p>
    `, `<button class="quiet-action" data-modal-close>Cancel</button><button class="primary-action" id="save-team"><i class="fa-solid fa-floppy-disk"></i> Save team</button>`);
    $('save-team').addEventListener('click', async () => {
      try {
        const current = old ? {...old} : {};
        const patch = {};
        const name = $('team-name').value.trim();
        if (!name) throw new Error('Team name is required.');
        if (!old) requirePermission('team_add');
        if (!old || can('team_edit_info')) { patch.name = name; patch.logoUrl = $('team-logo').value.trim(); patch.group = $('team-group').value; }
        if (old && can('team_dq')) { patch.disqualified = $('team-disqualified').checked; patch.dqReason = $('team-dq-reason').value.trim(); }
        if (old && can('team_lock_roster')) patch.rosterLocked = $('team-roster-lock').checked;
        if (!old) {
          patch.disqualified = false; patch.rosterLocked = false; patch.createdAt = firebase.firestore.FieldValue.serverTimestamp();
          const ref = db.collection('teams').doc();
          if (isMaster()) {
            const settingsRef = db.collection('settings').doc('tournament');
            await db.runTransaction(async transaction => {
              const settingsSnap = await transaction.get(settingsRef);
              const settings = settingsSnap.exists ? settingsSnap.data() : {};
              const reserved = Number(settings.registrationReservedCount);
              const capacity = Math.max(1, Math.min(128, Number(settings.totalTeams) || 24));
              if (!Number.isInteger(reserved)) throw new Error('Registration capacity is not initialized. Open the admin dashboard again and retry.');
              if (reserved >= capacity) throw new Error('The season has no free team places.');
              transaction.set(ref, patch);
              transaction.update(settingsRef, { registrationReservedCount: reserved + 1, lastManualTeamId: ref.id });
            });
          } else {
            const settingsRef = db.collection('settings').doc('tournament');
            await db.runTransaction(async transaction => {
              const settingsSnap = await transaction.get(settingsRef);
              const settings = settingsSnap.exists ? settingsSnap.data() : {};
              const reserved = Number(settings.registrationReservedCount);
              const capacity = Math.max(1, Math.min(128, Number(settings.totalTeams) || 24));
              if (!Number.isInteger(reserved)) throw new Error('Registration capacity is not initialized. Ask the master administrator to open the admin dashboard.');
              if (reserved >= capacity) throw new Error('The season has no free team places.');
              transaction.set(ref, patch);
              transaction.update(settingsRef, { registrationReservedCount: reserved + 1, lastManualTeamId: ref.id });
            });
          }
          showToast(`Team created (${ref.id}).`);
        } else {
          if (!Object.keys(patch).length) throw new Error('No editable fields are available for your account.');
          await db.collection('teams').doc(old.id).set(patch, {merge:true});
          showToast('Team updated.');
        }
        closeModal();
      } catch (error) { showToast(error.message || 'Could not save team.', 'error'); }
    });
  }

  function openPlayerEditor(id = null) {
    const old = id ? getPlayerRecord(id) : null;
    if (old && !canAny(['player_edit_details','player_edit_photo','player_manage_subs'])) throw new Error('You cannot edit players.');
    const teams = state.teams.map(t => ({value:t.id,label:t.name || t.id}));
    const detail = !old || can('player_edit_details');
    const photo = !old || can('player_edit_photo');
    const subs = !old || can('player_manage_subs');
    const teamEdit = !old || can('player_manage_subs');
    const canManageSubs = can('player_manage_subs');
    const initialSub = old ? !!old.isSub : (canManageSubs && !can('player_edit_details'));
    const teamOptions = [{value:'',label:'Select team'}, ...teams];
    openModal(old ? 'Edit player' : 'Add player', `
      <div class="form-grid">
        ${makeSelect('Team','player-team',old?.teamId || '',teamOptions,teamEdit ? 'required' : 'disabled')}
        ${makeInput('In-game name (IGN)','player-ign',old?.ign || '', 'text', detail ? 'required maxlength="40"' : 'disabled')}
        ${makeInput('Free Fire UID','player-uid',old?.uid || '', 'text', detail ? '' : 'disabled')}
        ${makeInput('Device','player-device',old?.device || '', 'text', detail ? '' : 'disabled')}
        ${makeInput('Role','player-role',old?.role || (old?.isSub ? 'Substitute' : 'Starter'), 'text', detail || subs ? '' : 'disabled')}
        ${makeInput('Photo URL','player-photo',old?.photoUrl || '', 'url', photo ? '' : 'disabled')}
        ${makeInput('Roster order','player-order',old?.slotOrder ?? 0, 'number', subs ? 'min="0" max="99"' : 'disabled')}
        <div class="form-row"><label class="field-label">Roster position</label><label class="check-row"><input id="player-is-sub" type="checkbox" ${initialSub ? 'checked' : ''} ${canManageSubs ? '' : 'disabled'}> Substitute</label></div>
      </div>
      <p class="form-hint">Player documents use teamId, ign, uid, device, role, isSub, photoUrl and slotOrder.</p>
    `, `<button class="quiet-action" data-modal-close>Cancel</button><button class="primary-action" id="save-player"><i class="fa-solid fa-floppy-disk"></i> Save player</button>`);
    $('save-player').addEventListener('click', async () => {
      try {
        const patch = {};
        const isSub = $('player-is-sub').checked;
        if (!old && isSub) requirePermission('player_manage_subs');
        if (!old && !isSub) requirePermission('player_edit_details');
        if (!old || can('player_manage_subs')) patch.teamId = $('player-team').value;
        if (!old || can('player_edit_details')) {
          patch.ign = $('player-ign').value.trim();
          patch.uid = $('player-uid').value.trim();
          patch.device = $('player-device').value.trim();
          patch.role = $('player-role').value.trim() || (isSub ? 'Substitute' : 'Starter');
        }
        if (!old || can('player_manage_subs')) {
          patch.slotOrder = Number($('player-order').value || 0);
          patch.isSub = isSub;
          if (old && !can('player_edit_details')) patch.role = $('player-role').value.trim() || (isSub ? 'Substitute' : 'Starter');
        }
        if (!old || can('player_edit_photo')) patch.photoUrl = $('player-photo').value.trim();
        if (!patch.teamId && !old) throw new Error('Select a team.');
        if (patch.ign === '') throw new Error('Player IGN is required.');
        if (old) {
          await db.collection('players').doc(old.id).set(patch, {merge:true});
          showToast('Player updated.');
        } else {
          patch.createdAt = firebase.firestore.FieldValue.serverTimestamp();
          const ref = await db.collection('players').add(patch);
          showToast(`Player added (${ref.id}).`);
        }
        closeModal();
      } catch (error) { showToast(error.message || 'Could not save player.', 'error'); }
    });
  }

  function openMatchEditor(id = null) {
    const old = id ? getMatchRecord(id) : null;
    if (!old) requirePermission('match_create');
    else if (!canAny(['match_edit_score','match_edit_stats','match_edit_vod'])) throw new Error('You cannot edit this match.');
    const editScore = !old || can('match_edit_score');
    const editStats = !old || can('match_edit_stats');
    const editVod = !old || can('match_edit_vod');
    const teams = [{value:'',label:'Select team'}, ...state.teams.map(t => ({value:t.id,label:t.name || t.id}))];
    openModal(old ? 'Edit match' : 'Create match', `
      <div class="form-grid">
        ${makeSelect('Team A','match-team-a',old?.teamAId || '',teams,editScore ? '' : 'disabled')}
        ${makeSelect('Team B','match-team-b',old?.teamBId || '',teams,editScore ? '' : 'disabled')}
        ${makeInput('Team A score','match-score-a',old?.teamAScore ?? 0,'number',editScore ? 'min="0"' : 'disabled')}
        ${makeInput('Team B score','match-score-b',old?.teamBScore ?? 0,'number',editScore ? 'min="0"' : 'disabled')}
        ${makeInput('Map','match-map',old?.map || 'Bermuda','text',editScore ? '' : 'disabled')}
        ${makeInput('Round / stage','match-round',old?.roundName || old?.round || 'Grove League','text',editScore ? '' : 'disabled')}
        ${makeInput('Date label','match-date',old?.date || new Date().toLocaleDateString('en-IN'),'text',editScore ? '' : 'disabled')}
        ${makeInput('VOD / proof URL','match-vod',old?.vodUrl || old?.proofUrl || '','url',editVod ? '' : 'disabled')}
        <div class="form-row full"><label class="field-label" for="match-status">Status</label><select id="match-status" class="admin-select" ${editScore ? '' : 'disabled'}><option value="scheduled" ${(old?.status || 'scheduled')==='scheduled'?'selected':''}>Scheduled</option><option value="live" ${old?.status==='live'?'selected':''}>Live</option><option value="completed" ${old?.status==='completed'?'selected':''}>Completed</option></select></div>
        <div class="form-row full"><label class="field-label" for="match-stats">Player statistics JSON array</label><textarea id="match-stats" class="admin-textarea" ${editStats ? '' : 'disabled'}>${esc(JSON.stringify(old?.stats || [],null,2))}</textarea><div class="form-hint">Example: [{"player":"IGN","team":"Team Name","kills":5,"deaths":2,"assists":1}]</div></div>
      </div>
    `, `<button class="quiet-action" data-modal-close>Cancel</button><button class="primary-action" id="save-match"><i class="fa-solid fa-floppy-disk"></i> Save match</button>`);
    $('save-match').addEventListener('click', async () => {
      try {
        const patch = {};
        if (!old) requirePermission('match_create');
        if (!old || can('match_edit_score')) {
          const a = $('match-team-a').value; const b = $('match-team-b').value;
          if (!a || !b || a === b) throw new Error('Choose two different teams.');
          patch.teamAId = a; patch.teamAName = teamName(a); patch.teamAScore = Number($('match-score-a').value || 0);
          patch.teamBId = b; patch.teamBName = teamName(b); patch.teamBScore = Number($('match-score-b').value || 0);
          patch.map = $('match-map').value.trim(); patch.roundName = $('match-round').value.trim();
          patch.date = $('match-date').value.trim(); patch.status = $('match-status').value;
          if (patch.status === 'completed' || !old) patch.timestamp = Date.now();
        }
        if (!old || can('match_edit_vod')) patch.vodUrl = $('match-vod').value.trim();
        if (!old || can('match_edit_stats')) {
          let stats;
          try { stats = JSON.parse($('match-stats').value || '[]'); } catch (_) { throw new Error('Player statistics must be valid JSON.'); }
          if (!Array.isArray(stats)) throw new Error('Player statistics must be a JSON array.');
          patch.stats = stats;
        }
        if (old) { await db.collection('matches').doc(old.id).set(patch,{merge:true}); showToast('Match updated.'); }
        else { patch.title = `${patch.teamAName} vs ${patch.teamBName}`; patch.createdAt = firebase.firestore.FieldValue.serverTimestamp(); const ref = await db.collection('matches').add(patch); showToast(`Match created (${ref.id}).`); }
        closeModal();
      } catch (error) { showToast(error.message || 'Could not save match.', 'error'); }
    });
  }

  function openRawEditor(collection, id = null) {
    if (collection === 'tournament_slots' && !id) return openSlotEditor();
    const permission = collection === 'tournament_slots' ? 'tourney_slots' : 'tourney_scores';
    requirePermission(permission);
    const list = collection === 'tournament_slots' ? state.slots : state.tournamentMatches;
    const old = id ? list.find(x => x.id === id) : null;
    openModal(old ? `Edit ${collection} document` : `Create ${collection} document`, `
      ${makeInput('Document ID (optional for new records)','raw-id',old?.id || '', 'text',old ? 'disabled' : '')}
      <label class="field-label" for="raw-json">Document JSON</label>
      <textarea id="raw-json" class="admin-textarea" style="min-height:310px">${esc(JSON.stringify(old ? Object.fromEntries(Object.entries(old).filter(([k])=>k!=='id')) : (collection === 'tournament_slots' ? {slotNumber:state.slots.length+1,group:'A',groupSlot:state.slots.length+1,teamId:null,teamName:null,locked:false} : {roundName:'Grove League',status:'scheduled',teamAId:'',teamBId:''}),null,2))}</textarea>
      <p class="form-hint">The full document is saved as entered. Preserve field names used by the public tournament renderer.</p>
    `, `<button class="quiet-action" data-modal-close>Cancel</button><button class="primary-action" id="save-raw"><i class="fa-solid fa-floppy-disk"></i> Save document</button>`);
    $('save-raw').addEventListener('click', async () => {
      try {
        let data; try { data = JSON.parse($('raw-json').value); } catch (_) { throw new Error('Document JSON is invalid.'); }
        if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Document JSON must be an object.');
        const docId = old ? old.id : $('raw-id').value.trim();
        const collectionRef = db.collection(collection);
        if (docId) await collectionRef.doc(docId).set(data,{merge:true}); else await collectionRef.add(data);
        showToast('Tournament document saved.'); closeModal();
      } catch (error) { showToast(error.message || 'Could not save document.','error'); }
    });
  }

  function openSlotEditor() {
    requirePermission('tourney_slots');
    const groupKey = (slot) => String(slot.group || slot.groupName || '').toUpperCase().replace(/^GROUP\s*/, '');
    const nextGroupSlot = (group) => Math.max(0, ...state.slots.filter(slot => groupKey(slot) === group).map(slot => Number(slot.groupSlot) || 0)) + 1;
    const nextSlotNumber = Math.max(0, ...state.slots.map(slot => Number(slot.slotNumber) || 0)) + 1;
    const defaultGroup = nextGroupSlot('A') <= 12 ? 'A' : 'B';
    const teams = [{value:'',label:'Leave unassigned'}, ...state.teams.map(team => ({value:team.id,label:team.name || team.id}))];
    openModal('Add tournament slot', `
      <div class="form-grid">
        ${makeInput('Slot number','slot-number',nextSlotNumber,'number','min="1" step="1" required')}
        ${makeSelect('Group','slot-group',defaultGroup,[{value:'A',label:'Group A · Amazon Grove'},{value:'B',label:'Group B · Sundar Grove'}])}
        ${makeInput('Position in group','slot-group-position',nextGroupSlot(defaultGroup),'number','min="1" step="1" required')}
        ${makeSelect('Team (optional)','slot-team','',teams)}
      </div>
      <label class="check-row setting-toggle" style="margin-top:14px"><input type="checkbox" id="slot-locked"><span><strong>Lock this slot</strong><small>Use this after the assignment is final.</small></span></label>
      <p class="form-hint">You can leave the team empty and assign it later.</p>
    `, `<button class="quiet-action" data-modal-close>Cancel</button><button class="primary-action" id="save-slot"><i class="fa-solid fa-floppy-disk"></i> Add slot</button>`);
    $('slot-group').addEventListener('change', () => { $('slot-group-position').value = nextGroupSlot($('slot-group').value); });
    $('save-slot').addEventListener('click', async () => {
      try {
        requirePermission('tourney_slots');
        const slotNumber = Number($('slot-number').value);
        const groupSlot = Number($('slot-group-position').value);
        const group = $('slot-group').value;
        if (!Number.isInteger(slotNumber) || slotNumber < 1 || !Number.isInteger(groupSlot) || groupSlot < 1) throw new Error('Enter valid positive slot and group numbers.');
        const team = getTeamRecord($('slot-team').value);
        const data = {slotNumber,group,groupSlot,teamId:team?.id || null,teamName:team?.name || null,locked:$('slot-locked').checked};
        const ref = await db.collection('tournament_slots').add(data);
        showToast(`Slot ${slotNumber} added (${ref.id}).`);
        closeModal();
      } catch (error) { showToast(error.message || 'Could not add slot.','error'); }
    });
  }

  async function deleteDocument(collection, id, label, permission) {
    requirePermission(permission);
    if (!confirm(`Delete ${label || id}? This cannot be undone.`)) return;
    await db.collection(collection).doc(id).delete();
    showToast(`${label || 'Record'} deleted.`);
  }

  async function deleteTeam(id) {
    requirePermission('team_delete');
    if (!confirm('Delete this team? This cannot be undone.')) return;
    const teamRef = db.collection('teams').doc(id);
    const settingsRef = db.collection('settings').doc('tournament');
    await db.runTransaction(async transaction => {
      const [teamSnap, settingsSnap] = await Promise.all([transaction.get(teamRef), transaction.get(settingsRef)]);
      if (!teamSnap.exists) throw new Error('Team not found.');
      const settings = settingsSnap.exists ? settingsSnap.data() : {};
      const reserved = Number(settings.registrationReservedCount);
      if (!Number.isInteger(reserved) || reserved < 1) throw new Error('Registration capacity is not initialized.');
      transaction.delete(teamRef);
      transaction.update(settingsRef, { registrationReservedCount: reserved - 1, lastReleasedTeamId: id });
    });
    showToast('Team deleted.');
  }
  async function deletePlayer(id) { await deleteDocument('players',id,'this player','player_manage_subs'); }
  async function deleteMatch(id) { await deleteDocument('matches',id,'this match','match_delete'); }
  async function deleteToken(id) { await deleteDocument('tokens',id,'this token','token_delete'); }

  function randomToken(length = 16) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const values = new Uint8Array(length);
    crypto.getRandomValues(values);
    return Array.from(values, value => chars[value % chars.length]).join('');
  }
  async function hashToken(token) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(token).trim().toUpperCase()));
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  }
  async function generateToken() {
    requirePermission('token_create');
    const token = randomToken(16);
    const tokenHash = await hashToken(token);
    const season = state.settings.tournament.season || 'Season 6';
    await db.collection('tokens').doc(tokenHash).set({
      token, tokenHash, season, used:false, usedBy:null,
      createdAt:firebase.firestore.FieldValue.serverTimestamp()
    });
    await copyText(token, 'New season token created and copied.');
  }
  async function migrateLegacyTokens() {
    requireMaster();
    const legacy = state.tokens.filter(token => token.token && !token.tokenHash && !token.migratedTo);
    if (!legacy.length) { showToast('All existing tokens are ready for registration.'); return; }
    let batch = db.batch();
    let writes = 0;
    for (const token of legacy) {
      const tokenHash = await hashToken(token.token);
      const migratedRef = db.collection('tokens').doc(tokenHash);
      batch.set(migratedRef, {
        ...Object.fromEntries(Object.entries(token).filter(([key]) => key !== 'id' && key !== 'migratedTo')),
        tokenHash, legacyDocumentId: token.id
      }, { merge: true });
      batch.update(db.collection('tokens').doc(token.id), { migratedTo: tokenHash });
      writes += 2;
      if (writes >= 400) { await batch.commit(); batch = db.batch(); writes = 0; }
    }
    if (writes) await batch.commit();
    showToast(`Prepared ${legacy.length} existing token(s) for registration.`);
  }
  async function copyText(value, message = 'Copied to clipboard.') {
    try { await navigator.clipboard.writeText(String(value)); showToast(message); }
    catch (_) { showToast('Clipboard access was blocked by this browser.','error'); }
  }

  async function saveAnnouncement() {
    requirePermission('announcement_edit');
    const text = $('announcement-text').value.trim();
    await db.collection('settings').doc('tournament').set({ announcement:{text,active:$('announcement-active').checked,timestamp:new Date().toLocaleString('en-IN')} },{merge:true});
    showToast('Announcement saved.');
  }
  async function saveLivestream() {
    requirePermission('livestream_edit');
    const url = $('live-url').value.trim();
    if (url && !/^https:\/\//i.test(url)) throw new Error('Use a secure HTTPS YouTube URL.');
    await db.collection('settings').doc('tournament').set({ liveStream:{title:$('live-title').value.trim() || 'SRP-ESPORTS Season 6 Live',url,active:$('live-active').checked} },{merge:true});
    showToast('Livestream settings saved.');
  }
  async function saveGeneralSettings() {
    const patch = {};
    if (isMaster()) {
      patch.season = $('setting-season').value.trim() || 'Season 6';
      patch.theme = $('setting-theme').value;
      patch.totalTeams = Number($('setting-team-limit').value || 24);
      patch.matchesPerTeam = Number($('setting-matches-per-team').value || 5);
      patch.maxSubs = Number($('setting-max-subs').value || 2);
      patch.registrationOpen = $('setting-registration-open').checked;
      patch.maintenanceMode = $('setting-maintenance').checked;
      patch.maintenanceNotice = $('setting-maintenance-note').value.trim();
    }
    if (can('prize_edit')) patch.prizePool = $('setting-prize').value.trim();
    if (!Object.keys(patch).length) throw new Error('You do not have permission to update these settings.');
    await db.collection('settings').doc('tournament').set({...patch,updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});
    showToast('Tournament settings saved.');
  }
  async function saveRules() {
    requirePermission('rules_edit');
    let data; try { data = JSON.parse($('rules-json').value); } catch (_) { throw new Error('Rules JSON is invalid.'); }
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Rules must be a JSON object.');
    await db.collection('settings').doc('rules').set({...data,updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});
    showToast('Rules document saved.');
  }

  function permissionMarkup(current = {}) {
    return PERMISSIONS.map(group => `<div class="permission-group"><div style="font-size:10px;font-weight:950;color:#e2e8f0">${esc(group.group)}</div><div class="permission-grid">${group.items.map(([key,label]) => `<label class="permission-item"><input type="checkbox" data-permission="${key}" ${current[key] === true ? 'checked' : ''}><span>${esc(label)}</span></label>`).join('')}</div></div>`).join('');
  }
  function collectPermissions() {
    const permissions = {};
    document.querySelectorAll('[data-permission]').forEach(input => { permissions[input.dataset.permission] = input.checked; });
    return permissions;
  }
  function openSubAdminEditor(record = null) {
    requireMaster();
    openModal(record ? 'Update sub-admin access' : 'Create sub-admin account', `
      ${record ? `<div class="note-box" style="margin-bottom:13px">${esc(record.email || record.uid || record.id)} · Adjust permissions below. The user must sign in again or refresh their token before new claims take effect.</div><label class="check-row" style="margin:10px 0 16px"><input type="checkbox" id="subadmin-active" ${record.active !== false ? 'checked' : ''}> Account active</label>` : `<div class="form-grid">${makeInput('Full name','subadmin-name','','text','required maxlength="70"')}${makeInput('Email address','subadmin-email','','email','required autocomplete="off"')}</div><div class="note-box" style="margin-top:12px">A strong temporary password will be generated by the server and displayed once after account creation. No password is stored in Firestore.</div>`}
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin:17px 0 10px"><strong style="font-size:11px">Permissions</strong><button class="mini-action" type="button" id="select-no-permissions">Clear all</button></div>
      <div style="display:grid;gap:9px">${permissionMarkup(record?.permissions || {})}</div>
    `, `<button class="quiet-action" data-modal-close>Cancel</button><button class="primary-action" id="save-subadmin"><i class="fa-solid fa-shield-halved"></i> ${record ? 'Update permissions' : 'Create account'}</button>`);
    $('select-no-permissions').addEventListener('click', () => document.querySelectorAll('[data-permission]').forEach(i => i.checked = false));
    $('save-subadmin').addEventListener('click', async () => {
      try {
        const permissions = collectPermissions();
        const api = functions?.httpsCallable(record ? 'setSubAdminAccess' : 'createSubAdmin');
        if (!api) throw new Error('Firebase Functions SDK did not load.');
        const payload = record ? {uid:record.uid || record.id,permissions,active:$('subadmin-active').checked} : {displayName:$('subadmin-name').value.trim(),email:$('subadmin-email').value.trim(),permissions};
        if (!record && (!payload.displayName || !payload.email)) throw new Error('Name and email are required.');
        $('save-subadmin').disabled = true;
        const result = await api(payload);
        const data = result.data || {};
        if (record) {
          showToast('Sub-admin permissions updated. They need a fresh sign-in to receive the new token claims.');
          closeModal();
        } else {
          closeModal();
          openModal('Sub-admin created', `
            <div class="note-box">The Firebase Authentication account was created. Copy this temporary password now; it will not be shown again.</div>
            <label class="field-label" for="created-sub-email">Email</label><input class="admin-field" id="created-sub-email" readonly value="${esc(payload.email)}">
            <label class="field-label" for="created-sub-password">Temporary password</label><input class="admin-field" id="created-sub-password" readonly value="${esc(data.temporaryPassword || '')}" style="font-family:monospace;letter-spacing:.05em">
            <p class="form-hint">Share these credentials privately, not in a public Discord channel. Ask the user to change their password after signing in.</p>
          `, `<button class="quiet-action" data-modal-close>Close</button><button class="primary-action" id="copy-sub-credentials"><i class="fa-solid fa-copy"></i> Copy credentials</button>`);
          $('copy-sub-credentials').addEventListener('click', () => copyText(`Email: ${payload.email}\nTemporary password: ${data.temporaryPassword || ''}`,'Credentials copied. Share them privately.'));
        }
      } catch (error) { showToast(error.message || 'Sub-admin operation failed.','error'); $('save-subadmin').disabled = false; }
    });
  }
  async function resetSubAdminPassword(uid) {
    requireMaster();
    if (!confirm('Generate a new temporary password for this sub-admin? Their current password will stop working.')) return;
    const result = await functions.httpsCallable('resetSubAdminPassword')({uid});
    const data = result.data || {};
    openModal('Temporary password reset', `<div class="note-box">The new password is shown once. Share it privately.</div><label class="field-label">Temporary password</label><input class="admin-field" id="reset-password-value" readonly value="${esc(data.temporaryPassword || '')}" style="font-family:monospace">`, `<button class="quiet-action" data-modal-close>Close</button><button class="primary-action" id="copy-reset-password"><i class="fa-solid fa-copy"></i> Copy password</button>`);
    $('copy-reset-password').addEventListener('click', () => copyText(data.temporaryPassword || '','Temporary password copied.'));
  }
  async function deleteSubAdmin(uid) {
    requireMaster();
    if (!confirm('Disable this sub-admin account now? Access will be revoked and its inactive history record will be kept.')) return;
    await functions.httpsCallable('deleteSubAdmin')({uid});
    showToast('Sub-admin account disabled and access revoked.');
  }

  function serialize(value) {
    if (value && typeof value.toDate === 'function') return value.toDate().toISOString();
    if (Array.isArray(value)) return value.map(serialize);
    if (value && typeof value === 'object') {
      const out = {};
      Object.keys(value).forEach(key => { out[key] = serialize(value[key]); });
      return out;
    }
    return value;
  }
  const BACKUP_COLLECTIONS = ['teams','players','matches','tournament_slots','tournament_matches','tokens','settings'];
  async function exportBackup() {
    requireMaster();
    const firestore = {};
    for (const collection of BACKUP_COLLECTIONS) {
      const snapshot = await db.collection(collection).get();
      firestore[collection] = snapshot.docs.map(doc => ({id:doc.id,data:serialize(doc.data())}));
    }
    const backup = {format:'SRP-ESPORTS-FIRESTORE-BACKUP',version:1,projectId:'srpweb-52fd9',createdAt:new Date().toISOString(),firestore};
    const blob = new Blob([JSON.stringify(backup,null,2)],{type:'application/json'});
    const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
    anchor.href = url; anchor.download = `SRP-ESPORTS-Backup-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;
    document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
    showToast('Backup exported. Store it somewhere private and safe.');
  }
  async function importBackup() {
    requireMaster();
    const file = $('backup-file').files?.[0];
    if (!file) throw new Error('Choose a backup JSON file first.');
    if (!confirm('Import this backup using merge writes? Existing documents with matching IDs will have their backup fields merged. No documents will be deleted.')) return;
    const backup = JSON.parse(await file.text());
    if (backup.format !== 'SRP-ESPORTS-FIRESTORE-BACKUP' || backup.projectId !== 'srpweb-52fd9' || !backup.firestore || typeof backup.firestore !== 'object') {
      throw new Error('This backup is invalid or belongs to a different Firebase project.');
    }
    for (const collection of BACKUP_COLLECTIONS) {
      const docs = backup.firestore[collection] || [];
      if (!Array.isArray(docs)) throw new Error(`Backup collection ${collection} is not a valid document list.`);
      for (let i = 0; i < docs.length; i += 400) {
        const batch = db.batch();
        docs.slice(i,i+400).forEach(item => {
          if (!item || typeof item.id !== 'string' || !item.id || !item.data || typeof item.data !== 'object' || Array.isArray(item.data)) {
            throw new Error(`Backup contains an invalid document in ${collection}.`);
          }
          batch.set(db.collection(collection).doc(item.id),item.data,{merge:true});
        });
        await batch.commit();
      }
    }
    showToast('Backup merged into Firestore. Existing records not in the backup were left untouched.');
    $('backup-file').value = '';
  }


  function showApplication(identity) {
    state.identity = identity;
    setAuthScreen(true);
    $('admin-role-chip').innerHTML = `<i class="fa-solid fa-circle-check"></i> ${identity.role === 'master' ? 'Master Admin' : 'Sub-admin'}`;
    $('admin-user-name').textContent = identity.displayName || 'Administrator';
    $('admin-user-email').textContent = identity.email || '';
    buildNavigation();
    startDataListeners();
    renderStats();
    openPage('overview');
  }
  function clearApplication() {
    state.unsubs.forEach(fn => { try { fn(); } catch (_) {} }); state.unsubs = [];
    state.identity = null;
    state.teams = []; state.players = []; state.matches = []; state.slots = []; state.tournamentMatches = []; state.tokens = []; state.subAdmins = []; state.applications = [];
    state.settings = {tournament:{},rules:{},past_season:{}};
    $('admin-app').hidden = true; $('auth-screen').hidden = false;
  }

  // Top-level navigation and click handlers.
  document.addEventListener('click', async event => {
    const pageButton = event.target.closest('[data-page]');
    if (pageButton) { openPage(pageButton.dataset.page); return; }
    const quick = event.target.closest('[data-open-page]');
    if (quick) { openPage(quick.dataset.openPage); return; }
    const close = event.target.closest('[data-modal-close]');
    if (close) { closeModal(); return; }
    try {
    const target = event.target.closest('[data-edit-team],[data-delete-team],[data-edit-player],[data-delete-player],[data-edit-match],[data-delete-match],[data-raw-edit],[data-delete-token],[data-copy-token],[data-edit-subadmin],[data-reset-subadmin],[data-delete-subadmin],[data-view-application],[data-review-application]');
      if (!target) return;
      if (target.dataset.editTeam) return openTeamEditor(target.dataset.editTeam);
      if (target.dataset.deleteTeam) return await deleteTeam(target.dataset.deleteTeam);
      if (target.dataset.editPlayer) return openPlayerEditor(target.dataset.editPlayer);
      if (target.dataset.deletePlayer) return await deletePlayer(target.dataset.deletePlayer);
      if (target.dataset.editMatch) return openMatchEditor(target.dataset.editMatch);
      if (target.dataset.deleteMatch) return await deleteMatch(target.dataset.deleteMatch);
      if (target.dataset.rawEdit) { const [collection,id] = target.dataset.rawEdit.split('|'); return openRawEditor(collection,id); }
      if (target.dataset.deleteToken) return await deleteToken(target.dataset.deleteToken);
      if (target.dataset.copyToken) return await copyText(target.dataset.copyToken,'Token copied.');
      if (target.dataset.editSubadmin) { const record = state.subAdmins.find(a => (a.uid || a.id) === target.dataset.editSubadmin); if (record) return openSubAdminEditor(record); }
      if (target.dataset.resetSubadmin) return await resetSubAdminPassword(target.dataset.resetSubadmin);
      if (target.dataset.deleteSubadmin) return await deleteSubAdmin(target.dataset.deleteSubadmin);
      if (target.dataset.viewApplication) return await viewApplication(target.dataset.viewApplication);
      if (target.dataset.reviewApplication) { const [decision, id] = target.dataset.reviewApplication.split('|'); return await reviewApplication(decision, id); }
    } catch (error) { console.error(error); showToast(error.message || 'Action failed.','error'); }
  });

  $('auth-form').addEventListener('submit', async event => {
    event.preventDefault();
    const button = $('auth-submit'); const message = $('auth-message');
    button.disabled = true; button.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Verifying...'; message.textContent = '';
    try {
      await window.adminLogin($('auth-email').value.trim(),$('auth-password').value);
      $('auth-password').value = '';
      // The Firebase auth-state listener opens the workspace after the role claim is verified.
    } catch (error) { message.textContent = error.message || 'Sign-in failed.'; }
    finally { button.disabled = false; button.innerHTML = '<i class="fa-solid fa-shield-halved"></i> Sign in to SRP Admin'; }
  });

  auth.onAuthStateChanged(async user => {
    if (!user) { clearApplication(); return; }
    try {
      const identity = await readAdminIdentity(true);
      if (!identity) { await auth.signOut(); return; }
      showApplication(identity);
    } catch (error) {
      console.error(error);
      $('auth-message').textContent = 'Could not verify your admin account. Please sign in again.';
      await auth.signOut();
    }
  });

  $('logout-button').addEventListener('click', async () => { await auth.signOut(); showToast('Signed out.'); });
  $('sidebar-toggle').addEventListener('click', () => { $('admin-sidebar').classList.toggle('open'); $('mobile-backdrop').classList.toggle('open'); });
  $('mobile-backdrop').addEventListener('click', () => { $('admin-sidebar').classList.remove('open'); $('mobile-backdrop').classList.remove('open'); });
  $('modal-close').addEventListener('click', closeModal);
  $('admin-modal').addEventListener('click', e => { if (e.target.id === 'admin-modal') closeModal(); });

  $('add-team-button').addEventListener('click', () => { try { openTeamEditor(); } catch(e) { showToast(e.message,'error'); } });
  $('add-player-button').addEventListener('click', () => { try { openPlayerEditor(); } catch(e) { showToast(e.message,'error'); } });
  $('add-match-button').addEventListener('click', () => { try { openMatchEditor(); } catch(e) { showToast(e.message,'error'); } });
  $('add-slot-button').addEventListener('click', () => { try { openRawEditor('tournament_slots'); } catch(e) { showToast(e.message,'error'); } });
  $('add-tmatch-button').addEventListener('click', () => { try { openRawEditor('tournament_matches'); } catch(e) { showToast(e.message,'error'); } });
  $('generate-token').addEventListener('click', async () => { try { await generateToken(); } catch(e) { showToast(e.message || 'Token generation failed.','error'); } });
  $('migrate-tokens')?.addEventListener('click', async () => { try { await migrateLegacyTokens(); } catch(e) { console.error(e); showToast(e.message || 'Existing tokens could not be prepared.','error'); } });
  $('save-announcement').addEventListener('click', async () => { try { await saveAnnouncement(); } catch(e) { showToast(e.message,'error'); } });
  $('save-livestream').addEventListener('click', async () => { try { await saveLivestream(); } catch(e) { showToast(e.message,'error'); } });
  $('save-settings').addEventListener('click', async () => { try { await saveGeneralSettings(); } catch(e) { showToast(e.message,'error'); } });
  $('save-rules').addEventListener('click', async () => { try { await saveRules(); } catch(e) { showToast(e.message,'error'); } });
  $('add-subadmin').addEventListener('click', () => { try { openSubAdminEditor(); } catch(e) { showToast(e.message,'error'); } });
  $('export-backup').addEventListener('click', async () => { try { await exportBackup(); } catch(e) { showToast(e.message || 'Backup export failed.','error'); } });
  $('import-backup').addEventListener('click', async () => { try { await importBackup(); } catch(e) { showToast(e.message || 'Backup import failed.','error'); } });
  document.querySelectorAll('[data-refresh]').forEach(button => button.addEventListener('click', () => {
    const page = button.dataset.refresh;
    if (page === 'applications') { loadApplications().then(() => showToast('Applications refreshed.')); return; }
    const collection = ({teams:'teams',players:'players',matches:'matches',tokens:'tokens'})[page];
    if (!collection) return;
    db.collection(collection).get().then(snapshot => {
      state[page] = snapshot.docs.map(doc => ({id:doc.id,...doc.data()}));
      renderActivePage(); showToast(`${page} refreshed.`);
    }).catch(error => showToast(error.message,'error'));
  }));
  ['team-search','player-search','match-search','token-search'].forEach(id => $(id).addEventListener('input',renderActivePage));
})();
