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