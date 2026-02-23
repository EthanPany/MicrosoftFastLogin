/**
 * Microsoft Fast Login — Background Service Worker
 *
 * Manages dynamic content script registration so URL patterns
 * configured in the popup take effect immediately without reloading the extension.
 */

const SCRIPT_ID = 'mfl-content';

const DEFAULT_PATTERNS = [
  'https://login.microsoftonline.com/*',
  'https://api-e4c9863e.duosecurity.com/*',
];

// ── Register content scripts for the given URL patterns ─────────────────────
async function applyUrlPatterns(patterns) {
  const active = (patterns && patterns.length > 0) ? patterns : DEFAULT_PATTERNS;

  // Remove existing dynamic registration (ignore errors if not registered yet)
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

  console.log('[MFL Background] Content scripts registered for:', active);
}

// ── Toggle declarativeNetRequest ruleset on/off ──────────────────────────────
async function applyBlockingRules(enabled) {
  await chrome.declarativeNetRequest.updateEnabledRulesets({
    enableRulesetIds:  enabled ? ['block_overhead'] : [],
    disableRulesetIds: enabled ? [] : ['block_overhead'],
  });
  console.log('[MFL Background] Resource blocking:', enabled ? 'ON' : 'OFF');
}

// ── Init on service worker startup ──────────────────────────────────────────
chrome.storage.local.get(['mflSettings'], async (result) => {
  const s = result.mflSettings || {};
  await applyUrlPatterns(s.urlPatterns || DEFAULT_PATTERNS);
  await applyBlockingRules(s.blockResources !== false); // default ON
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
    return true; // keep channel open for async response
  }
});
