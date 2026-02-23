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
    retryLimit: 2,
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
  let lastAction = null; // track which step fired last
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

    if (settings.skipLogoutPages && isLogoutPage()) {
      LOG('Sign-out page detected — staying silent.');
      return;
    }

    LOG(`Ready. Retry limit: ${settings.retryLimit}`);
    if (settings.showIndicator) injectIndicator();
    start();
  });

  // ── Logout detection ───────────────────────────────────────────────────────
  function isLogoutPage() {
    const url = window.location.href.toLowerCase();
    if (/logout|signout|sign[-_]?out/.test(url)) return true;
    return logoutHeadingPresent();
  }

  function logoutHeadingPresent() {
    const LOGOUT_PHRASES = [
      'sign out', 'signed out', 'sign-out',
      'pick an account to sign out',
      'you signed out',
      'choose an account to sign out',
    ];
    for (const el of document.querySelectorAll('h1, h2, h3, [role="heading"], .text-title')) {
      const t = (el.innerText || '').toLowerCase();
      if (LOGOUT_PHRASES.some((p) => t.includes(p))) return true;
    }
    return false;
  }

  // ── On-page indicator ──────────────────────────────────────────────────────
  function injectIndicator() {
    if (indicator || !document.body) return;
    indicator = document.createElement('div');
    indicator.id = 'mfl-indicator';
    Object.assign(indicator.style, {
      position:      'fixed',
      bottom:        '14px',
      right:         '14px',
      background:    'rgba(88, 101, 242, 0.93)',
      color:         '#fff',
      padding:       '6px 13px',
      borderRadius:  '20px',
      fontFamily:    "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      fontSize:      '12px',
      fontWeight:    '600',
      letterSpacing: '.2px',
      zIndex:        '2147483647',
      display:       'flex',
      alignItems:    'center',
      gap:           '6px',
      boxShadow:     '0 2px 14px rgba(0,0,0,.45)',
      transition:    'opacity .4s',
      pointerEvents: 'none',
      userSelect:    'none',
      lineHeight:    '1',
    });
    setIndicatorText('Active');
    document.body.appendChild(indicator);
  }

  function ensureIndicator() {
    if (!settings || !settings.showIndicator) return;
    if (!indicator) injectIndicator();
  }

  function setIndicatorText(msg) {
    if (!indicator) return;
    const iconUrl = chrome.runtime.getURL('icons/icon16.png');
    indicator.innerHTML = `<img src="${iconUrl}" style="width:14px;height:14px;vertical-align:middle;margin-right:4px;"> Fast Login: ${msg}`;
  }

  function flashIndicator(msg, durationMs = 1500) {
    ensureIndicator();
    setIndicatorText(msg);
    setTimeout(() => setIndicatorText('Active'), durationMs);
  }

  // ── Orchestration ──────────────────────────────────────────────────────────
  function start() {
    // Fire quickly — first attempt at 150ms so we catch pages that load fast
    setTimeout(tryAction, 150);
    setTimeout(tryAction, 500);
    setTimeout(tryAction, 1200);

    if (document.body) {
      attachObserver();
    } else {
      document.addEventListener('DOMContentLoaded', attachObserver);
    }

    pollTimer = setInterval(() => {
      if (settings.skipLogoutPages && (isLogoutPage() || logoutHeadingPresent())) {
        setIndicatorText('Paused — sign-out page');
        return;
      }
      setIndicatorText('Active');
      acted = false;
      tryAction();
    }, 3000);
  }

  function attachObserver() {
    observer = new MutationObserver(() => {
      // If we just submitted an email form, eagerly unblock `acted` as
      // soon as the password field appears (SPA transition happened)
      if (acted && lastAction === 'email') {
        const passNowVisible = visibleInput('password');
        const emailGone = !visibleInput('email');
        if (passNowVisible && emailGone) {
          LOG('SPA transition detected — unblocking for password page.');
          acted = false;
        }
      }

      if (settings.skipLogoutPages && logoutHeadingPresent()) {
        setIndicatorText('Paused — sign-out page');
        return;
      }
      setTimeout(tryAction, 150);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function stop() {
    LOG(`Retry limit (${settings.retryLimit}) reached — stopping.`);
    setIndicatorText('Done');
    if (observer)  observer.disconnect();
    if (pollTimer) clearInterval(pollTimer);
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
          act('tile', () => tile.click());
          return;
        }
      }

      const emailVisible = visibleInput('email');
      const passVisible  = visibleInput('password');

      // 2. Password-only page
      if (settings.actions.passwordPage && passVisible && !emailVisible) {
        LOG('Password page — filling.');
        flashIndicator('Filling password…');
        act('password', () => {
          fillInput(passVisible, settings.password);
          setTimeout(clickSignIn, 100);
        });
        return;
      }

      // 3. Email + password page
      if (settings.actions.emailPasswordPage && emailVisible) {
        LOG('Email + password page — filling.');
        flashIndicator('Filling credentials…');
        act('email', () => {
          fillInput(emailVisible, settings.email);
          if (passVisible) {
            fillInput(passVisible, settings.password);
            setTimeout(clickSignIn, 100);
          } else {
            // Email-only field — submit and wait for password page
            setTimeout(clickSignIn, 100);
          }
        });
        return;
      }

      // 4. MFA "Approve with MFA (Duo)" button
      if (settings.actions.mfaButton) {
        for (const btn of document.querySelectorAll('button, [role="button"]')) {
          if (btn.innerText && btn.innerText.includes('Approve with MFA')) {
            LOG('MFA button — clicking.');
            flashIndicator('Triggering MFA…');
            act('mfa', () => btn.click());
            return;
          }
        }
      }
    }

    // Duo domain — Touch ID / push appears automatically, nothing to click.
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  function visibleInput(type) {
    const el = document.querySelector(`input[type="${type}"]`);
    return el && el.offsetParent !== null ? el : null;
  }

  function act(actionName, fn) {
    acted = true;
    // Each distinct step (tile → email → password → mfa) gets its own retry window.
    // Only increment and check the counter when we're retrying the SAME step.
    if (lastAction !== actionName) retryCount = 0;
    lastAction = actionName;
    retryCount++;
    fn();
    // Short lock — clears quickly so the next page step can be handled fast
    setTimeout(() => { acted = false; }, 600);
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
