// APIForge App Auth - Login/Register + Collection CRUD
// Communicates with Go backend at /auth/* and /api/*

const $ = (sel) => document.querySelector(sel);

const AUTH_STORAGE_KEY = 'apiforge-app-auth';
const SERVER_URL_KEY = 'apiforge-server-url';

function getApiBase() {
  return localStorage.getItem(SERVER_URL_KEY) || '';
}

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
  const resp = await fetch(getApiBase() + path, { ...options, headers });
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
  $('#auth-modal-server').value = localStorage.getItem(SERVER_URL_KEY) || '';
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

  // Save server URL
  const serverUrl = ($('#auth-modal-server')?.value || '').trim().replace(/\/+$/, '');
  localStorage.setItem(SERVER_URL_KEY, serverUrl);

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
    const resp = await fetch(getApiBase() + '/config');
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

// ─── Onboarding Flow ─────────────────────────────────────
function hideOnboarding() {
  const overlay = document.getElementById('onboarding-overlay');
  if (overlay) overlay.style.display = 'none';
}

function showOnboardingError(stepId, msg) {
  const el = document.getElementById(stepId);
  if (el) {
    el.textContent = msg;
    el.style.display = 'block';
  }
}

function showOnboardingStep(step) {
  ['onboarding-step-server', 'onboarding-step-setup', 'onboarding-step-login'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = id === step ? '' : 'none';
  });
}

function initOnboarding() {
  const serverUrl = localStorage.getItem(SERVER_URL_KEY);
  let authData = null;
  try {
    authData = JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY));
  } catch { /* ignore */ }

  // If already have server URL and a token, skip onboarding
  if (serverUrl && authData && authData.token) {
    hideOnboarding();
    return;
  }

  // Skip onboarding in dev/test mode or when programmatically requested
  if (window.__skipOnboarding || window.location.port === '3001') {
    hideOnboarding();
    return;
  }

  // Connect button
  const connectBtn = document.getElementById('onboarding-connect-btn');
  if (connectBtn) {
    connectBtn.addEventListener('click', async () => {
      const urlInput = document.getElementById('onboarding-server-url');
      const serverUrl = (urlInput?.value || '').trim().replace(/\/+$/, '');
      const errorId = 'onboarding-server-error';

      if (!serverUrl) {
        showOnboardingError(errorId, 'Please enter a server URL');
        return;
      }

      connectBtn.disabled = true;
      connectBtn.textContent = 'Connecting...';
      document.getElementById(errorId).style.display = 'none';

      try {
        const resp = await fetch(serverUrl + '/health');
        const data = await resp.json();

        localStorage.setItem(SERVER_URL_KEY, serverUrl);

        if (data.initialized === false) {
          showOnboardingStep('onboarding-step-setup');
        } else {
          showOnboardingStep('onboarding-step-login');
        }
      } catch (err) {
        showOnboardingError(errorId, 'Cannot connect to server: ' + err.message);
      } finally {
        connectBtn.disabled = false;
        connectBtn.textContent = 'Connect';
      }
    });
  }

  // Setup button (create admin)
  const setupBtn = document.getElementById('onboarding-setup-btn');
  if (setupBtn) {
    setupBtn.addEventListener('click', async () => {
      const username = (document.getElementById('onboarding-admin-username')?.value || '').trim();
      const password = document.getElementById('onboarding-admin-password')?.value || '';
      const errorId = 'onboarding-setup-error';

      if (!username || !password) {
        showOnboardingError(errorId, 'Username and password are required');
        return;
      }
      if (password.length < 6) {
        showOnboardingError(errorId, 'Password must be at least 6 characters');
        return;
      }

      setupBtn.disabled = true;
      setupBtn.textContent = 'Creating...';
      document.getElementById(errorId).style.display = 'none';

      try {
        const serverUrl = localStorage.getItem(SERVER_URL_KEY);
        const resp = await fetch(serverUrl + '/auth/setup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
        });
        const data = await resp.json();

        if (resp.ok && data.token) {
          appAuthState.token = data.token;
          appAuthState.user = data.user;
          saveAuthState();
          updateAuthUI();
          hideOnboarding();
          loadSavedCollections();
        } else {
          showOnboardingError(errorId, data?.error || 'Setup failed');
        }
      } catch (err) {
        showOnboardingError(errorId, 'Connection error: ' + err.message);
      } finally {
        setupBtn.disabled = false;
        setupBtn.textContent = 'Create Admin & Login';
      }
    });
  }

  // Login button
  const loginBtn = document.getElementById('onboarding-login-btn');
  if (loginBtn) {
    loginBtn.addEventListener('click', async () => {
      const username = (document.getElementById('onboarding-username')?.value || '').trim();
      const password = document.getElementById('onboarding-password')?.value || '';
      const errorId = 'onboarding-login-error';

      if (!username || !password) {
        showOnboardingError(errorId, 'Username and password are required');
        return;
      }

      loginBtn.disabled = true;
      loginBtn.textContent = 'Logging in...';
      document.getElementById(errorId).style.display = 'none';

      try {
        const serverUrl = localStorage.getItem(SERVER_URL_KEY);
        const resp = await fetch(serverUrl + '/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
        });
        const data = await resp.json();

        if (resp.ok && data.token) {
          appAuthState.token = data.token;
          appAuthState.user = data.user;
          saveAuthState();
          updateAuthUI();
          hideOnboarding();
          loadSavedCollections();
        } else {
          showOnboardingError(errorId, data?.error || 'Login failed');
        }
      } catch (err) {
        showOnboardingError(errorId, 'Connection error: ' + err.message);
      } finally {
        loginBtn.disabled = false;
        loginBtn.textContent = 'Login';
      }
    });
  }

  // Skip button
  const skipBtn = document.getElementById('onboarding-skip-btn');
  if (skipBtn) {
    skipBtn.addEventListener('click', () => {
      hideOnboarding();
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { initAppAuth(); initOnboarding(); });
} else {
  initAppAuth();
  initOnboarding();
}
