
const firebaseConfig = {
  apiKey: "AIzaSyA5jlILopvGXUWOw37L560ZcFvLP_8fm_Q",
  authDomain: "srpweb-52fd9.firebaseapp.com",
  projectId: "srpweb-52fd9",
  storageBucket: "srpweb-52fd9.firebasestorage.app",
  messagingSenderId: "728798447384",
  appId: "1:728798447384:web:df76949566b05e2480006d",
  measurementId: "G-CFVPK1RCEV"
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const auth = firebase.auth();

async function masterLogin(email, password) {
  try {
    const credential = await auth.signInWithEmailAndPassword(email, password);
    const token = await credential.user.getIdTokenResult(true);

    if (token.claims.role !== "master") {
      await auth.signOut();
      throw new Error("You are not authorized as the master administrator.");
    }

    return true;
  } catch (error) {
    throw new Error(error.message || "Login failed.");
  }
}

async function verifyMaster() {
  const user = auth.currentUser;
  if (!user) return false;

  const token = await user.getIdTokenResult(true);
  return token.claims.role === "master";
}

async function masterLogout() {
  await auth.signOut();
  window.location.href = "admin.html";
}
