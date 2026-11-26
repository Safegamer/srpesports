'use strict';

const crypto = require('node:crypto');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2');

initializeApp();
setGlobalOptions({ region: 'asia-south1', maxInstances: 5 });

const auth = getAuth();
const db = getFirestore();

const ALLOWED_PERMISSIONS = new Set([
  'team_add', 'team_edit_info', 'player_edit_details', 'player_edit_photo',
  'player_manage_subs', 'team_lock_roster', 'team_dq', 'team_delete',
  'match_create', 'match_edit_score', 'match_edit_stats', 'match_edit_vod',
  'match_delete', 'token_view', 'token_create', 'token_delete',
  'announcement_edit', 'livestream_edit', 'tourney_scores', 'tourney_slots',
  'rules_edit', 'prize_edit'
]);

function assertMaster(request) {
  if (!request.auth || request.auth.token.role !== 'master') {
    throw new HttpsError('permission-denied', 'Master administrator access is required.');
  }
}

function cleanPermissions(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new HttpsError('invalid-argument', 'A permissions object is required.');
  }
  const output = {};
  for (const [key, value] of Object.entries(input)) {
    if (!ALLOWED_PERMISSIONS.has(key)) {
      throw new HttpsError('invalid-argument', `Unknown permission: ${key}`);
    }
    output[key] = value === true;
  }
  return output;
}

function makeTemporaryPassword() {
  // Avoid visually ambiguous characters; retain cryptographic randomness.
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  const bytes = crypto.randomBytes(24);
  let password = '';
  for (const byte of bytes) password += alphabet[byte % alphabet.length];
  return password;
}

function validateEmail(email) {
  const value = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) || value.length > 254) {
    throw new HttpsError('invalid-argument', 'Enter a valid email address.');
  }
  return value;
}

async function requireSubAdmin(uid) {
  const targetUid = String(uid || '').trim();
  if (!targetUid || targetUid.length > 128) {
    throw new HttpsError('invalid-argument', 'A valid sub-admin UID is required.');
  }
  let user;
  try {
    user = await auth.getUser(targetUid);
  } catch (_) {
    throw new HttpsError('not-found', 'The Firebase Authentication user was not found.');
  }
  if (user.customClaims?.role !== 'sub') {
    throw new HttpsError('failed-precondition', 'This account is not an SRP sub-admin.');
  }
  return user;
}

function cleanRegistration(data) {
  const text = (value, max) => {
    const result = String(value || '').trim();
    if (result.length > max) throw new HttpsError('invalid-argument', 'Some registration details are too long.');
    return result;
  };
  const teamName = text(data?.teamName, 40);
  const captainName = text(data?.captainName, 50);
  const email = validateEmail(data?.contactEmail);
  const token = text(data?.registrationToken, 40).toUpperCase();
  const starters = Array.isArray(data?.players) ? data.players.slice(0, 6) : [];
  const players = starters.map((player, index) => ({
    ign: text(player?.ign, 30), uid: text(player?.uid, 24), device: text(player?.device, 50),
    isSub: index >= 4, photo: player?.photo || null
  }));
  if (!teamName || !captainName || !token || players.length < 4 || players.slice(0, 4).some(p => !p.ign || !p.uid || !p.device)) {
    throw new HttpsError('invalid-argument', 'Enter team contact details and all four required players.');
  }
  if (data?.accuracyConfirmation !== true) throw new HttpsError('invalid-argument', 'Confirm that you are authorised to submit these player details.');
  if (players.slice(4).some(p => !p.ign && !p.uid && !p.device)) players.splice(4);
  if (players.slice(4).some(p => !p.ign || !p.uid || !p.device)) throw new HttpsError('invalid-argument', 'Complete both substitute details or leave that substitute blank.');
  for (const player of players) {
    if (!player.photo) continue;
    if (typeof player.photo !== 'string' || !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(player.photo) || player.photo.length > 92000) {
      throw new HttpsError('invalid-argument', 'A player photo is invalid or too large. Please choose a smaller image.');
    }
  }
  return {
    teamName, captainName, email, token,
    discord: text(data?.discordContact, 70), players, accuracyConfirmed: true,
    createdAt: FieldValue.serverTimestamp(), status: 'pending'
  };
}

exports.submitTeamRegistration = onCall({ enforceAppCheck: false }, async (request) => {
  const application = cleanRegistration(request.data);
  const settingsRef = db.collection('settings').doc('tournament');
  const tokenQuery = db.collection('tokens').where('token', '==', application.token).limit(1);
  const teamsQuery = db.collection('teams');
  const pendingQuery = db.collection('registration_applications').where('status', '==', 'pending');
  const appRef = db.collection('registration_applications').doc();
  await db.runTransaction(async (tx) => {
    const [settingsSnap, tokenSnap, teamsSnap, pendingSnap] = await Promise.all([
      tx.get(settingsRef), tx.get(tokenQuery), tx.get(teamsQuery), tx.get(pendingQuery)
    ]);
    const settings = settingsSnap.exists ? settingsSnap.data() : {};
    if (settings.registrationOpen !== true && settings.registration?.open !== true) {
      throw new HttpsError('failed-precondition', 'Team registration is closed.');
    }
    const capacity = Math.max(1, Math.min(128, Number(settings.totalTeams) || 24));
    if (teamsSnap.size + pendingSnap.size >= capacity) throw new HttpsError('resource-exhausted', 'All team places are currently full.');
    const tokenDoc = tokenSnap.docs[0];
    if (!tokenDoc || tokenDoc.data().used === true) throw new HttpsError('permission-denied', 'That registration token is invalid or has already been used.');
    tx.update(tokenDoc.ref, { used: true, usedBy: application.teamName, redeemedAt: FieldValue.serverTimestamp(), registrationApplicationId: appRef.id });
    tx.set(appRef, { ...application, tokenDocumentId: tokenDoc.id });
  });
  return { applicationId: appRef.id };
});

exports.listTeamRegistrations = onCall(async (request) => {
  assertMaster(request);
  const snap = await db.collection('registration_applications').orderBy('createdAt', 'desc').limit(100).get();
  return { applications: snap.docs.map(doc => {
    const data = doc.data();
    return { id: doc.id, ...data,
      createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : null,
      players: (data.players || []).map(({ photo, ...player }) => player)
    };
  }) };
});

exports.getTeamRegistration = onCall(async (request) => {
  assertMaster(request);
  const id = String(request.data?.applicationId || '').trim();
  const snap = id ? await db.collection('registration_applications').doc(id).get() : null;
  if (!snap?.exists) throw new HttpsError('not-found', 'Application not found.');
  return { id: snap.id, ...snap.data() };
});

exports.reviewTeamRegistration = onCall(async (request) => {
  assertMaster(request);
  const id = String(request.data?.applicationId || '').trim();
  const decision = request.data?.decision;
  if (!id || !['approve', 'reject'].includes(decision)) throw new HttpsError('invalid-argument', 'Choose approve or reject for an application.');
  const appRef = db.collection('registration_applications').doc(id);
  const teamRef = db.collection('teams').doc();
  const playerRefs = Array.from({ length: 6 }, () => db.collection('players').doc());
  await db.runTransaction(async (tx) => {
    const appSnap = await tx.get(appRef);
    if (!appSnap.exists) throw new HttpsError('not-found', 'Application not found.');
    const app = appSnap.data();
    if (app.status !== 'pending') throw new HttpsError('failed-precondition', 'This application has already been reviewed.');
    if (decision === 'reject') {
      tx.update(appRef, { status: 'rejected', reviewedAt: FieldValue.serverTimestamp(), reviewedBy: request.auth.uid });
      if (app.tokenDocumentId) tx.set(db.collection('tokens').doc(app.tokenDocumentId), { used: false, usedBy: null, registrationApplicationId: FieldValue.delete(), redeemedAt: FieldValue.delete() }, { merge: true });
      return;
    }
    const teamsSnap = await tx.get(db.collection('teams'));
    const settingsSnap = await tx.get(db.collection('settings').doc('tournament'));
    const pendingSnap = await tx.get(db.collection('registration_applications').where('status', '==', 'pending'));
    const settings = settingsSnap.exists ? settingsSnap.data() : {};
    const capacity = Math.max(1, Math.min(128, Number(settings.totalTeams) || 24));
    if (teamsSnap.size >= capacity) throw new HttpsError('resource-exhausted', 'The season is full; this application cannot be approved.');
    const group = String.fromCharCode(65 + Math.min(3, Math.floor(teamsSnap.size / Math.max(1, Math.ceil(capacity / 4)))));
    const team = { name: app.teamName, group, disqualified: false, rosterLocked: false, createdAt: FieldValue.serverTimestamp(), registrationApplicationId: id };
    tx.set(teamRef, team);
    (app.players || []).forEach((p, index) => tx.set(playerRefs[index], {
      teamId: teamRef.id, ign: p.ign, uid: p.uid, device: p.device, role: p.isSub ? 'Sub' : (index === 0 ? 'Captain' : 'Starter'),
      isSub: !!p.isSub, slotOrder: index, createdAt: FieldValue.serverTimestamp()
    }));
    tx.update(appRef, { status: 'approved', teamId: teamRef.id, reviewedAt: FieldValue.serverTimestamp(), reviewedBy: request.auth.uid });
  });
  return { status: decision === 'approve' ? 'approved' : 'rejected' };
});

exports.createSubAdmin = onCall(async (request) => {
  assertMaster(request);
  const displayName = String(request.data?.displayName || '').trim();
  const email = validateEmail(request.data?.email);
  const permissions = cleanPermissions(request.data?.permissions || {});
  if (displayName.length < 2 || displayName.length > 70) {
    throw new HttpsError('invalid-argument', 'Name must be between 2 and 70 characters.');
  }

  const temporaryPassword = makeTemporaryPassword();
  let createdUser = null;
  try {
    createdUser = await auth.createUser({
      email,
      password: temporaryPassword,
      displayName,
      disabled: false
    });

    const claims = { role: 'sub', active: true, permissions };
    await auth.setCustomUserClaims(createdUser.uid, claims);

    await db.collection('sub_admins').doc(createdUser.uid).set({
      uid: createdUser.uid,
      email,
      displayName,
      role: 'sub',
      active: true,
      permissions,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: request.auth.uid
    });

    return { uid: createdUser.uid, email, displayName, temporaryPassword };
  } catch (error) {
    if (createdUser?.uid) {
      try { await auth.deleteUser(createdUser.uid); } catch (_) {}
      try { await db.collection('sub_admins').doc(createdUser.uid).delete(); } catch (_) {}
    }
    if (error instanceof HttpsError) throw error;
    if (error.code === 'auth/email-already-exists') {
      throw new HttpsError('already-exists', 'An account already exists with this email.');
    }
    console.error('createSubAdmin failed:', error);
    throw new HttpsError('internal', 'Could not create the sub-admin account. Check the function logs.');
  }
});

exports.setSubAdminAccess = onCall(async (request) => {
  assertMaster(request);
  const user = await requireSubAdmin(request.data?.uid);
  const permissions = cleanPermissions(request.data?.permissions || {});
  const active = request.data?.active !== false;

  // Update the Firestore permission record first. Security Rules read this
  // record, so removed permissions / deactivation take effect immediately.
  await db.collection('sub_admins').doc(user.uid).set({
    uid: user.uid,
    email: user.email || '',
    displayName: user.displayName || '',
    role: 'sub',
    active,
    permissions,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: request.auth.uid
  }, { merge: true });
  await auth.updateUser(user.uid, { disabled: !active });
  await auth.setCustomUserClaims(user.uid, { role: 'sub', active, permissions });
  if (!active) await auth.revokeRefreshTokens(user.uid);
  return { uid: user.uid, active, permissions };
});

exports.resetSubAdminPassword = onCall(async (request) => {
  assertMaster(request);
  const user = await requireSubAdmin(request.data?.uid);
  if (user.disabled) throw new HttpsError('failed-precondition', 'Re-enable this sub-admin before resetting the password.');
  const temporaryPassword = makeTemporaryPassword();
  await auth.updateUser(user.uid, { password: temporaryPassword });
  await auth.revokeRefreshTokens(user.uid);
  return { uid: user.uid, temporaryPassword };
});

exports.deleteSubAdmin = onCall(async (request) => {
  assertMaster(request);
  const user = await requireSubAdmin(request.data?.uid);
  // Keep an inactive access record for auditability; do not physically erase history.
  // Mark the Firestore record inactive first so Rules reject old ID tokens.
  await db.collection('sub_admins').doc(user.uid).set({
    uid: user.uid,
    email: user.email || '',
    displayName: user.displayName || '',
    role: 'sub',
    active: false,
    permissions: {},
    disabledAt: FieldValue.serverTimestamp(),
    disabledBy: request.auth.uid
  }, { merge: true });
  await auth.updateUser(user.uid, { disabled: true });
  await auth.setCustomUserClaims(user.uid, { role: 'sub', active: false, permissions: {} });
  await auth.revokeRefreshTokens(user.uid);
  return { uid: user.uid, active: false };
});
