// APIForge App Auth - Login/Register + Collection CRUD
// Communicates with Go backend at /auth/* and /api/*

const $ = (sel) => document.querySelector(sel);

const AUTH_STORAGE_KEY = 'apiforge-app-auth';
const API_BASE = ''; // Same origin (nginx proxies /auth and /api)

let appAuthState = {
  token: null,
  user: null,
};

// ─── API Client ──────────────────────────────────────────
async function apiFetch(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (appAuthState.token) {
    headers['Authorization'] = 'Bearer ' + appAuthState.token;
  }
  const resp = await fetch(API_BASE + path, { ...options, headers });
  const data = await resp.json().catch(() => null);
  return { status: resp.status, ok: resp.ok, data };
}

// ─── Auth State ──────────────────────────────────────────
function loadAuthState() {
  try {
    const saved = localStorage.getItem(AUTH_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      appAuthState.token = parsed.token;
      appAuthState.user = parsed.user;
    }
  } catch { /* ignore */ }
}

function saveAuthState() {
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({
    token: appAuthState.token,
    user: appAuthState.user,
  }));
}

function clearAuthState() {
  appAuthState.token = null;
  appAuthState.user = null;
  localStorage.removeItem(AUTH_STORAGE_KEY);
}

// ─── UI Updates ──────────────────────────────────────────
function updateAuthUI() {
  const loggedOut = $('#app-auth-logged-out');
  const loggedIn = $('#app-auth-logged-in');
  const username = $('#app-username');

  if (appAuthState.user) {
    loggedOut.classList.add('hidden');
    loggedIn.classList.remove('hidden');
    username.textContent = appAuthState.user.username;
    const avatar = $('#app-user-avatar');
    if (avatar) avatar.textContent = appAuthState.user.username[0].toUpperCase();
  } else {
    loggedOut.classList.remove('hidden');
    loggedIn.classList.add('hidden');
    username.textContent = '';
  }

  // Dispatch event for other modules
  window.dispatchEvent(new CustomEvent('apiforge:auth-changed', {
    detail: { user: appAuthState.user, token: appAuthState.token },
  }));
}

// ─── Modal ───────────────────────────────────────────────
let modalMode = 'login'; // 'login' or 'register'

function openAuthModal(mode) {
  modalMode = mode;
  const modal = $('#auth-modal');
  $('#auth-modal-title').textContent = mode === 'login' ? 'Login' : 'Register';
  $('#auth-modal-submit').textContent = mode === 'login' ? 'Login' : 'Register';
  $('#auth-modal-username').value = '';
  $('#auth-modal-password').value = '';
  $('#auth-modal-error').style.display = 'none';
  modal.showModal();
}

function closeAuthModal() {
  $('#auth-modal').close();
}

async function handleAuthSubmit(e) {
  e.preventDefault();
  const username = $('#auth-modal-username').value.trim();
  const password = $('#auth-modal-password').value;
  const errorEl = $('#auth-modal-error');

  if (!username || !password) {
    errorEl.textContent = 'Username and password are required';
    errorEl.style.display = 'block';
    return;
  }

  if (modalMode === 'register' && password.length < 6) {
    errorEl.textContent = 'Password must be at least 6 characters';
    errorEl.style.display = 'block';
    return;
  }

  const endpoint = modalMode === 'login' ? '/auth/login' : '/auth/register';
  const submitBtn = $('#auth-modal-submit');
  submitBtn.disabled = true;
  submitBtn.textContent = modalMode === 'login' ? 'Logging in...' : 'Registering...';

  try {
    const { status, ok, data } = await apiFetch(endpoint, {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });

    if (ok && data?.token) {
      appAuthState.token = data.token;
      appAuthState.user = data.user;
      saveAuthState();
      updateAuthUI();
      closeAuthModal();
      loadSavedCollections();
    } else {
      errorEl.textContent = data?.error || 'Authentication failed';
      errorEl.style.display = 'block';
    }
  } catch (err) {
    errorEl.textContent = 'Connection error: ' + err.message;
    errorEl.style.display = 'block';
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = modalMode === 'login' ? 'Login' : 'Register';
  }
}

function handleLogout() {
  clearAuthState();
  updateAuthUI();
  renderSavedCollections([]);
}

// ─── Collection CRUD ─────────────────────────────────────
async function saveCollection() {
  if (!appAuthState.token) {
    alert('Please login first');
    return;
  }

  // Get current spec from app state
  const spec = window.appState?.spec;
  if (!spec) {
    alert('No spec loaded. Import an OpenAPI spec first.');
    return;
  }

  const name = spec.info?.title || 'Untitled';
  const { ok, data } = await apiFetch('/api/collections', {
    method: 'POST',
    body: JSON.stringify({ name, spec: JSON.stringify(spec) }),
  });

  if (ok) {
    const btn = $('#save-collection-btn');
    btn.textContent = 'Saved!';
    setTimeout(() => { btn.textContent = 'Save'; }, 1000);
    loadSavedCollections();
  } else {
    alert('Failed to save: ' + (data?.error || 'unknown error'));
  }
}

async function deleteCollection(id) {
  if (!appAuthState.token) return;
  const { ok } = await apiFetch('/api/collections/' + id, { method: 'DELETE' });
  if (ok) {
    loadSavedCollections();
  }
}

async function loadSavedCollections() {
  if (!appAuthState.token) return;
  const { ok, data } = await apiFetch('/api/collections');
  if (ok && Array.isArray(data)) {
    renderSavedCollections(data);
  }
}

function renderSavedCollections(collections) {
  const container = $('#saved-collections-list');
  if (!container) return;

  if (!collections || collections.length === 0) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = '<div style="font-size:11px;color:var(--text-secondary);margin-bottom:4px;">Saved Collections</div>';
  collections.forEach((col) => {
    const item = document.createElement('div');
    item.className = 'sidebar-item';
    item.dataset.testid = 'saved-collection-' + col.id;
    item.style.cssText = 'font-size:12px;padding:6px 8px;display:flex;align-items:center;justify-content:space-between;';
    item.innerHTML =
      '<span class="saved-collection-name" style="cursor:pointer;flex:1;">' + escapeHtml(col.name) + '</span>' +
      '<button class="btn btn-secondary saved-collection-share" data-id="' + col.id + '" style="font-size:10px;padding:2px 6px;" title="Share">Share</button>' +
      '<button class="btn btn-secondary saved-collection-delete" data-id="' + col.id + '" style="font-size:10px;padding:2px 6px;color:var(--error);">x</button>';

    // Click name to load
    item.querySelector('.saved-collection-name').addEventListener('click', async () => {
      const detail = await apiFetch('/api/collections/' + col.id);
      if (detail.ok && detail.data?.spec) {
        try {
          const spec = JSON.parse(detail.data.spec);
          if (window.loadSpec) window.loadSpec(spec);
        } catch { /* ignore parse error */ }
      }
    });

    // Click share to create share link
    item.querySelector('.saved-collection-share').addEventListener('click', async (e) => {
      e.stopPropagation();
      const btn = e.target;
      btn.disabled = true;
      btn.textContent = '...';
      const { ok, data } = await apiFetch('/api/collections/' + col.id + '/share', { method: 'POST' });
      if (ok && data?.url) {
        const fullUrl = window.location.origin + data.url;
        await navigator.clipboard.writeText(fullUrl).catch(() => {});
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = 'Share'; btn.disabled = false; }, 2000);
      } else {
        btn.textContent = 'Error';
        setTimeout(() => { btn.textContent = 'Share'; btn.disabled = false; }, 2000);
      }
    });

    // Click x to delete
    item.querySelector('.saved-collection-delete').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteCollection(col.id);
    });

    container.appendChild(item);
  });
}

// ─── Expose state for other modules ──────────────────────
window.appAuthState = appAuthState;

// ─── Config: show/hide Register based on server config ───
async function loadRegistrationConfig() {
  try {
    const resp = await fetch('/config');
    if (resp.ok) {
      const config = await resp.json();
      if (config.allowRegistration) {
        const regBtn = $('#app-register-btn');
        if (regBtn) regBtn.classList.remove('hidden');
      }
    }
  } catch { /* server may not support /config yet */ }
}

// ─── Init ────────────────────────────────────────────────
function initAppAuth() {
  loadAuthState();
  updateAuthUI();
  loadRegistrationConfig();

  // Modal events
  $('#app-login-btn')?.addEventListener('click', () => openAuthModal('login'));
  $('#app-register-btn')?.addEventListener('click', () => openAuthModal('register'));
  $('#auth-modal-cancel')?.addEventListener('click', closeAuthModal);
  $('#auth-modal-form')?.addEventListener('submit', handleAuthSubmit);
  $('#app-logout-btn')?.addEventListener('click', handleLogout);

  // Collection CRUD
  $('#save-collection-btn')?.addEventListener('click', saveCollection);
  $('#delete-collection-btn')?.addEventListener('click', () => {
    // Delete the first/active collection from server (simple approach)
    const firstItem = document.querySelector('[data-testid^="saved-collection-"] .saved-collection-delete');
    if (firstItem) {
      deleteCollection(firstItem.dataset.id);
    }
  });

  // Load saved collections if logged in
  if (appAuthState.token) {
    loadSavedCollections();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAppAuth);
} else {
  initAppAuth();
}
