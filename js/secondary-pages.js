/* SRP-ESPORTS Season 6 — secondary public pages */
(function () {
  'use strict';
  const THEMES = ['save-trees', 'midnight-blue', 'crimson-void', 'cyber-emerald', 'save-our-oceans'];
  const $ = (id) => document.getElementById(id);
  const state = { page: 'rules' };
  function esc(value) { return typeof window.escHtml === 'function' ? window.escHtml(value) : String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c])); }
  function applyTheme() {
    const saved = localStorage.getItem('srp_s6_theme_override');
    document.body.setAttribute('data-theme', saved && THEMES.includes(saved) ? saved : (window.SRP?.settings?.theme || 'save-trees'));
    if ($('theme-select')) $('theme-select').value = saved || '';
  }
  function renderSocialLinks() {
    const target = $('social-links'); if (!target) return;
    const settings = window.SRP?.settings || {}; const links = settings.socialLinks || {};
    const valid = (value) => { try { const u = new URL(value); return ['http:', 'https:'].includes(u.protocol) ? u.href : ''; } catch (_) { return ''; } };
    const discord = valid(links.discord || settings.discordUrl || settings.discordInvite || '');
    const youtube = valid(links.youtube || settings.youtubeUrl || settings.youtubeChannel || '');
    target.innerHTML = `${discord ? `<a class="discord" href="${esc(discord)}" target="_blank" rel="noopener noreferrer" aria-label="Open SRP Discord"><i class="fab fa-discord"></i></a>` : ''}${youtube ? `<a class="youtube" href="${esc(youtube)}" target="_blank" rel="noopener noreferrer" aria-label="Open SRP YouTube"><i class="fab fa-youtube"></i></a>` : ''}`;
  }
  function renderRules() {
    const data = window.SRP?.rulesData || {};
    const settings = window.SRP?.settings || {};
    const prize = settings.prizePool ?? settings.prize_pool ?? settings.prize ?? data.prizePool ?? null;
    const prizeLabel = prize === null || prize === '' ? 'Prize pool · TBA' : `Prize pool · ${typeof prize === 'number' ? `₹${prize.toLocaleString('en-IN')}` : String(prize)}`;
    if ($('rules-prize-pill')) $('rules-prize-pill').textContent = prizeLabel;
    const target = $('published-rules'); if (!target) return;
    const sections = Array.isArray(data.sections) ? data.sections : (Array.isArray(data.rules) ? data.rules : []);
    const notice = typeof data.notice === 'string' ? data.notice : (typeof data.content === 'string' ? data.content : (typeof data.rulesText === 'string' ? data.rulesText : ''));
    const blocks = [];
    if (notice.trim()) blocks.push(`<div class="info-tile"><div class="rule-copy">${esc(notice)}</div></div>`);
    sections.forEach((item) => {
      if (!item || typeof item !== 'object') return;
      const title = String(item.title || item.heading || 'Official rule');
      const body = String(item.content || item.text || item.description || '');
      if (body.trim()) blocks.push(`<article class="info-tile"><h3 class="font-black text-white">${esc(title)}</h3><p class="rule-copy mt-2">${esc(body)}</p></article>`);
    });
    target.innerHTML = blocks.length ? `<div class="grid grid-cols-1 gap-3 md:grid-cols-2">${blocks.join('')}</div>` : '<div class="empty-state">No additional rule notice has been published yet. The core season format above is available now.</div>';
    if ($('rules-updated')) $('rules-updated').textContent = data.updatedAt ? `Last updated: ${esc(data.updatedAt)}` : '';
  }
  function renderSaveTrees() { renderSocialLinks(); }
  function renderRegister() {
    const settings = window.SRP?.settings || {};
    const total = Math.max(1, Number(settings.totalTeams) || 24);
    const current = Array.isArray(window.SRP?.teams) ? window.SRP.teams.length : 0;
    const reserved = Number.isFinite(Number(settings.registrationReservedCount)) ? Number(settings.registrationReservedCount) : current;
    const open = settings.registrationOpen === true || settings.registration?.open === true;
    const available = Math.max(0, total - reserved);
    if ($('registration-capacity')) $('registration-capacity').textContent = `${total} teams`;
    if ($('registration-current')) $('registration-current').textContent = String(current);
    if ($('registration-available')) $('registration-available').textContent = String(available);
    const canApply = open && available > 0;
    if ($('registration-closed')) $('registration-closed').hidden = canApply;
    if ($('registration-open-panel')) $('registration-open-panel').hidden = !canApply;
    const form = $('team-registration-form');
    if (form) form.querySelectorAll('button[type="submit"]').forEach((button) => { button.disabled = !canApply; });
    renderSocialLinks();
  }
  function compressPhoto(file) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      const url = URL.createObjectURL(file);
      image.onload = () => {
        URL.revokeObjectURL(url);
        const scale = Math.min(1, 512 / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
        let quality = 0.72;
        let data = canvas.toDataURL('image/jpeg', quality);
        while (data.length > 85000 && quality > 0.35) { quality -= 0.08; data = canvas.toDataURL('image/jpeg', quality); }
        if (data.length > 92000) reject(new Error('One photo is still too large. Choose a smaller image.'));
        else resolve(data);
      };
      image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read one of the selected photos.')); };
      image.src = url;
    });
  }
  async function submitRegistration(form) {
    const status = $('registration-message');
    const button = $('submit-registration');
    if (!form.reportValidity()) return;
    const original = button.innerHTML;
    button.disabled = true;
    button.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Sending application…';
    status.hidden = false; status.className = 'registration-message'; status.textContent = 'Checking details and preparing photos…';
    try {
      if (!window.firebase?.firestore) throw new Error('The registration database is not available. Please contact the tournament team.');
      const formData = new FormData(form);
      const players = [];
      for (let index = 1; index <= 6; index++) {
        const prefix = index <= 4 ? `starter${index}` : `sub${index - 4}`;
        const ign = String(formData.get(`${prefix}Ign`) || '').trim();
        const uid = String(formData.get(`${prefix}Uid`) || '').replace(/\D/g, '');
        const device = String(formData.get(`${prefix}Device`) || '').trim();
        const file = formData.get(`${prefix}Photo`);
        if (index > 4 && !ign && !uid && !device && (!file || !file.size)) continue;
        if (index > 4 && (!ign || !uid || !device)) throw new Error(`Complete all details for Substitute ${index - 4}, or leave it empty.`);
        if (!/^\d{6,20}$/.test(uid)) throw new Error(`Player ${index}: enter a Free Fire UID with 6 to 20 digits.`);
        players.push({ ign, uid, device, photo: file?.size ? await compressPhoto(file) : null });
      }
      status.textContent = 'Securely submitting your application…';
      const db = firebase.firestore();
      const token = String(formData.get('registrationToken') || '').trim().toUpperCase();
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
      const tokenId = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
      const settingsRef = db.collection('settings').doc('tournament');
      const tokenRef = db.collection('tokens').doc(tokenId);
      const applicationRef = db.collection('registration_applications').doc();
      const application = {
        teamName: String(formData.get('teamName') || '').trim(),
        captainName: String(formData.get('captainName') || '').trim(),
        email: String(formData.get('contactEmail') || '').trim(),
        discord: String(formData.get('discordContact') || '').trim(),
        players: players.map((player, index) => ({ ...player, isSub: index >= 4 })),
        accuracyConfirmed: formData.get('accuracyConfirmation') === 'confirmed',
        status: 'pending',
        tokenDocumentId: tokenId,
        reservationId: applicationRef.id,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      await db.runTransaction(async transaction => {
        const [settingsSnap, tokenSnap] = await Promise.all([
          transaction.get(settingsRef),
          transaction.get(tokenRef)
        ]);
        const settings = settingsSnap.exists ? settingsSnap.data() : {};
        if (settings.registrationOpen !== true && settings.registration?.open !== true) {
          throw new Error('Registration is closed right now.');
        }
        const capacity = Math.max(1, Math.min(128, Number(settings.totalTeams) || 24));
        const reserved = Number(settings.registrationReservedCount);
        if (!Number.isInteger(reserved)) throw new Error('Registration setup is incomplete. Please contact the tournament administrator.');
        if (reserved >= capacity) throw new Error('All team places are full.');
        if (!tokenSnap.exists || tokenSnap.data().tokenHash !== tokenId || tokenSnap.data().used === true) {
          throw new Error('The token is invalid or has already been used.');
        }
        transaction.update(tokenRef, {
          used: true, usedBy: application.teamName,
          redeemedAt: firebase.firestore.FieldValue.serverTimestamp(),
          registrationApplicationId: applicationRef.id
        });
        transaction.update(settingsRef, {
          registrationReservedCount: reserved + 1,
          lastRegistrationId: applicationRef.id
        });
        transaction.set(applicationRef, application);
      });
      location.assign('./register-success.html');
    } catch (error) {
      console.error('Team registration failed:', error);
      status.hidden = false; status.className = 'registration-message error';
      const messages = {
        'permission-denied': 'The token is invalid or has already been used. Check it with your tournament contact.',
        'failed-precondition': 'Registration is closed right now.',
        'resource-exhausted': 'All team places are full.',
        'not-found': 'That registration token is invalid or has already been used.',
        'unavailable': 'The registration service is temporarily unavailable. Please try again.',
        'internal': 'The application could not be saved. Please try again or contact SRP staff.'
      };
      status.textContent = messages[error.code] || error.message || 'Could not submit the application. Please try again.';
      button.disabled = false; button.innerHTML = original;
    }
  }
  function pick(value, keys) {
    for (const key of keys) if (value && value[key] !== undefined && value[key] !== null && value[key] !== '') return value[key];
    return '';
  }
  function renderHallOfFame() {
    const target = $('current-honours'); if (!target) return;
    const archive = window.SRP?.pastSeason || {};
    let seasons = Array.isArray(archive.seasons) ? archive.seasons : (Array.isArray(archive.history) ? archive.history : (Array.isArray(archive.records) ? archive.records : []));
    if (!seasons.length && typeof archive === 'object' && Object.keys(archive).length) {
      const hasRecord = pick(archive, ['champion', 'championName', 'winner', 'team', 'teamName', 'mvp', 'season']) !== '';
      if (hasRecord) seasons = [archive];
    }
    if (!seasons.length) {
      target.innerHTML = '<div class="custom-card !p-7 text-center"><i class="fas fa-award text-3xl text-amber-300"></i><h2 class="mt-3 text-xl font-black text-white">The archive is waiting for its first official record</h2><p class="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-400">No past-season champion records have been published yet. This page will populate when tournament staff archive verified results.</p></div>';
      return;
    }
    const cards = seasons.map((record, index) => {
      if (!record || typeof record !== 'object') return '';
      const season = pick(record, ['season', 'seasonName', 'name']) || `Archived season ${index + 1}`;
      const champion = pick(record, ['champion', 'championName', 'winner', 'teamName', 'team']) || 'Champion not listed';
      const runner = pick(record, ['runnerUp', 'runner_up', 'secondPlace', 'second']) || '';
      const mvp = pick(record, ['mvp', 'MVP', 'mostValuablePlayer']) || '';
      const date = pick(record, ['date', 'completedAt', 'year']) || '';
      const safeTeam = typeof champion === 'object' ? (champion.name || 'Champion') : champion;
      const safeRunner = typeof runner === 'object' ? (runner.name || '') : runner;
      const safeMvp = typeof mvp === 'object' ? (mvp.ign || mvp.name || '') : mvp;
      return `<article class="champion-card rounded-2xl p-5"><div class="flex items-center justify-between gap-3"><span class="cs-pill">${esc(season)}</span><i class="fas fa-crown text-2xl text-amber-300"></i></div><div class="mt-5 text-[10px] font-black uppercase tracking-[.16em] text-amber-200">Champion</div><h2 class="mt-1 text-2xl font-black text-white">${esc(safeTeam)}</h2>${safeRunner ? `<p class="mt-3 text-xs text-slate-400">Runner-up: <b class="text-slate-200">${esc(safeRunner)}</b></p>` : ''}${safeMvp ? `<p class="mt-2 text-xs text-slate-400">Season MVP: <b class="text-slate-200">${esc(safeMvp)}</b></p>` : ''}${date ? `<p class="mt-3 text-[10px] text-slate-500">${esc(date)}</p>` : ''}</article>`;
    }).filter(Boolean);
    target.innerHTML = cards.length ? `<div class="grid grid-cols-1 gap-4 md:grid-cols-2">${cards.join('')}</div>` : '<div class="empty-state">The archive document exists, but it does not contain a recognised champion record yet.</div>';
  }
  function render() {
    applyTheme(); renderSocialLinks();
    if (state.page === 'rules') renderRules();
    if (state.page === 'register') renderRegister();
    if (state.page === 'hall-of-fame') renderHallOfFame();
    if (state.page === 'save-trees') renderSaveTrees();
  }
  function wire() {
    const registrationForm = $('team-registration-form');
    registrationForm?.addEventListener('input', (event) => {
      if (/Uid$/.test(event.target?.name || '')) event.target.value = event.target.value.replace(/\D/g, '').slice(0, 20);
    });
    registrationForm?.addEventListener('submit', (event) => { event.preventDefault(); submitRegistration(registrationForm); });
    registrationForm?.querySelectorAll('.player-photo-input').forEach((input) => {
      input.addEventListener('change', () => {
        const help = input.closest('.player-photo-field')?.querySelector('.photo-help');
        const file = input.files?.[0];
        if (!file) { if (help) help.textContent = 'Choose an image from gallery or files · max 5 MB'; return; }
        const validType = file.type.startsWith('image/');
        if (!validType || file.size > 5 * 1024 * 1024) {
          input.value = '';
          if (help) help.textContent = !validType ? 'Choose an image file.' : 'Image must be 5 MB or smaller.';
          return;
        }
        if (help) help.textContent = `${file.name} · ${(file.size / (1024 * 1024)).toFixed(1)} MB`;
      });
    });
    $('theme-select')?.addEventListener('change', function () {
      const value = $('theme-select').value;
      if (value && THEMES.includes(value)) localStorage.setItem('srp_s6_theme_override', value);
      else localStorage.removeItem('srp_s6_theme_override');
      applyTheme();
    });
    window.addEventListener('storage', (event) => { if (event.key === 'srp_s6_theme_override') applyTheme(); });
    const oldToggle = window.toggleMobileDrawer;
    window.toggleMobileDrawer = function () {
      if (typeof oldToggle === 'function') oldToggle();
      const sidebar = $('app-sidebar'); const backdrop = $('sidebar-backdrop');
      const isOpen = sidebar && !sidebar.classList.contains('-translate-x-full');
      backdrop?.classList.toggle('active', !!isOpen && window.innerWidth < 768);
    };
    if ($('share-pledge')) $('share-pledge').addEventListener('click', async () => {
      const text = 'SRP-ESPORTS Season 6 — Save Trees. I am choosing one practical action to reduce waste and support greener local spaces. #SaveTrees #SRPEsports';
      const status = $('share-pledge-status');
      try {
        if (navigator.share) { await navigator.share({ title: 'SRP-ESPORTS — Save Trees', text, url: location.href }); if (status) status.textContent = 'Thanks for sharing the pledge.'; }
        else if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text + ' ' + location.href); if (status) status.textContent = 'Pledge copied. Paste it wherever you want to share.'; }
        else if (status) status.textContent = 'Sharing is not available in this browser.';
      } catch (error) { if (error?.name !== 'AbortError' && status) status.textContent = 'Could not open sharing on this device.'; }
    });
  }
  window.initSecondaryPage = function (page) {
    state.page = page || document.body.dataset.srpPage || 'rules';
    if (typeof window.initSrpCore === 'function') window.initSrpCore(state.page);
    if (typeof window.onSrpDataUpdate === 'function') window.onSrpDataUpdate(render);
    wire(); render();
  };
})();
