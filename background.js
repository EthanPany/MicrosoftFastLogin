/**
 * Microsoft Fast Login — Background Service Worker
 *
 * • Opens the onboarding page on first install
 * • Manages dynamic content script registration (custom URL patterns)
 * • Toggles declarativeNetRequest blocking ruleset
 */

const SCRIPT_ID = 'mfl-content';

const DEFAULT_PATTERNS = [
  'https://login.microsoftonline.com/*',
  'https://api-e4c9863e.duosecurity.com/*',
];

// ── First-install onboarding ─────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('onboarding.html') });
  }
});

// ── Register content scripts for the given URL patterns ─────────────────────
async function applyUrlPatterns(patterns) {
  const active = (patterns && patterns.length > 0) ? patterns : DEFAULT_PATTERNS;

  try {
    await chrome.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] });
  } catch (_) {}

  await chrome.scripting.registerContentScripts([{
    id: SCRIPT_ID,
    matches: active,
    js: ['content.js'],
    runAt: 'document_idle',
    allFrames: false,
    persistAcrossSessions: true,
  }]);

  console.log('[MFL] Scripts registered for:', active);
}

// ── Toggle resource blocking ruleset ────────────────────────────────────────
async function applyBlockingRules(enabled) {
  await chrome.declarativeNetRequest.updateEnabledRulesets({
    enableRulesetIds:  enabled ? ['block_overhead'] : [],
    disableRulesetIds: enabled ? [] : ['block_overhead'],
  });
  console.log('[MFL] Resource blocking:', enabled ? 'ON' : 'OFF');
}

// ── Init on service worker startup ──────────────────────────────────────────
chrome.storage.local.get(['mflSettings'], async (result) => {
  const s = result.mflSettings || {};
  await applyUrlPatterns(s.urlPatterns || DEFAULT_PATTERNS);
  await applyBlockingRules(s.blockResources !== false);
});

// ── Listen for settings changes from popup ───────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'MFL_SETTINGS_CHANGED') {
    Promise.all([
      applyUrlPatterns(msg.settings.urlPatterns || DEFAULT_PATTERNS),
      applyBlockingRules(msg.settings.blockResources !== false),
    ])
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ ok: false, error: e.message }));
    return true;
  }
});
