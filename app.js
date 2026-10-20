import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, APP_NAME } from './config.js';

// ======================================================================
// Setup
// ======================================================================
const $app = document.getElementById('app');
const $sheetRoot = document.getElementById('sheet-root');
const $toast = document.getElementById('toast');
document.title = APP_NAME;

const configured = !SUPABASE_URL.includes('YOUR-PROJECT') && !SUPABASE_ANON_KEY.includes('YOUR-ANON');
const sb = configured ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
const BUCKET = 'task-photos';

const state = {
  session: null,
  me: null,            // my profile row
  people: [],          // all profiles (visible to active users)
  authMode: 'login',   // login | signup | forgot | recovery
  todoScope: 'mine',   // mine | all (admin)
  taskFilter: { cat: 'all', kind: 'all', status: 'open', q: '' },
};

// ======================================================================
// Small helpers
// ======================================================================
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const isAdmin = () => state.me?.role === 'admin';
const todayStr = () => toISO(new Date());
function toISO(d) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function addDays(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  return toISO(new Date(y, m - 1, d + n));
}
function fmtDate(iso, opts = {}) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const sameYear = y === new Date().getFullYear();
  return dt.toLocaleDateString('en-ZA', { weekday: opts.weekday === false ? undefined : 'short', day: 'numeric', month: 'short', year: sameYear ? undefined : 'numeric' });
}
function fmtWhen(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' }) + ', ' + d.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
}
function relDue(iso) {
  const t = todayStr();
  if (iso < t) {
    const days = Math.round((new Date(t) - new Date(iso)) / 864e5);
    return { label: days === 1 ? 'Yesterday' : `${days} days overdue`, cls: 'overdue' };
  }
  if (iso === t) return { label: 'Today', cls: 'today' };
  if (iso === addDays(t, 1)) return { label: 'Tomorrow', cls: '' };
  return { label: fmtDate(iso), cls: '' };
}
const personName = (id) => {
  if (!id) return 'Anyone';
  const p = state.people.find((x) => x.id === id);
  return p ? (p.full_name || p.email) : 'Someone';
};
const initials = (p) => ((p?.full_name || p?.email || '?').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('') || '?').toUpperCase();
const KIND_LABEL = { routine: 'Routine', adhoc: 'Ad hoc', project: 'Project' };
const CAT_LABEL = { cleaning: 'Cleaning', maintenance: 'Maintenance' };
const UNIT_LABEL = { day: 'day', week: 'week', month: 'month', year: 'year' };
function repeatLabel(t) {
  if (t.kind !== 'routine') return '';
  const n = t.repeat_every, u = UNIT_LABEL[t.repeat_unit];
  if (n === 1) return { day: 'Daily', week: 'Weekly', month: 'Monthly', year: 'Yearly' }[t.repeat_unit];
  return `Every ${n} ${u}s`;
}

function toast(msg, ms = 2600) {
  $toast.textContent = msg;
  $toast.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { $toast.hidden = true; }, ms);
}
function friendlyError(e) {
  const m = e?.message || String(e);
  if (/Invalid login credentials/i.test(m)) return 'That email and password don’t match.';
  if (/Email not confirmed/i.test(m)) return 'Please confirm your email first — check your inbox for the link.';
  if (/already registered/i.test(m)) return 'An account with that email already exists. Try signing in.';
  if (/Password should be/i.test(m)) return 'Password must be at least 6 characters.';
  if (/Failed to fetch|NetworkError/i.test(m)) return 'Can’t reach the server. Check your connection.';
  return m;
}

const ICONS = {
  check: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
  list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6h11M9 12h11M9 18h11"/><path d="m3.5 6 1 1 2-2M3.5 12l1 1 2-2M3.5 18l1 1 2-2"/></svg>',
  tasks: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="3"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  people: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c1.8.8 3 2.6 3.5 5.2"/></svg>',
  history: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/></svg>',
  broom: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m14 4 6-2M13 6l3 5M7 12h10l2 9H5z"/><path d="M9 21l.5-4M13 21v-4M16.5 21l-.5-4"/></svg>',
  wrench: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 3.5a5 5 0 0 0-6.6 6.6L3 15l3 3 4.9-4.9a5 5 0 0 0 6.6-6.6l-3 3-2.5-.5-.5-2.5z"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
  x: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  camera: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  image: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/></svg>',
  up: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 15 6-6 6 6"/></svg>',
  down: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>',
  back: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m15 5-7 7 7 7"/></svg>',
};

// ---------- Photos ----------------------------------------------------
const urlCache = new Map(); // path -> { url, exp }
async function signedUrls(paths) {
  const now = Date.now();
  const need = [...new Set(paths)].filter((p) => p && !(urlCache.get(p)?.exp > now));
  if (need.length) {
    const { data, error } = await sb.storage.from(BUCKET).createSignedUrls(need, 3600);
    if (!error && data) for (const r of data) if (r.signedUrl) urlCache.set(r.path, { url: r.signedUrl, exp: now + 50 * 60e3 });
  }
  const out = {};
  for (const p of paths) out[p] = urlCache.get(p)?.url || '';
  return out;
}

// Phone photos are huge — shrink to max 1600px JPEG before upload.
async function compressImage(file, max = 1600, quality = 0.82) {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', quality));
    return blob || file;
  } catch {
    return file; // fall back to the original if the browser can't decode it
  }
}
async function uploadPhoto(file, folder) {
  const blob = await compressImage(file);
  const path = `${folder}/${crypto.randomUUID()}.jpg`;
  const { error } = await sb.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false });
  if (error) throw error;
  urlCache.set(path, { url: URL.createObjectURL(blob), exp: Date.now() + 50 * 60e3 });
  return path;
}
function openLightbox(url) {
  const el = document.createElement('div');
  el.className = 'lightbox';
  el.innerHTML = `<img src="${esc(url)}" alt="">`;
  el.onclick = () => el.remove();
  document.body.appendChild(el);
}
function photoPickerButtons(idPrefix) {
  return `<div class="photo-btns">
    <label class="btn" for="${idPrefix}-cam">${ICONS.camera} Take photo
      <input id="${idPrefix}-cam" type="file" accept="image/*" capture="environment"></label>
    <label class="btn" for="${idPrefix}-lib">${ICONS.image} Choose
      <input id="${idPrefix}-lib" type="file" accept="image/*" multiple></label>
  </div>`;
}

// ---------- Sheets ----------------------------------------------------
function openSheet(html, onMount) {
  $sheetRoot.innerHTML = `<div class="scrim"><div class="sheet" role="dialog" aria-modal="true">${html}</div></div>`;
  const scrim = $sheetRoot.firstElementChild;
  scrim.addEventListener('click', (e) => { if (e.target === scrim) closeSheet(); });
  onMount?.(scrim.querySelector('.sheet'));
}
function closeSheet() { $sheetRoot.innerHTML = ''; }

// ======================================================================
// Data
// ======================================================================
async function loadMe() {
  const uid = state.session?.user?.id;
  if (!uid) { state.me = null; return; }
  const { data, error } = await sb.from('profiles').select('*').eq('id', uid).maybeSingle();
  if (error) throw error;
  state.me = data;
}
async function loadPeople() {
  const { data } = await sb.from('profiles').select('*').order('full_name');
  state.people = data || [];
}

// ======================================================================
// Router
// ======================================================================
const routes = [
  [/^#\/todo$/, viewTodo],
  [/^#\/tasks$/, viewTasks, true],
  [/^#\/task\/new$/, (seq) => viewEditor(null, seq), true],
  [/^#\/task\/([\w-]+)\/edit$/, (id, seq) => viewEditor(id, seq), true],
  [/^#\/task\/([\w-]+)$/, viewDetail],
  [/^#\/people$/, viewPeople, true],
  [/^#\/history$/, viewHistory],
];

let renderSeq = 0;
let peopleLoadedAsActive = false;
let cameFromApp = false; // true once the user has navigated inside the app (so Back can use history)
window.addEventListener('hashchange', () => { cameFromApp = true; }, { capture: true });
async function render() {
  closeSheet();
  if (!configured) return viewNotConfigured();
  if (!state.session && state.authMode === 'recovery') state.authMode = 'login';
  if (!state.session || state.authMode === 'recovery') return viewAuth();
  if (!state.me) {
    try { await loadMe(); } catch (e) { return viewFatal(e); }
    peopleLoadedAsActive = false;
  }
  if (!state.me || state.me.role === 'pending' || state.me.role === 'disabled') return viewPending();
  // While pending, the database only shows a person their own profile. Once active,
  // fetch everyone again so names and the "Assign to" list are complete.
  if (!peopleLoadedAsActive) {
    await loadPeople();
    peopleLoadedAsActive = true;
  }

  const hash = location.hash || '#/todo';
  for (const [re, fn, adminOnly] of routes) {
    const m = hash.match(re);
    if (m) {
      if (adminOnly && !isAdmin()) { location.hash = '#/todo'; return; }
      const seq = ++renderSeq;
      try { await fn(...m.slice(1), seq); } catch (e) { if (seq === renderSeq) viewFatal(e); }
      return;
    }
  }
  location.hash = '#/todo';
}
window.addEventListener('hashchange', render);

function shell({ title, sub = '', body, nav }) {
  const me = state.me;
  const admin = isAdmin();
  const link = (href, icon, label, key) => `<a href="${href}" class="${nav === key ? 'on' : ''}">${icon}<span>${label}</span></a>`;
  $app.innerHTML = `
    <header class="topbar">
      <div><h1>${esc(title)}</h1>${sub ? `<div class="sub">${sub}</div>` : ''}</div>
      <button class="avatar" id="me-btn" title="Account">${esc(initials(me))}</button>
    </header>
    <main>${body}</main>
    <nav class="nav"><div class="nav-inner">
      ${link('#/todo', ICONS.list, 'To-do', 'todo')}
      ${admin ? link('#/tasks', ICONS.tasks, 'All tasks', 'tasks') : ''}
      ${admin ? `<a href="#/task/new" class="add ${nav === 'new' ? 'on' : ''}"><span class="plus">${ICONS.plus}</span></a>` : ''}
      ${admin ? link('#/people', ICONS.people, 'People', 'people') : ''}
      ${link('#/history', ICONS.history, 'History', 'history')}
    </div></nav>`;
  document.getElementById('me-btn').onclick = openAccountSheet;
}

function openAccountSheet() {
  const me = state.me;
  openSheet(`
    <h2>${esc(me.full_name || 'Your account')}</h2>
    <p class="sub">${esc(me.email)} · ${me.role === 'admin' ? 'Admin' : 'Member'}</p>
    <label class="field"><span>Your name</span><input class="input" id="acc-name" value="${esc(me.full_name)}"></label>
    <button class="btn primary block" id="acc-save">Save name</button>
    <div style="height:10px"></div>
    <button class="btn block" id="acc-pw">Change password</button>
    <div style="height:10px"></div>
    <button class="btn danger block" id="acc-out">Sign out</button>`, (s) => {
    s.querySelector('#acc-save').onclick = async () => {
      const name = s.querySelector('#acc-name').value.trim();
      const { error } = await sb.from('profiles').update({ full_name: name }).eq('id', me.id);
      if (error) return toast(friendlyError(error));
      state.me.full_name = name; await loadPeople(); closeSheet(); toast('Saved'); render();
    };
    s.querySelector('#acc-pw').onclick = () => { closeSheet(); state.authMode = 'recovery'; render(); };
    s.querySelector('#acc-out').onclick = async () => { closeSheet(); await sb.auth.signOut(); };
  });
}

// ======================================================================
// Views: auth & states
// ======================================================================
function viewNotConfigured() {
  $app.innerHTML = `<div class="auth"><div class="auth-card">
    <div class="brand"><img src="icon.svg" alt=""><div><h1>${esc(APP_NAME)}</h1><p>Almost there</p></div></div>
    <div class="notice">The app isn’t connected to its database yet. Open <b>config.js</b> and paste in your Supabase project URL and anon key (see README.md).</div>
  </div></div>`;
}
function viewFatal(e) {
  console.error(e);
  $app.innerHTML = `<div class="auth"><div class="auth-card">
    <h2>Something went wrong</h2><div class="err">${esc(friendlyError(e))}</div>
    <button class="btn primary block" onclick="location.reload()">Reload</button></div></div>`;
}

function viewAuth(message = '', isError = true) {
  const mode = state.authMode;
  const titles = { login: 'Sign in', signup: 'Create an account', forgot: 'Reset your password', recovery: 'Set a new password' };
  const fields = {
    login: `
      <label class="field"><span>Email</span><input class="input" name="email" type="email" autocomplete="email" required></label>
      <label class="field"><span>Password</span><input class="input" name="password" type="password" autocomplete="current-password" required></label>`,
    signup: `
      <label class="field"><span>Your name</span><input class="input" name="name" autocomplete="name" required></label>
      <label class="field"><span>Email</span><input class="input" name="email" type="email" autocomplete="email" required></label>
      <label class="field"><span>Password</span><input class="input" name="password" type="password" autocomplete="new-password" minlength="6" required></label>`,
    forgot: `<label class="field"><span>Email</span><input class="input" name="email" type="email" autocomplete="email" required></label>`,
    recovery: `<label class="field"><span>New password</span><input class="input" name="password" type="password" autocomplete="new-password" minlength="6" required></label>`,
  };
  const btn = { login: 'Sign in', signup: 'Create account', forgot: 'Send reset link', recovery: 'Save password' };
  const switches = {
    login: `<button type="button" class="linkish" data-mode="forgot">Forgot password?</button><br><br>New here? <button type="button" class="linkish" data-mode="signup">Create an account</button>`,
    signup: `Already have an account? <button type="button" class="linkish" data-mode="login">Sign in</button>`,
    forgot: `<button type="button" class="linkish" data-mode="login">Back to sign in</button>`,
    recovery: state.me ? `<button type="button" class="linkish" data-mode="cancel">Cancel</button>` : '',
  };
  $app.innerHTML = `<div class="auth"><form class="auth-card" novalidate>
    <div class="brand"><img src="icon.svg" alt=""><div><h1>${esc(APP_NAME)}</h1><p>Cleaning &amp; maintenance</p></div></div>
    <h2>${titles[mode]}</h2>
    ${message ? `<div class="${isError ? 'err' : 'ok-msg'}">${esc(message)}</div>` : ''}
    ${fields[mode]}
    <button class="btn primary block" type="submit">${btn[mode]}</button>
    <div class="switch">${switches[mode]}</div>
  </form></div>`;
  const form = $app.querySelector('form');
  form.querySelectorAll('[data-mode]').forEach((b) => b.onclick = () => {
    if (b.dataset.mode === 'cancel') { state.authMode = 'login'; render(); return; }
    state.authMode = b.dataset.mode; viewAuth();
  });
  form.onsubmit = async (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    const f = Object.fromEntries(new FormData(form));
    const submit = form.querySelector('[type=submit]');
    submit.disabled = true;
    try {
      if (mode === 'login') {
        const { error } = await sb.auth.signInWithPassword({ email: f.email.trim(), password: f.password });
        if (error) throw error;
      } else if (mode === 'signup') {
        const { data, error } = await sb.auth.signUp({
          email: f.email.trim(), password: f.password,
          options: { data: { full_name: f.name.trim() }, emailRedirectTo: location.origin + location.pathname },
        });
        if (error) throw error;
        if (!data.session) { state.authMode = 'login'; return viewAuth('Check your email to confirm your account, then sign in.', false); }
      } else if (mode === 'forgot') {
        const { error } = await sb.auth.resetPasswordForEmail(f.email.trim(), { redirectTo: location.origin + location.pathname });
        if (error) throw error;
        state.authMode = 'login';
        return viewAuth('If that email has an account, a reset link is on its way.', false);
      } else if (mode === 'recovery') {
        const { error } = await sb.auth.updateUser({ password: f.password });
        if (error) throw error;
        state.authMode = 'login';
        toast('Password updated');
        render();
      }
    } catch (err) {
      viewAuth(friendlyError(err));
    } finally {
      submit.disabled = false;
    }
  };
}

function viewPending() {
  const disabled = state.me?.role === 'disabled';
  $app.innerHTML = `<div class="auth"><div class="auth-card">
    <div class="brand"><img src="icon.svg" alt=""><div><h1>${esc(APP_NAME)}</h1><p>${esc(state.me?.email || '')}</p></div></div>
    <h2>${disabled ? 'Account switched off' : 'Waiting for approval'}</h2>
    <p style="color:var(--muted)">${disabled
      ? 'An admin has switched this account off. Ask them if you think that’s a mistake.'
      : 'Your account is set up. An admin needs to approve it before you can see tasks — let them know you’ve signed up.'}</p>
    <button class="btn primary block" id="chk">Check again</button>
    <div style="height:10px"></div>
    <button class="btn block" id="out">Sign out</button>
  </div></div>`;
  document.getElementById('chk').onclick = async () => { state.me = null; render(); };
  document.getElementById('out').onclick = () => sb.auth.signOut();
}

// ======================================================================
// View: To-do
// ======================================================================
async function viewTodo(seq) {
  const admin = isAdmin();
  const horizon = addDays(todayStr(), 7);
  let q = sb.from('tasks').select('*').eq('is_done', false).eq('is_active', true).lte('due_date', horizon).order('due_date').order('priority');
  if (!admin || state.todoScope === 'mine') q = q.or(`assigned_to.is.null,assigned_to.eq.${state.me.id}`);
  const { data: tasks, error } = await q;
  if (error) throw error;
  if (seq !== renderSeq) return;

  const t = todayStr();
  const prioRank = { high: 0, normal: 1, low: 2 };
  tasks.sort((a, b) => a.due_date.localeCompare(b.due_date) || prioRank[a.priority] - prioRank[b.priority]);
  const overdue = tasks.filter((x) => x.due_date < t);
  const today = tasks.filter((x) => x.due_date === t);
  const soon = tasks.filter((x) => x.due_date > t);
  const urls = await signedUrls(tasks.map((x) => x.photos[0]).filter(Boolean));

  const section = (label, list, cls = '') => list.length ? `
    <div class="section-h ${cls}"><h2>${label}</h2><span class="count">${list.length}</span></div>
    <div class="list">${list.map((x) => taskCard(x, urls, { tick: true, showAssignee: admin && state.todoScope === 'all' })).join('')}</div>` : '';

  const dueNow = overdue.length + today.length;
  const greet = new Date().getHours() < 12 ? 'Morning' : new Date().getHours() < 17 ? 'Afternoon' : 'Evening';
  const first = (state.me.full_name || '').split(' ')[0];
  shell({
    title: 'To-do',
    sub: `${greet}${first ? ', ' + esc(first) : ''} · ${dueNow ? `${dueNow} to do now` : 'nothing due now'}`,
    nav: 'todo',
    body: `
      ${admin ? `<div class="filters" style="margin-top:4px">
        <button class="fchip ${state.todoScope === 'mine' ? 'on' : ''}" data-scope="mine">My list</button>
        <button class="fchip ${state.todoScope === 'all' ? 'on' : ''}" data-scope="all">Everyone</button></div>` : ''}
      ${tasks.length ? '' : `<div class="empty" style="margin-top:16px"><b>All clear</b>Nothing due in the next week.${admin ? '<br><br><a class="btn primary" href="#/task/new">Add a task</a>' : ''}</div>`}
      ${section('Overdue', overdue, 'overdue')}
      ${section('Today', today)}
      ${section('Next 7 days', soon)}`,
  });
  $app.querySelectorAll('[data-scope]').forEach((b) => b.onclick = () => { state.todoScope = b.dataset.scope; render(); });
  bindCards(tasks);
}

function statusChip(t) {
  if (t.is_done) return '<span class="chip done">Done</span>';
  if (!t.is_active) return '<span class="chip">Inactive</span>';
  const due = relDue(t.due_date);
  return `<span class="chip ${due.cls}">${esc(due.label)}</span>`;
}

function taskCard(t, urls, { tick = false, showAssignee = false } = {}) {
  const thumb = t.photos[0] && urls[t.photos[0]]
    ? `<img class="thumb" src="${esc(urls[t.photos[0]])}" alt="" loading="lazy">`
    : `<div class="thumb ph">${t.category === 'cleaning' ? ICONS.broom : ICONS.wrench}</div>`;
  const status = statusChip(t);
  return `<div class="card" data-id="${t.id}">
    <div class="body" data-open="${t.id}" role="button" tabindex="0">
      ${thumb}
      <div style="min-width:0">
        <p class="t">${esc(t.title)}</p>
        <div class="meta">
          ${status}
          <span class="chip ${t.category}">${CAT_LABEL[t.category]}</span>
          ${t.priority === 'high' ? '<span class="chip high">High</span>' : ''}
          <span>${t.kind === 'routine' ? esc(repeatLabel(t)) : KIND_LABEL[t.kind]}${t.area ? ' · ' + esc(t.area) : ''}${showAssignee ? ' · ' + esc(personName(t.assigned_to)) : ''}</span>
        </div>
      </div>
    </div>
    ${tick && !t.is_done ? `<button class="tick" data-tick="${t.id}" aria-label="Mark ${esc(t.title)} complete"><span>${ICONS.check}</span></button>` : ''}
  </div>`;
}
function bindCards(tasks) {
  $app.querySelectorAll('[data-open]').forEach((el) => {
    const go = () => { location.hash = `#/task/${el.dataset.open}`; };
    el.onclick = go;
    el.onkeydown = (e) => { if (e.key === 'Enter') go(); };
  });
  $app.querySelectorAll('[data-tick]').forEach((b) => b.onclick = () => openCompleteSheet(tasks.find((t) => t.id === b.dataset.tick), b));
}

// ---------- Complete sheet -------------------------------------------
function openCompleteSheet(task, tickBtn) {
  const photos = [];
  openSheet(`
    <h2>Mark complete</h2>
    <p class="sub">${esc(task.title)}</p>
    <label class="field"><span>Note (optional)</span><textarea class="input" id="c-note" placeholder="Anything worth knowing — e.g. ran out of filters"></textarea></label>
    <div class="field"><span style="display:block;font-size:13px;font-weight:700;color:var(--muted);margin-bottom:6px">Photo of the finished job (optional)</span>
      <div class="photo-grid" id="c-photos"></div>
      ${photoPickerButtons('c')}
    </div>
    <button class="btn primary block" id="c-done">${ICONS.check} Done</button>`, (s) => {
    const grid = s.querySelector('#c-photos');
    const drawPhotos = () => {
      grid.innerHTML = photos.map((p, i) => `<div class="ph ${p.path ? '' : 'uploading'}"><img src="${esc(p.preview)}" alt=""><button data-rm="${i}" aria-label="Remove">${ICONS.x}</button></div>`).join('');
      grid.querySelectorAll('[data-rm]').forEach((b) => b.onclick = () => { photos.splice(+b.dataset.rm, 1); drawPhotos(); });
    };
    const onFiles = async (files) => {
      for (const file of files) {
        const entry = { preview: URL.createObjectURL(file), path: null };
        photos.push(entry); drawPhotos();
        try { entry.path = await uploadPhoto(file, 'done'); }
        catch (e) { photos.splice(photos.indexOf(entry), 1); toast(friendlyError(e)); }
        drawPhotos();
      }
    };
    s.querySelectorAll('input[type=file]').forEach((inp) => inp.onchange = () => { onFiles([...inp.files]); inp.value = ''; });
    s.querySelector('#c-done').onclick = async (e) => {
      if (photos.some((p) => !p.path)) return toast('Wait for the photo to finish uploading');
      e.currentTarget.disabled = true;
      const { data, error } = await sb.rpc('complete_task', {
        p_task_id: task.id, p_note: s.querySelector('#c-note').value.trim(),
        p_photos: photos.map((p) => p.path), p_today: todayStr(),
      });
      if (error) { e.currentTarget.disabled = false; return toast(friendlyError(error)); }
      // Start the next round with a clean checklist
      try { localStorage.removeItem('items:' + task.id); localStorage.removeItem('steps:' + task.id); } catch {}
      closeSheet();
      tickBtn?.classList.add('done');
      toast(task.kind === 'routine' ? `Done! Next due ${fmtDate(data.due_date)}` : 'Done!');
      setTimeout(render, 450);
    };
  });
}

// ======================================================================
// View: Task detail
// ======================================================================
async function viewDetail(id, seq) {
  const { data: t, error } = await sb.from('tasks').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (seq !== renderSeq) return;
  if (!t) {
    shell({ title: 'Not found', nav: '', body: `<div class="empty"><b>Task not found</b>It may have been deleted, or it isn’t assigned to you.<br><br><a class="btn" href="#/todo">Back to to-do</a></div>` });
    return;
  }
  const { data: hist } = await sb.from('completions').select('*').eq('task_id', id).order('completed_at', { ascending: false }).limit(5);
  const steps = t.steps || [];
  const urls = await signedUrls([...t.photos, ...steps.flatMap((s) => s.photos || [])]);
  const readSet = (key) => { try { return new Set(JSON.parse(localStorage.getItem(key) || '[]')); } catch { return new Set(); } };
  const saveSet = (key, set) => { try { localStorage.setItem(key, JSON.stringify([...set])); } catch {} };
  const checked = [...readSet('items:' + id)];
  const stepsDone = readSet('steps:' + id);

  shell({
    title: CAT_LABEL[t.category], nav: '',
    body: `
      <a class="back" href="${isAdmin() ? '#/tasks' : '#/todo'}" id="d-back">${ICONS.back} Back</a>
      <h2 class="detail-title">${esc(t.title)}</h2>
      <div class="meta" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px">
        ${statusChip(t)}
        <span class="chip ${t.category}">${CAT_LABEL[t.category]}</span>
        <span class="chip">${KIND_LABEL[t.kind]}</span>
        ${t.priority === 'high' ? '<span class="chip high">High priority</span>' : ''}
      </div>
      ${!t.is_done && t.is_active ? `<div class="actions" style="margin-top:0"><button class="btn primary" id="d-done">${ICONS.check} Mark complete</button>
        ${isAdmin() ? `<a class="btn" href="#/task/${t.id}/edit">Edit</a>` : ''}</div>`
        : isAdmin() ? `<div class="actions" style="margin-top:0">
            ${!t.is_done && !t.is_active ? `<button class="btn primary" id="d-activate">Activate</button>` : ''}
            <a class="btn" href="#/task/${t.id}/edit">Edit</a>${t.is_done ? '<button class="btn" id="d-reopen">Reopen</button>' : ''}</div>` : ''}
      ${!t.is_done && !t.is_active ? `<div class="notice">Inactive — this task isn’t on anyone’s to-do list.${isAdmin() ? ' Tap <b>Activate</b> when it’s needed.' : ''}</div>` : ''}
      ${t.photos.length ? `<div class="panel"><h3>Photos</h3><div class="gallery">${t.photos.map((p) => `<button data-full="${esc(urls[p])}"><img src="${esc(urls[p])}" alt="" loading="lazy"></button>`).join('')}</div></div>` : ''}
      ${t.description ? `<div class="panel"><h3>What to do</h3><p class="desc">${esc(t.description)}</p></div>` : ''}
      ${t.items.length ? `<div class="panel"><h3>Items needed</h3><ul class="items">${t.items.map((it, i) => `
        <li><label><input type="checkbox" data-item="${i}" ${checked.includes(i) ? 'checked' : ''}><span class="${checked.includes(i) ? 'got' : ''}">${esc(it.name)}</span></label>${it.qty ? `<span class="qty">${esc(it.qty)}</span>` : ''}</li>`).join('')}</ul></div>` : ''}
      ${steps.length ? `<div class="panel"><h3>Steps <span class="step-progress" id="step-progress"></span></h3><ol class="steps">${steps.map((s, i) => `
        <li class="${stepsDone.has(i) ? 'done' : ''}">
          <label class="step-check"><input type="checkbox" data-step="${i}" ${stepsDone.has(i) ? 'checked' : ''} aria-label="Step ${i + 1} done"><span class="step-num">${i + 1}</span></label>
          <div class="step-body">
            ${s.text ? `<p class="desc">${esc(s.text)}</p>` : ''}
            ${(s.photos || []).length ? `<div class="gallery">${s.photos.map((p) => `<button data-full="${esc(urls[p])}"><img src="${esc(urls[p])}" alt="" loading="lazy"></button>`).join('')}</div>` : ''}
          </div>
        </li>`).join('')}</ol></div>` : ''}
      <div class="panel"><h3>Details</h3><dl class="kv">
        <dt>${t.kind === 'routine' ? 'Repeats' : 'Type'}</dt><dd>${t.kind === 'routine' ? esc(repeatLabel(t)) : KIND_LABEL[t.kind]}</dd>
        <dt>${t.kind === 'routine' ? 'Next due' : 'Planned for'}</dt><dd>${t.due_date ? esc(fmtDate(t.due_date)) : 'Not set'}</dd>
        ${t.area ? `<dt>Where</dt><dd>${esc(t.area)}</dd>` : ''}
        <dt>Assigned to</dt><dd>${esc(personName(t.assigned_to))}</dd>
      </dl></div>
      ${hist?.length ? `<div class="panel"><h3>Recently done</h3>${hist.map((c) => `<div class="hist"><div class="top"><b>${esc(personName(c.completed_by))}</b><small>${esc(fmtWhen(c.completed_at))}</small></div>${c.note ? `<p class="note">${esc(c.note)}</p>` : ''}</div>`).join('')}</div>` : ''}`,
  });
  document.getElementById('d-back').onclick = (e) => {
    if (cameFromApp) { e.preventDefault(); history.back(); }
  };
  $app.querySelectorAll('[data-full]').forEach((b) => b.onclick = () => openLightbox(b.dataset.full));
  $app.querySelectorAll('[data-item]').forEach((cb) => cb.onchange = () => {
    const set = readSet('items:' + id);
    cb.checked ? set.add(+cb.dataset.item) : set.delete(+cb.dataset.item);
    saveSet('items:' + id, set);
    cb.nextElementSibling.classList.toggle('got', cb.checked);
  });
  const progress = document.getElementById('step-progress');
  const drawProgress = () => { if (progress) progress.textContent = `· ${stepsDone.size} of ${steps.length} done`; };
  drawProgress();
  $app.querySelectorAll('[data-step]').forEach((cb) => cb.onchange = () => {
    cb.checked ? stepsDone.add(+cb.dataset.step) : stepsDone.delete(+cb.dataset.step);
    saveSet('steps:' + id, stepsDone);
    cb.closest('li').classList.toggle('done', cb.checked);
    drawProgress();
  });
  const done = document.getElementById('d-done');
  if (done) done.onclick = () => openCompleteSheet(t);
  const activate = document.getElementById('d-activate');
  if (activate) activate.onclick = () => openSheet(`
    <h2>Activate task</h2>
    <p class="sub">${esc(t.title)} will appear on ${t.assigned_to ? esc(personName(t.assigned_to)) + '’s' : 'everyone’s'} to-do list from this date.</p>
    <label class="field"><span>${t.kind === 'routine' ? 'Next due' : 'Planned date'}</span>
      <input class="input" type="date" id="act-date" value="${esc(t.due_date && t.due_date > todayStr() ? t.due_date : todayStr())}"></label>
    <button class="btn primary block" id="act-go">Activate</button>`, (s) => {
    s.querySelector('#act-go').onclick = async (e) => {
      const date = s.querySelector('#act-date').value || todayStr();
      e.currentTarget.disabled = true;
      const { error: e2 } = await sb.from('tasks').update({ is_active: true, due_date: date, updated_at: new Date().toISOString() }).eq('id', t.id);
      if (e2) { e.currentTarget.disabled = false; return toast(friendlyError(e2)); }
      closeSheet(); toast(date === todayStr() ? 'Activated — on the to-do list today' : `Activated for ${fmtDate(date)}`); render();
    };
  });
  const reopen = document.getElementById('d-reopen');
  if (reopen) reopen.onclick = async () => {
    const { error: e2 } = await sb.from('tasks').update({ is_done: false, due_date: todayStr(), updated_at: new Date().toISOString() }).eq('id', t.id);
    if (e2) return toast(friendlyError(e2));
    toast('Reopened for today'); render();
  };
}

// ======================================================================
// View: All tasks (admin)
// ======================================================================
async function viewTasks(seq) {
  const { data: tasks, error } = await sb.from('tasks').select('*').order('due_date');
  if (error) throw error;
  if (seq !== renderSeq) return;
  const f = state.taskFilter;
  const urls = await signedUrls(tasks.map((x) => x.photos[0]).filter(Boolean));

  const draw = () => {
    const q = f.q.toLowerCase();
    const list = tasks.filter((t) =>
      (f.cat === 'all' || t.category === f.cat) &&
      (f.kind === 'all' || t.kind === f.kind) &&
      (f.status === 'all'
        || (f.status === 'open' && !t.is_done && t.is_active)
        || (f.status === 'inactive' && !t.is_done && !t.is_active)
        || (f.status === 'done' && t.is_done)) &&
      (!q || `${t.title} ${t.area} ${t.description}`.toLowerCase().includes(q)));
    const box = document.getElementById('task-list');
    box.innerHTML = list.length
      ? list.map((t) => taskCard(t, urls, { showAssignee: true })).join('')
      : `<div class="empty"><b>No tasks here</b>${tasks.length ? 'Try a different filter.' : 'Tap + to add your first task.'}</div>`;
    bindCards(list);
  };
  const chips = (key, opts) => opts.map(([v, l]) => `<button class="fchip ${f[key] === v ? 'on' : ''}" data-f="${key}" data-v="${v}">${l}</button>`).join('');

  shell({
    title: 'All tasks', sub: `${tasks.filter((t) => !t.is_done && t.is_active).length} open`, nav: 'tasks',
    body: `
      <input class="input search" id="q" type="search" placeholder="Search tasks, rooms…" value="${esc(f.q)}">
      <div class="filters">${chips('status', [['open', 'Open'], ['inactive', 'Inactive'], ['done', 'Done'], ['all', 'All']])}</div>
      <div class="filters">${chips('cat', [['all', 'Any type'], ['cleaning', 'Cleaning'], ['maintenance', 'Maintenance']])}
        ${chips('kind', [['all', 'Any schedule'], ['routine', 'Routine'], ['adhoc', 'Ad hoc'], ['project', 'Projects']])}</div>
      <div class="list" id="task-list" style="margin-top:8px"></div>`,
  });
  draw();
  document.getElementById('q').oninput = (e) => { f.q = e.target.value; draw(); };
  $app.querySelectorAll('[data-f]').forEach((b) => b.onclick = () => {
    f[b.dataset.f] = b.dataset.v;
    $app.querySelectorAll(`[data-f="${b.dataset.f}"]`).forEach((x) => x.classList.toggle('on', x === b));
    draw();
  });
}

// ======================================================================
// View: Task editor (admin)
// ======================================================================
async function viewEditor(id, seq) {
  let t = {
    title: '', description: '', category: 'cleaning', kind: 'routine', area: '', priority: 'normal',
    items: [], photos: [], assigned_to: null, repeat_every: 1, repeat_unit: 'week',
    due_date: todayStr(), is_active: true, is_done: false,
  };
  if (id) {
    const { data, error } = await sb.from('tasks').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    if (!data) { location.hash = '#/tasks'; return; }
    t = data;
  }
  await loadPeople(); // always offer the current list of people to assign to
  if (seq !== renderSeq) return;
  const items = t.items.map((x) => ({ ...x }));
  const tSteps = t.steps || [];
  const urls = await signedUrls([...t.photos, ...tSteps.flatMap((s) => s.photos || [])]);
  const photos = t.photos.map((p) => ({ path: p, preview: urls[p] }));
  const steps = tSteps.map((s) => ({ text: s.text || '', photos: (s.photos || []).map((p) => ({ path: p, preview: urls[p] })) }));
  const removed = [];
  const active = state.people.filter((p) => p.role === 'admin' || p.role === 'member');
  const areas = [...new Set((await sb.from('tasks').select('area')).data?.map((x) => x.area).filter(Boolean) || [])].sort();
  const seg = (name, opts, val) => `<div class="seg" data-seg="${name}">${opts.map(([v, l]) => `<button type="button" data-v="${v}" class="${val === v ? 'on' : ''}">${l}</button>`).join('')}</div>`;

  shell({
    title: id ? 'Edit task' : 'New task', nav: id ? '' : 'new',
    body: `<form id="ed" novalidate>
      <div class="panel">
        <h3>Photos</h3>
        <div class="photo-grid" id="ed-photos"></div>
        ${photoPickerButtons('ed')}
      </div>
      <div class="panel">
        <label class="field"><span>Task</span><input class="input" name="title" required placeholder="e.g. Clean pool filter" value="${esc(t.title)}"></label>
        <div class="field"><span>Category</span>${seg('category', [['cleaning', 'Cleaning'], ['maintenance', 'Maintenance']], t.category)}</div>
        <div class="field"><span>Schedule</span>${seg('kind', [['routine', 'Routine'], ['adhoc', 'Ad hoc'], ['project', 'Project']], t.kind)}</div>
        <p class="hint" id="kind-hint"></p>
        <div id="repeat-row" class="row">
          <label class="field"><span>Repeat every</span><input class="input" name="repeat_every" type="number" min="1" inputmode="numeric" value="${esc(t.repeat_every || 1)}"></label>
          <label class="field"><span>&nbsp;</span><select class="input" name="repeat_unit">
            ${['day', 'week', 'month', 'year'].map((u) => `<option value="${u}" ${t.repeat_unit === u ? 'selected' : ''}>${u}(s)</option>`).join('')}
          </select></label>
        </div>
        <label class="toggle" id="active-row"><span><b>Active</b><br><small style="color:var(--muted)" id="active-hint"></small></span>
          <input type="checkbox" name="is_active" ${t.is_active ? 'checked' : ''}></label>
        <label class="field" id="due-row"><span id="due-label">First due</span><input class="input" name="due_date" type="date" value="${esc(t.due_date || '')}"></label>
        <div class="row">
          <label class="field"><span>Assign to</span><select class="input" name="assigned_to">
            <option value="">Anyone</option>
            ${active.map((p) => `<option value="${p.id}" ${t.assigned_to === p.id ? 'selected' : ''}>${esc(p.full_name || p.email)}</option>`).join('')}
          </select></label>
          <label class="field"><span>Priority</span><select class="input" name="priority">
            ${['low', 'normal', 'high'].map((p) => `<option value="${p}" ${t.priority === p ? 'selected' : ''}>${p[0].toUpperCase() + p.slice(1)}</option>`).join('')}
          </select></label>
        </div>
        <label class="field"><span>Where</span><input class="input" name="area" list="areas" placeholder="e.g. Kitchen, Garden, Main bedroom" value="${esc(t.area)}">
          <datalist id="areas">${areas.map((a) => `<option value="${esc(a)}">`).join('')}</datalist></label>
        <label class="field"><span>Description</span><textarea class="input" name="description" placeholder="Overview, what good looks like, anything to watch out for">${esc(t.description)}</textarea></label>
      </div>
      <div class="panel">
        <h3>Items needed</h3>
        <div id="ed-items"></div>
        <button type="button" class="btn sm" id="add-item">${ICONS.plus.replace('<svg', '<svg width="16" height="16"')} Add item</button>
      </div>
      <div class="panel">
        <h3>Steps</h3>
        <div id="ed-steps"></div>
        <button type="button" class="btn sm" id="add-step">${ICONS.plus.replace('<svg', '<svg width="16" height="16"')} Add step</button>
      </div>
      <div class="sticky-save">
        ${id ? `<button type="button" class="btn danger" id="del" style="flex:0 0 auto">${ICONS.trash.replace('<svg', '<svg width="20" height="20"')}</button>` : ''}
        <button class="btn primary" type="submit" id="save">${id ? 'Save changes' : 'Add task'}</button>
      </div>
    </form>`,
  });

  const form = document.getElementById('ed');
  const segVal = {};
  form.querySelectorAll('[data-seg]').forEach((s) => {
    segVal[s.dataset.seg] = s.querySelector('.on').dataset.v;
    s.querySelectorAll('button').forEach((b) => b.onclick = () => {
      s.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
      segVal[s.dataset.seg] = b.dataset.v;
      syncKind();
    });
  });
  const hints = {
    routine: 'Repeats on a schedule. After it’s ticked off, it comes back automatically.',
    adhoc: 'A one-off job. Shows on the to-do list from the planned date until it’s done. Untick Active to keep it on file, with no date, until it’s needed.',
    project: 'An improvement or bigger job. Shows from the planned date until it’s marked done.',
  };
  function syncKind() {
    const k = segVal.kind;
    document.getElementById('repeat-row').hidden = k !== 'routine';
    document.getElementById('kind-hint').textContent = hints[k];
    const activeBox = form.querySelector('[name=is_active]');
    // Ad hoc tasks can always be parked as inactive; routine tasks can be paused once they exist.
    const showActive = k === 'adhoc' || (k === 'routine' && id && t.kind === 'routine');
    document.getElementById('active-row').hidden = !showActive;
    if (!showActive) activeBox.checked = true;
    const inactive = !activeBox.checked;
    document.getElementById('active-hint').textContent = inactive
      ? 'Not on anyone’s to-do list. Activate it from the task when it’s needed.'
      : 'Shows on the to-do list from the date below.';
    const dueInput = form.querySelector('[name=due_date]');
    const dateOptional = k === 'adhoc' && inactive;
    dueInput.required = !dateOptional;
    if (!dateOptional && !dueInput.value) dueInput.value = todayStr();
    document.getElementById('due-label').textContent = k === 'routine'
      ? (id ? 'Next due' : 'First due')
      : dateOptional ? 'Planned date (optional)' : 'Planned date';
  }
  form.querySelector('[name=is_active]').onchange = (e) => {
    if (!e.target.checked && segVal.kind === 'adhoc') form.querySelector('[name=due_date]').value = '';
    syncKind();
  };
  syncKind();

  // Items
  const itemsBox = document.getElementById('ed-items');
  const drawItems = () => {
    itemsBox.innerHTML = items.map((it, i) => `<div class="item-row">
      <input class="input" data-i="${i}" data-k="name" placeholder="Item" value="${esc(it.name)}">
      <input class="input" data-i="${i}" data-k="qty" placeholder="Qty" value="${esc(it.qty || '')}">
      <button type="button" class="icon-btn" data-rmi="${i}" aria-label="Remove item">${ICONS.x}</button></div>`).join('')
      || '<p class="hint" style="margin:0 0 10px">Tools, cleaning products, spares — anything to have ready.</p>';
    itemsBox.querySelectorAll('[data-k]').forEach((inp) => inp.oninput = () => { items[+inp.dataset.i][inp.dataset.k] = inp.value; });
    itemsBox.querySelectorAll('[data-rmi]').forEach((b) => b.onclick = () => { items.splice(+b.dataset.rmi, 1); drawItems(); });
  };
  drawItems();
  document.getElementById('add-item').onclick = () => {
    items.push({ name: '', qty: '' }); drawItems();
    itemsBox.querySelector(`[data-i="${items.length - 1}"][data-k="name"]`).focus();
  };

  // Photos
  const grid = document.getElementById('ed-photos');
  const drawPhotos = () => {
    grid.innerHTML = photos.map((p, i) => `<div class="ph ${p.path ? '' : 'uploading'}"><img src="${esc(p.preview || '')}" alt=""><button type="button" data-rm="${i}" aria-label="Remove photo">${ICONS.x}</button></div>`).join('');
    grid.querySelectorAll('[data-rm]').forEach((b) => b.onclick = () => {
      const [p] = photos.splice(+b.dataset.rm, 1);
      if (p.path) removed.push(p.path);
      drawPhotos();
    });
  };
  drawPhotos();
  // Upload picked files into a photo list, redrawing as each one finishes.
  const addPhotos = async (files, list, redraw) => {
    for (const file of files) {
      const entry = { preview: URL.createObjectURL(file), path: null };
      list.push(entry); redraw();
      try { entry.path = await uploadPhoto(file, 'tasks'); }
      catch (e) { list.splice(list.indexOf(entry), 1); toast(friendlyError(e)); }
      redraw();
    }
  };
  ['#ed-cam', '#ed-lib'].forEach((sel) => {
    const inp = form.querySelector(sel);
    inp.onchange = () => { const files = [...inp.files]; inp.value = ''; addPhotos(files, photos, drawPhotos); };
  });

  // Steps — each with its own text and optional photos
  const stepsBox = document.getElementById('ed-steps');
  const drawSteps = () => {
    stepsBox.innerHTML = steps.map((s, i) => `<div class="step-ed">
      <div class="step-head">
        <span class="step-num">${i + 1}</span>
        <textarea class="input" data-st="${i}" rows="2" placeholder="What to do in this step">${esc(s.text)}</textarea>
        <div class="step-tools">
          <button type="button" class="icon-btn sm" data-mv="${i}:-1" aria-label="Move step up" ${i === 0 ? 'disabled' : ''}>${ICONS.up}</button>
          <button type="button" class="icon-btn sm" data-mv="${i}:1" aria-label="Move step down" ${i === steps.length - 1 ? 'disabled' : ''}>${ICONS.down}</button>
          <button type="button" class="icon-btn sm" data-rms="${i}" aria-label="Remove step">${ICONS.x}</button>
        </div>
      </div>
      ${s.photos.length ? `<div class="photo-grid">${s.photos.map((p, j) => `<div class="ph ${p.path ? '' : 'uploading'}"><img src="${esc(p.preview || '')}" alt=""><button type="button" data-rmsp="${i}:${j}" aria-label="Remove photo">${ICONS.x}</button></div>`).join('')}</div>` : ''}
      <div class="step-photo-btns">
        <label class="btn sm" for="st${i}-cam">${ICONS.camera} Photo<input id="st${i}-cam" data-sf="${i}" type="file" accept="image/*" capture="environment"></label>
        <label class="btn sm" for="st${i}-lib">${ICONS.image} Choose<input id="st${i}-lib" data-sf="${i}" type="file" accept="image/*" multiple></label>
      </div>
    </div>`).join('')
      || '<p class="hint" style="margin:0 0 10px">Break the job into steps, with a photo for any step that needs showing.</p>';
    stepsBox.querySelectorAll('[data-st]').forEach((ta) => ta.oninput = () => { steps[+ta.dataset.st].text = ta.value; });
    stepsBox.querySelectorAll('[data-mv]').forEach((b) => b.onclick = () => {
      const [i, d] = b.dataset.mv.split(':').map(Number);
      [steps[i], steps[i + d]] = [steps[i + d], steps[i]];
      drawSteps();
    });
    stepsBox.querySelectorAll('[data-rms]').forEach((b) => b.onclick = () => {
      const [s] = steps.splice(+b.dataset.rms, 1);
      s.photos.forEach((p) => p.path && removed.push(p.path));
      drawSteps();
    });
    stepsBox.querySelectorAll('[data-rmsp]').forEach((b) => b.onclick = () => {
      const [i, j] = b.dataset.rmsp.split(':').map(Number);
      const [p] = steps[i].photos.splice(j, 1);
      if (p.path) removed.push(p.path);
      drawSteps();
    });
    stepsBox.querySelectorAll('[data-sf]').forEach((inp) => inp.onchange = () => {
      const files = [...inp.files]; inp.value = '';
      addPhotos(files, steps[+inp.dataset.sf].photos, drawSteps);
    });
  };
  drawSteps();
  document.getElementById('add-step').onclick = () => {
    steps.push({ text: '', photos: [] }); drawSteps();
    stepsBox.querySelector(`[data-st="${steps.length - 1}"]`).focus();
  };

  // Save
  form.onsubmit = async (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    if (photos.some((p) => !p.path) || steps.some((s) => s.photos.some((p) => !p.path))) {
      return toast('Wait for photos to finish uploading');
    }
    const fd = new FormData(form);
    const kind = segVal.kind;
    const row = {
      title: fd.get('title').trim(),
      description: fd.get('description').trim(),
      category: segVal.category,
      kind,
      area: fd.get('area').trim(),
      priority: fd.get('priority'),
      assigned_to: fd.get('assigned_to') || null,
      repeat_every: kind === 'routine' ? Math.max(1, parseInt(fd.get('repeat_every'), 10) || 1) : null,
      repeat_unit: kind === 'routine' ? fd.get('repeat_unit') : null,
      items: items.map((x) => ({ name: (x.name || '').trim(), qty: (x.qty || '').trim() })).filter((x) => x.name),
      photos: photos.map((p) => p.path),
      steps: steps
        .map((s) => ({ text: s.text.trim(), photos: s.photos.map((p) => p.path) }))
        .filter((s) => s.text || s.photos.length),
      updated_at: new Date().toISOString(),
    };
    // The Active box is forced on (and hidden) wherever it doesn't apply, so it can be read as-is.
    row.is_active = !!fd.get('is_active');
    row.due_date = fd.get('due_date') || null;
    if (kind === 'routine') row.is_done = false;
    if (!id) row.created_by = state.me.id;
    const btn = document.getElementById('save');
    btn.disabled = true;
    const res = id ? await sb.from('tasks').update(row).eq('id', id).select().single()
                   : await sb.from('tasks').insert(row).select().single();
    if (res.error) { btn.disabled = false; return toast(friendlyError(res.error)); }
    if (removed.length) await sb.storage.from(BUCKET).remove(removed);
    toast(id ? 'Saved' : 'Task added');
    location.hash = `#/task/${res.data.id}`;
  };

  const del = document.getElementById('del');
  if (del) del.onclick = () => openSheet(`
    <h2>Delete this task?</h2><p class="sub">“${esc(t.title)}” and its history will be removed. This can’t be undone.</p>
    <div class="row"><button class="btn" id="no">Keep it</button><button class="btn danger" id="yes">Delete</button></div>`, (s) => {
    s.querySelector('#no').onclick = closeSheet;
    s.querySelector('#yes').onclick = async () => {
      const { error } = await sb.from('tasks').delete().eq('id', id);
      if (error) return toast(friendlyError(error));
      const allPhotos = [...t.photos, ...(t.steps || []).flatMap((s) => s.photos || [])];
      if (allPhotos.length) await sb.storage.from(BUCKET).remove(allPhotos);
      closeSheet(); toast('Deleted'); location.hash = '#/tasks';
    };
  });
}

// ======================================================================
// View: People (admin)
// ======================================================================
async function viewPeople(seq) {
  await loadPeople();
  if (seq !== renderSeq) return;
  const order = { pending: 0, admin: 1, member: 2, disabled: 3 };
  const people = [...state.people].sort((a, b) => order[a.role] - order[b.role] || (a.full_name || a.email).localeCompare(b.full_name || b.email));
  const pending = people.filter((p) => p.role === 'pending');
  const row = (p) => `<div class="person">
    <div class="avatar" style="cursor:default">${esc(initials(p))}</div>
    <div class="who"><b>${esc(p.full_name || '(no name)')}${p.id === state.me.id ? ' · you' : ''}</b><small>${esc(p.email)}</small></div>
    ${p.role === 'pending'
      ? `<button class="btn primary sm" data-approve="${p.id}">Approve</button>`
      : p.id === state.me.id ? '<span class="chip">Admin</span>'
      : `<select class="input" data-role="${p.id}">
          ${[['member', 'Member'], ['admin', 'Admin'], ['disabled', 'Switched off']].map(([v, l]) => `<option value="${v}" ${p.role === v ? 'selected' : ''}>${l}</option>`).join('')}
        </select>`}
  </div>`;
  shell({
    title: 'People', sub: `${people.filter((p) => p.role === 'admin' || p.role === 'member').length} active`, nav: 'people',
    body: `
      <div class="panel" style="margin-top:8px"><h3>Adding someone</h3>
        <p style="margin:0">Send them this link and ask them to tap <b>Create an account</b>. They’ll show up here to approve.</p>
        <div class="row" style="margin-top:12px"><input class="input" readonly value="${esc(location.origin + location.pathname)}" id="link"><button class="btn" id="copy" style="flex:0 0 auto">Copy</button></div>
      </div>
      ${pending.length ? `<div class="section-h"><h2>Waiting for approval</h2><span class="count">${pending.length}</span></div>` : ''}
      <div class="panel">${people.map(row).join('')}</div>
      <p class="hint" style="margin-top:4px">Members see tasks assigned to them or to “Anyone”. Admins see everything and can add, edit and assign tasks.</p>`,
  });
  document.getElementById('copy').onclick = async () => {
    try { await navigator.clipboard.writeText(document.getElementById('link').value); toast('Link copied'); }
    catch { document.getElementById('link').select(); }
  };
  const setRole = async (uid, role) => {
    const { error } = await sb.from('profiles').update({ role }).eq('id', uid);
    if (error) return toast(friendlyError(error));
    toast(role === 'member' ? 'Approved' : 'Updated');
    render();
  };
  $app.querySelectorAll('[data-approve]').forEach((b) => b.onclick = () => setRole(b.dataset.approve, 'member'));
  $app.querySelectorAll('[data-role]').forEach((s) => s.onchange = () => setRole(s.dataset.role, s.value));
}

// ======================================================================
// View: History
// ======================================================================
async function viewHistory(seq) {
  const { data, error } = await sb.from('completions').select('*, tasks(title, category)').order('completed_at', { ascending: false }).limit(100);
  if (error) throw error;
  if (seq !== renderSeq) return;
  const urls = await signedUrls(data.flatMap((c) => c.photos));
  const admin = isAdmin();
  shell({
    title: 'History', sub: admin ? 'Everything ticked off' : 'What you’ve ticked off', nav: 'history',
    body: data.length ? `<div class="panel" style="margin-top:8px">${data.map((c) => `
      <div class="hist">
        <div class="top"><b><a href="#/task/${c.task_id}" style="color:inherit;text-decoration:none">${esc(c.tasks?.title || 'Deleted task')}</a></b><small>${esc(fmtWhen(c.completed_at))}</small></div>
        <small>${esc(personName(c.completed_by))}${c.tasks ? ' · ' + CAT_LABEL[c.tasks.category] : ''}${c.was_due ? ' · was due ' + esc(fmtDate(c.was_due, { weekday: false })) : ''}</small>
        ${c.note ? `<p class="note">${esc(c.note)}</p>` : ''}
        ${c.photos.length ? `<div class="gallery">${c.photos.map((p) => `<button data-full="${esc(urls[p])}"><img src="${esc(urls[p])}" alt="" loading="lazy"></button>`).join('')}</div>` : ''}
        ${admin ? `<div style="margin-top:6px"><button class="linkish" data-undo="${c.id}" style="font-size:13px">Undo</button></div>` : ''}
      </div>`).join('')}</div>`
      : `<div class="empty" style="margin-top:16px"><b>Nothing yet</b>Completed tasks will show up here.</div>`,
  });
  $app.querySelectorAll('[data-full]').forEach((b) => b.onclick = () => openLightbox(b.dataset.full));
  $app.querySelectorAll('[data-undo]').forEach((b) => b.onclick = async () => {
    const { error: e2 } = await sb.rpc('undo_completion', { p_completion_id: b.dataset.undo });
    if (e2) return toast(friendlyError(e2));
    toast('Undone — task is back on the list'); render();
  });
}

// ======================================================================
// Boot
// ======================================================================
async function boot() {
  if (!configured) return render();
  // A password-reset email link lands here with type=recovery in the URL.
  if (/type=recovery/.test(location.hash + location.search)) state.authMode = 'recovery';
  const { data } = await sb.auth.getSession();
  state.session = data.session;
  if (state.session) { await loadMe().catch(() => {}); await loadPeople(); }
  sb.auth.onAuthStateChange(async (event, session) => {
    if (event === 'PASSWORD_RECOVERY') { state.session = session; state.authMode = 'recovery'; render(); return; }
    if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') { state.session = session; return; }
    const changedUser = session?.user?.id !== state.session?.user?.id;
    state.session = session;
    if (event === 'SIGNED_OUT') { state.me = null; state.people = []; state.authMode = 'login'; urlCache.clear(); render(); return; }
    if (changedUser) {
      state.me = null;
      setTimeout(async () => { await loadMe().catch(() => {}); await loadPeople(); if (state.authMode !== 'recovery') state.authMode = 'login'; render(); }, 0);
    }
  });
  render();
}
boot();
