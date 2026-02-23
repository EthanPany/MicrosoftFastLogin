/**
 * Microsoft Fast Login — Content Script
 * Reads settings from chrome.storage.local and auto-fills login steps.
 */
(function () {
  'use strict';

  const LOG = (...args) => console.log('[MFL]', ...args);

  const DEFAULTS = {
    email: '',
    password: '',
    retryLimit: 10,
    enabled: true,
    actions: {
      accountTile: true,
      passwordPage: true,
      emailPasswordPage: true,
      mfaButton: true,
    },
  };

  let settings = null;
  let retryCount = 0;
  let acted = false;
  let observer = null;
  let pollInterval = null;

  // ── Load settings then start ───────────────────────────────────────────────
  chrome.storage.local.get(['mflSettings'], (result) => {
    settings = Object.assign({}, DEFAULTS, result.mflSettings || {});
    settings.actions = Object.assign({}, DEFAULTS.actions, settings.actions || {});

    if (!settings.enabled) {
      LOG('Disabled — exiting.');
      return;
    }
    if (!settings.email || !settings.password) {
      LOG('No credentials configured. Open the extension popup to set them.');
      return;
    }

    LOG(`Ready. Retry limit: ${settings.retryLimit} | URL: ${location.href}`);
    start();
  });

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

    pollInterval = setInterval(() => {
      acted = false;
      tryAction();
    }, 5000);
  }

  function attachObserver() {
    observer = new MutationObserver(() => setTimeout(tryAction, 500));
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function stop() {
    LOG(`Retry limit (${settings.retryLimit}) reached — stopping.`);
    if (observer) observer.disconnect();
    if (pollInterval) clearInterval(pollInterval);
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
          LOG('Account tile found — clicking.');
          act(() => tile.click());
          return;
        }
      }

      const passInput = document.querySelector('input[type="password"]');
      const emailInput = document.querySelector('input[type="email"]');
      const emailVisible = emailInput && emailInput.offsetParent !== null;
      const passVisible  = passInput  && passInput.offsetParent  !== null;

      // 2. Password-only page
      if (settings.actions.passwordPage && passVisible && !emailVisible) {
        LOG('Password-only page — filling.');
        act(() => {
          fillInput(passInput, settings.password);
          setTimeout(clickSignIn, 300);
        });
        return;
      }

      // 3. Email + password page
      if (settings.actions.emailPasswordPage && emailVisible) {
        LOG('Email+password page — filling.');
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
            LOG('MFA button found — clicking.');
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
    // Use native setter so React/Angular state management picks up the change
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
