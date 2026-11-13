// Daybook on claude.ai: keeps everything in this page's private database for your
// account (data/users/<you>/daybook), with a copy in this browser so it opens instantly.
window.DAYBOOK_HOST = (() => {
  const KEYS = ['daybook:v1', 'daybook:prefs'];
  const LOCAL = (k) => 'daybook-page:' + k;
  const mem = new Map();
  const ls = (() => { try { return window.localStorage; } catch { return null; } })();
  try { for (const k of [...KEYS, 'daybook:v1:backup', 'daybook:changedAt']) { const v = ls?.getItem(LOCAL(k)); if (v != null) mem.set(k, v); } } catch { /* no local copy */ }

  let changeListeners = [];
  let statusListeners = [];
  let ref = null;
  let state = 'connecting'; // connecting | saved | saving | local | error
  let errorText = '';
  let timer = null;
  let writing = false;
  let again = false;
  let localChangedAt = Number(mem.get('daybook:changedAt') || 0);
  let cloudSeenAt = 0;

  const setState = (s, text = '') => { state = s; errorText = text; statusListeners.forEach((f) => f()); };
  const keep = (k, v) => { try { ls?.setItem(LOCAL(k), v); } catch { /* storage full or blocked */ } };

  const storage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem(k, v) {
      v = String(v);
      mem.set(k, v);
      keep(k, v);
      if (KEYS.includes(k)) {
        localChangedAt = Date.now();
        mem.set('daybook:changedAt', String(localChangedAt));
        keep('daybook:changedAt', String(localChangedAt));
        scheduleSave();
      }
    },
    removeItem(k) { mem.delete(k); try { ls?.removeItem(LOCAL(k)); } catch { /* ignore */ } },
  };

  function scheduleSave() {
    if (!ref) return;
    clearTimeout(timer);
    timer = setTimeout(save, 700);
  }

  async function save() {
    if (!ref) return;
    if (writing) { again = true; return; }
    writing = true;
    setState('saving');
    const body = { data: mem.get('daybook:v1') ?? null, prefs: mem.get('daybook:prefs') ?? null, savedAt: localChangedAt || Date.now() };
    try {
      await ref.set(body);
      cloudSeenAt = Math.max(cloudSeenAt, body.savedAt);
      setState('saved');
    } catch (err) {
      const code = err?.code;
      if (code === 'invalid_argument' && JSON.stringify(body).length > 250000) setState('error', 'Too much to save online. Archive or delete old completed tasks.');
      else if (code === 'invalid_argument' || code === 'not_granted' || code === 'revoked') { ref = null; setState('local'); }
      else if (code === 'quota_exceeded') setState('error', 'Online storage is full. Download a backup and delete old items.');
      else { setState('error', "Couldn't save online just now. It will try again with your next change."); }
    } finally {
      writing = false;
      if (again) { again = false; scheduleSave(); }
    }
  }

  function applyCloud(body) {
    if (!body || typeof body.savedAt !== 'number') return;
    if (body.savedAt <= cloudSeenAt) return;
    cloudSeenAt = body.savedAt;
    if (body.savedAt <= localChangedAt) return; // this browser has newer changes; they'll be saved
    for (const [k, v] of [['daybook:v1', body.data], ['daybook:prefs', body.prefs]]) {
      if (typeof v === 'string') { mem.set(k, v); keep(k, v); }
    }
    localChangedAt = body.savedAt;
    mem.set('daybook:changedAt', String(localChangedAt));
    keep('daybook:changedAt', String(localChangedAt));
    changeListeners.forEach((f) => f());
  }

  (async () => {
    const claude = window.claude;
    if (!claude?.use) { setState('local'); return; }
    const [db, user] = await Promise.all([claude.use('db'), claude.use('user')]);
    const id = user ? await user.id() : null;
    if (!db || !id) { setState('local'); return; }
    try { ref = db.doc('data/users/' + id + '/daybook'); } catch { setState('local'); return; }
    let loaded = false;
    const slow = setTimeout(() => { if (!loaded) setState('error', "Can't reach online storage yet. Changes are kept in this browser for now."); }, 10000);
    ref.onSnapshot((snap) => {
      if (snap.metadata.hasPendingWrites) return;
      if (!snap.metadata.fromCache && !loaded) { loaded = true; clearTimeout(slow); if (state === 'connecting' || state === 'error') setState('saved'); }
      if (!snap.exists) { if (mem.has('daybook:v1') || mem.has('daybook:prefs')) scheduleSave(); return; }
      applyCloud(snap.data());
    }, () => { clearTimeout(slow); ref = null; setState('local'); });
  })();

  return {
    storage,
    noServiceWorker: true,
    noSystemNotifications: true,
    installText: '<p>In Chrome, open the <b>⋮</b> menu → <b>Cast, save and share</b> → <b>Install page as app</b> (or <b>Create shortcut</b> and tick <b>Open as window</b>). Daybook then opens in its own window with a Dock icon. Everything saves to your Claude account, so it\'s the same on any computer you sign in on.</p>',
    statusText() {
      return { connecting: 'Connecting…', saved: 'Saved to your account', saving: 'Saving…', local: 'Saved in this browser only', error: errorText }[state];
    },
    onChange(f) { changeListeners.push(f); },
    onStatus(f) { statusListeners.push(f); },
    async saveFile(filename, text) {
      const d = await window.claude?.use?.('downloads');
      if (!d) throw { message: 'Saving files is not available here.' };
      return d.save({ filename, data: text });
    },
  };
})();
