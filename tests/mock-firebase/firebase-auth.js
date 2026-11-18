/* Test stand-in for Firebase Auth: same function names and error codes, stored in localStorage */
const K = 'mockfb.users', C = 'mockfb.current';
const users = () => JSON.parse(localStorage.getItem(K) || '{}');
const putUsers = u => localStorage.setItem(K, JSON.stringify(u));
const err = code => { const e = new Error(code); e.code = 'auth/' + code; return e; };
const listeners = [];
let current = null;
const mk = rec => rec && { uid: rec.uid, email: rec.email, displayName: rec.displayName || null, emailVerified: !!rec.verified,
  async reload() { const r = users()[this.email]; Object.assign(this, { emailVerified: !!r.verified, displayName: r.displayName || null }); },
  async getIdToken() { return 'token'; } };
const emit = () => listeners.forEach(f => f(current));
window.__mock = { sent: [], verify(email) { const u = users(); u[email].verified = true; putUsers(u); } };
export const browserLocalPersistence = 'local', browserSessionPersistence = 'session';
export function getAuth() { const c = localStorage.getItem(C); current = c ? mk(users()[c]) : null; return { get currentUser() { return current; }, languageCode: null }; }
export function onAuthStateChanged(auth, f) { listeners.push(f); setTimeout(() => f(current), 30); return () => {}; }
export async function setPersistence() {}
export async function createUserWithEmailAndPassword(auth, email, pw) {
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw err('invalid-email');
  if (pw.length < 6) throw err('weak-password');
  const u = users(); if (u[email]) throw err('email-already-in-use');
  u[email] = { uid: 'u' + Object.keys(u).length + 1, email, pw, verified: false }; putUsers(u);
  localStorage.setItem(C, email); current = mk(u[email]); setTimeout(emit, 10); return { user: current };
}
export async function updateProfile(user, p) { const u = users(); u[user.email].displayName = p.displayName; putUsers(u); user.displayName = p.displayName; }
export async function sendEmailVerification(user, settings) { window.__mock.sent.push({ type: 'verify', to: user.email, settings }); }
export async function sendPasswordResetEmail(auth, email) { window.__mock.sent.push({ type: 'reset', to: email }); if (!users()[email]) throw err('user-not-found'); }
export async function signInWithEmailAndPassword(auth, email, pw) {
  const r = users()[email]; if (!r || r.pw !== pw) throw err('invalid-credential');
  localStorage.setItem(C, email); current = mk(r); setTimeout(emit, 10); return { user: current };
}
export async function signOut() { localStorage.removeItem(C); current = null; setTimeout(emit, 10); }
