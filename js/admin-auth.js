/* SRP-ESPORTS Season 6 — Firebase administrator bootstrap.
 * No passwords, service-account keys, or trusted secrets belong in this file.
 */
(function () {
  'use strict';

  const firebaseConfig = {
    apiKey: "AIzaSyA5jlILopvGXUWOw37L560ZcFvLP_8fm_Q",
    authDomain: "srpweb-52fd9.firebaseapp.com",
    projectId: "srpweb-52fd9",
    storageBucket: "srpweb-52fd9.firebasestorage.app",
    messagingSenderId: "728798447384",
    appId: "1:728798447384:web:df76949566b05e2480006d",
    measurementId: "G-CFVPK1RCEV"
  };

  if (!window.firebase) {
    throw new Error('Firebase SDK did not load. Check the Firebase CDN scripts in admin.html.');
  }

  if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);

  const app = firebase.app();
  const auth = firebase.auth();
  const db = firebase.firestore();
  const functions = typeof app.functions === 'function'
    ? app.functions('asia-south1')
    : null;

  async function readAdminIdentity(forceRefresh = true) {
    const user = auth.currentUser;
    if (!user) return null;

    const tokenResult = await user.getIdTokenResult(forceRefresh);
    const claims = tokenResult.claims || {};
    const role = claims.role;

    if (role !== 'master' && role !== 'sub') return null;
    if (role === 'sub' && claims.active === false) return null;

    return {
      uid: user.uid,
      email: user.email || '',
      displayName: user.displayName || claims.displayName || user.email || 'Administrator',
      role,
      permissions: role === 'master' ? {} : (claims.permissions || {}),
      claims
    };
  }

  async function adminLogin(email, password) {
    const credential = await auth.signInWithEmailAndPassword(String(email || '').trim(), String(password || ''));
    try {
      const identity = await readAdminIdentity(true);
      if (!identity) {
        await auth.signOut();
        throw new Error('This account is not an active SRP administrator.');
      }
      return identity;
    } catch (error) {
      if (auth.currentUser) await auth.signOut();
      throw error;
    }
  }

  async function verifyAdmin(forceRefresh = true) {
    return readAdminIdentity(forceRefresh);
  }

  async function masterLogin(email, password) {
    const identity = await adminLogin(email, password);
    if (identity.role !== 'master') {
      await auth.signOut();
      throw new Error('Master administrator access is required.');
    }
    return identity;
  }

  async function verifyMaster(forceRefresh = true) {
    const identity = await readAdminIdentity(forceRefresh);
    return !!identity && identity.role === 'master';
  }

  async function adminLogout(redirect = 'admin.html') {
    await auth.signOut();
    if (redirect) window.location.replace(redirect);
  }

  async function masterLogout() {
    return adminLogout('admin.html');
  }

  window.SRPAdminFirebase = { app, auth, db, functions, readAdminIdentity };
  window.adminLogin = adminLogin;
  window.verifyAdmin = verifyAdmin;
  window.adminLogout = adminLogout;
  window.masterLogin = masterLogin;
  window.verifyMaster = verifyMaster;
  window.masterLogout = masterLogout;
})();
