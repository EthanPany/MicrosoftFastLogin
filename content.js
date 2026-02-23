/**
 * Microsoft Fast Login — Content Script
 *
 * Reads settings from chrome.storage.local and auto-fills login steps.
 * Detects and skips sign-out pages so automation never logs you out.
 * Injects a subtle on-page indicator when active (toggleable).
 */
(function () {
  'use strict';

  const LOG = (...args) => console.log('[MFL]', ...args);

  const DEFAULTS = {
    email: '',
    password: '',
    retryLimit: 10,
    enabled: true,
    skipLogoutPages: true,
    showIndicator: true,
    actions: {
      accountTile: true,
      passwordPage: true,
      emailPasswordPage: true,
      mfaButton: true,
    },
  };

  let settings   = null;
  let retryCount = 0;
  let acted      = false;
  let observer   = null;
  let pollTimer  = null;
  let indicator  = null;

  // ── Load settings ──────────────────────────────────────────────────────────
  chrome.storage.local.get(['mflSettings'], (result) => {
    settings = Object.assign({}, DEFAULTS, result.mflSettings || {});
    settings.actions = Object.assign({}, DEFAULTS.actions, settings.actions || {});

    if (!settings.enabled) { LOG('Disabled — exiting.'); return; }
    if (!settings.email || !settings.password) {
      LOG('No credentials. Open the extension popup to configure.');
      return;
    }

    // ── Logout page guard ──────────────────────────────────────────────────
    if (settings.skipLogoutPages && isLogoutPage()) {
      LOG('Sign-out page detected — staying silent.');
      return;
    }

    LOG(`Ready. Retry limit: ${settings.retryLimit}`);

    if (settings.showIndicator) injectIndicator();
    start();
  });

  // ── Logout detection ───────────────────────────────────────────────────────
  // Microsoft uses the same login.microsoftonline.com domain for both login and
  // logout flows. We detect the logout context by URL path and page content.
  function isLogoutPage() {
    const url = window.location.href.toLowerCase();

    // URL-based hints
    if (/logout|signout|sign[-_]?out/.test(url)) return true;

    // Page heading — checked immediately and also deferred in case of late render
    if (logoutHeadingPresent()) return true;

    return false;
  }

  function logoutHeadingPresent() {
    const LOGOUT_PHRASES = [
      'sign out', 'signed out', 'sign-out',
      'pick an account to sign out',
      'you signed out',
      'choose an account to sign out',
    ];
    const candidates = document.querySelectorAll(
      'h1, h2, h3, [role="heading"], .text-title, .sign-in-box-text'
    );
    for (const el of candidates) {
      const t = (el.innerText || '').toLowerCase();
      if (LOGOUT_PHRASES.some((p) => t.includes(p))) return true;
    }
    return false;
  }

  // ── On-page indicator ──────────────────────────────────────────────────────
  function injectIndicator() {
    if (indicator) return;
    indicator = document.createElement('div');
    indicator.id = 'mfl-indicator';
    Object.assign(indicator.style, {
      position:     'fixed',
      bottom:       '14px',
      right:        '14px',
      background:   'rgba(88, 101, 242, 0.93)',
      color:        '#fff',
      padding:      '6px 13px',
      borderRadius: '20px',
      fontFamily:   "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      fontSize:     '12px',
      fontWeight:   '600',
      letterSpacing:'.2px',
      zIndex:       '2147483647',
      display:      'flex',
      alignItems:   'center',
      gap:          '6px',
      boxShadow:    '0 2px 14px rgba(0,0,0,.45)',
      transition:   'opacity .4s',
      pointerEvents:'none',
      userSelect:   'none',
      lineHeight:   '1',
    });
    setIndicatorText('Active');
    // Wait for body to exist before appending
    const attach = () => {
      if (document.body) document.body.appendChild(indicator);
      else document.addEventListener('DOMContentLoaded', () => document.body.appendChild(indicator));
    };
    attach();
  }

  function setIndicatorText(msg) {
    if (!indicator) return;
    indicator.innerHTML = `⚡ Fast Login: ${msg}`;
  }

  function flashIndicator(msg, durationMs = 2000) {
    if (!indicator) return;
    setIndicatorText(msg);
    setTimeout(() => setIndicatorText('Active'), durationMs);
  }

  // ── Orchestration ──────────────────────────────────────────────────────────
  function start() {
    setTimeout(tryAction, 800);
    setTimeout(tryAction, 1800);
    setTimeout(tryAction, 3000);

    if (document.body) {
      attachObserver();
    } else {
      document.addEventListener('DOMContentLoaded', attachObserver);
    }

    pollTimer = setInterval(() => {
      // Re-check for logout page on every poll cycle (SPA navigation)
      if (settings.skipLogoutPages && (isLogoutPage() || logoutHeadingPresent())) {
        setIndicatorText('Paused — sign-out page');
        return;
      }
      setIndicatorText('Active');
      acted = false;
      tryAction();
    }, 5000);
  }

  function attachObserver() {
    observer = new MutationObserver(() => {
      if (settings.skipLogoutPages && logoutHeadingPresent()) {
        setIndicatorText('Paused — sign-out page');
        return;
      }
      setTimeout(tryAction, 500);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function stop() {
    LOG(`Retry limit (${settings.retryLimit}) reached — stopping.`);
    setIndicatorText('Limit reached');
    if (observer)   observer.disconnect();
    if (pollTimer)  clearInterval(pollTimer);
  }

  // ── Core action logic ──────────────────────────────────────────────────────
  function tryAction() {
    if (!settings) return;
    if (acted) return;
    if (retryCount >= settings.retryLimit) { stop(); return; }

    const hostname = window.location.hostname;

    if (hostname.includes('login.microsoftonline.com')) {
      // 1. Account-picker tile
      if (settings.actions.accountTile) {
        const tile = document.querySelector(`[data-test-id="${settings.email}"]`);
        if (tile) {
          LOG('Account tile — clicking.');
          flashIndicator('Selecting account…');
          act(() => tile.click());
          return;
        }
      }

      const passInput  = document.querySelector('input[type="password"]');
      const emailInput = document.querySelector('input[type="email"]');
      const emailVisible = emailInput && emailInput.offsetParent !== null;
      const passVisible  = passInput  && passInput.offsetParent  !== null;

      // 2. Password-only page
      if (settings.actions.passwordPage && passVisible && !emailVisible) {
        LOG('Password page — filling.');
        flashIndicator('Filling password…');
        act(() => {
          fillInput(passInput, settings.password);
          setTimeout(clickSignIn, 300);
        });
        return;
      }

      // 3. Email + password page
      if (settings.actions.emailPasswordPage && emailVisible) {
        LOG('Email + password page — filling.');
        flashIndicator('Filling credentials…');
        act(() => {
          fillInput(emailInput, settings.email);
          if (passVisible) fillInput(passInput, settings.password);
          setTimeout(clickSignIn, 300);
        });
        return;
      }

      // 4. MFA "Approve with MFA (Duo)" button
      if (settings.actions.mfaButton) {
        for (const btn of document.querySelectorAll('button, [role="button"]')) {
          if (btn.innerText && btn.innerText.includes('Approve with MFA')) {
            LOG('MFA button — clicking.');
            flashIndicator('Triggering MFA…');
            act(() => btn.click());
            return;
          }
        }
      }
    }

    // Duo domain — Touch ID / push appears automatically, nothing to click.
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  function act(fn) {
    acted = true;
    retryCount++;
    fn();
    setTimeout(() => { acted = false; }, 3000);
  }

  function fillInput(el, value) {
    el.focus();
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'value'
    ).set;
    nativeSetter.call(el, value);
    el.dispatchEvent(new Event('input',  { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function clickSignIn() {
    const submit = document.querySelector('input[type="submit"]');
    if (submit) { submit.click(); return; }

    for (const el of document.querySelectorAll('button, [role="button"], input[type="submit"]')) {
      if (el.innerText && el.innerText.trim().toLowerCase().includes('sign in')) {
        el.click();
        return;
      }
    }

    const form = document.querySelector('form');
    if (form) form.submit();
  }
})();
