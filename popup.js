/**
 * Microsoft Fast Login — Popup Script
 */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);

  const DEFAULT_PATTERNS = [
    'https://login.microsoftonline.com/*',
    'https://api-e4c9863e.duosecurity.com/*',
  ];

  const DEFAULTS = {
    email: '',
    password: '',
    retryLimit: 2,
    enabled: true,
    blockResources: true,
    skipLogoutPages: true,
    showIndicator: true,
    urlPatterns: [...DEFAULT_PATTERNS],
    actions: {
      accountTile: true,
      passwordPage: true,
      emailPasswordPage: true,
      mfaButton: true,
    },
  };

  let customPatterns = []; // patterns added by the user beyond the defaults

  // ── Load ───────────────────────────────────────────────────────────────────
  chrome.storage.local.get(['mflSettings'], (result) => {
    const s = Object.assign({}, DEFAULTS, result.mflSettings || {});
    s.actions = Object.assign({}, DEFAULTS.actions, s.actions || {});
    const allPatterns = (s.urlPatterns && s.urlPatterns.length)
      ? s.urlPatterns
      : [...DEFAULT_PATTERNS];

    $('emailInput').value     = s.email || '';
    $('passwordInput').value  = s.password || '';
    $('retryLimit').value     = s.retryLimit ?? 10;
    $('masterToggle').checked    = s.enabled !== false;
    $('blockResources').checked  = s.blockResources !== false;
    $('skipLogoutPages').checked = s.skipLogoutPages !== false;
    $('showIndicator').checked   = s.showIndicator !== false;
    setMasterLabel(s.enabled !== false);

    $('actionAccountTile').checked      = s.actions.accountTile !== false;
    $('actionPasswordPage').checked     = s.actions.passwordPage !== false;
    $('actionEmailPasswordPage').checked = s.actions.emailPasswordPage !== false;
    $('actionMfaButton').checked        = s.actions.mfaButton !== false;

    // Separate into defaults and custom
    customPatterns = allPatterns.filter((p) => !DEFAULT_PATTERNS.includes(p));
    renderUrlList();
  });

  // ── URL list rendering ─────────────────────────────────────────────────────
  function renderUrlList() {
    const list = $('urlList');
    list.innerHTML = '';

    // Default patterns (non-removable)
    for (const p of DEFAULT_PATTERNS) {
      const li = document.createElement('li');
      li.className = 'url-item';
      li.innerHTML = `
        <code title="${p}">${p}</code>
        <span class="badge">default</span>
      `;
      list.appendChild(li);
    }

    // Custom patterns (removable)
    for (let i = 0; i < customPatterns.length; i++) {
      const p = customPatterns[i];
      const li = document.createElement('li');
      li.className = 'url-item';
      li.innerHTML = `
        <code title="${p}">${p}</code>
        <span class="badge custom">custom</span>
        <button class="del-btn" data-idx="${i}" title="Remove">×</button>
      `;
      list.appendChild(li);
    }
  }

  $('urlList').addEventListener('click', (e) => {
    const btn = e.target.closest('.del-btn');
    if (!btn) return;
    const idx = parseInt(btn.dataset.idx, 10);
    customPatterns.splice(idx, 1);
    renderUrlList();
  });

  $('addUrlBtn').addEventListener('click', () => {
    const raw = $('urlInput').value.trim();
    if (!raw) return;

    // Basic validation
    if (!raw.startsWith('https://') && !raw.startsWith('http://')) {
      showStatus('Pattern must start with https:// or http://', 'err');
      return;
    }
    if (DEFAULT_PATTERNS.includes(raw) || customPatterns.includes(raw)) {
      showStatus('Pattern already in the list.', 'err');
      return;
    }

    customPatterns.push(raw);
    $('urlInput').value = '';
    renderUrlList();
  });

  // Allow pressing Enter in the URL input
  $('urlInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $('addUrlBtn').click();
  });

  // ── Master toggle ──────────────────────────────────────────────────────────
  function setMasterLabel(enabled) {
    $('masterLabel').textContent = enabled ? 'Enabled' : 'Disabled';
  }
  $('masterToggle').addEventListener('change', (e) => setMasterLabel(e.target.checked));

  // ── Show/hide password ─────────────────────────────────────────────────────
  $('togglePass').addEventListener('click', () => {
    const inp = $('passwordInput');
    const showing = inp.type === 'text';
    inp.type = showing ? 'password' : 'text';
    $('eyeIcon').textContent = showing ? '👁' : '🙈';
  });

  // ── Save ───────────────────────────────────────────────────────────────────
  $('saveBtn').addEventListener('click', () => {
    const email    = $('emailInput').value.trim();
    const password = $('passwordInput').value;
    const retryLimit = Math.max(1, Math.min(50, parseInt($('retryLimit').value, 10) || 2));

    if (!email) { showStatus('Please enter your email.', 'err'); return; }
    if (!password) { showStatus('Please enter your password.', 'err'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showStatus('Please enter a valid email address.', 'err');
      return;
    }

    const urlPatterns = [...DEFAULT_PATTERNS, ...customPatterns];

    const settings = {
      email,
      password,
      retryLimit,
      enabled:         $('masterToggle').checked,
      blockResources:  $('blockResources').checked,
      skipLogoutPages: $('skipLogoutPages').checked,
      showIndicator:   $('showIndicator').checked,
      urlPatterns,
      actions: {
        accountTile:       $('actionAccountTile').checked,
        passwordPage:      $('actionPasswordPage').checked,
        emailPasswordPage: $('actionEmailPasswordPage').checked,
        mfaButton:         $('actionMfaButton').checked,
      },
    };

    chrome.storage.local.set({ mflSettings: settings }, () => {
      if (chrome.runtime.lastError) {
        showStatus('Save failed: ' + chrome.runtime.lastError.message, 'err');
        return;
      }

      // Tell background to apply new URL patterns + blocking rules immediately
      chrome.runtime.sendMessage({ type: 'MFL_SETTINGS_CHANGED', settings }, (resp) => {
        if (chrome.runtime.lastError || (resp && !resp.ok)) {
          // Background may not respond on first install; settings are still saved
          console.warn('[MFL Popup] Background response:', chrome.runtime.lastError || resp?.error);
        }
        showStatus('Settings saved!', 'ok');
      });
    });
  });

  // ── Onboarding link ────────────────────────────────────────────────────────
  $('openOnboardingLink').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: chrome.runtime.getURL('onboarding.html') });
    // GitHub: https://github.com/EthanPany/MicrosoftFastLogin
  });

  // ── Status toast ───────────────────────────────────────────────────────────
  let toastTimer = null;
  function showStatus(msg, type) {
    const el = $('status');
    el.textContent = msg;
    el.className = 'status ' + type;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.className = 'status'; }, 3000);
  }
})();
