# ⚡ Microsoft Fast Login

A Chrome extension that automates the Microsoft + Duo MFA login flow — built out of frustration with NYU Brightspace logging you out every hour.

---

## The problem

Every time I opened NYU Brightspace, I got kicked back to the Microsoft login page. Pick your account. Type your password. Wait for a Duo push notification. Approve it. Sometimes get redirected again. Finally get to the dashboard — only to be logged out twenty minutes later.

Four clicks minimum. Fifteen seconds, multiple times a day.

**Microsoft Fast Login handles all of it automatically.**

---

## Features

| | |
|---|---|
| 👆 **Account tile** | Auto-clicks your account from the Microsoft account picker |
| 🔑 **Password page** | Detects and fills the password field, then submits |
| 📧 **Email + password** | Handles the full login form when both fields appear |
| 🛡️ **Duo MFA** | Clicks "Approve with MFA" so the push fires instantly |
| 🚫 **Logout protection** | Detects sign-out pages and stays silent — never logs you out |
| ⚡ **Resource blocking** | Strips Microsoft telemetry, Bing analytics, and CDN images to speed up the login page |
| 🌐 **Custom URL patterns** | Add any Microsoft SSO domain — works beyond just `login.microsoftonline.com` |
| 👁 **On-page indicator** | A subtle badge shows what step is running (toggleable) |

---

## Installation

> Requires Chrome (or any Chromium-based browser). Not available on the Chrome Web Store — load it manually.

1. **Download** — Clone or download this repo as a ZIP and unzip it
   ```
   git clone https://github.com/EthanPany/MicrosoftFastLogin.git
   ```

2. **Open extensions** — Go to `chrome://extensions/` in your browser

3. **Enable Developer mode** — Toggle it on in the top-right corner

4. **Load unpacked** — Click **Load unpacked** and select the `MicrosoftFastLogin` folder

5. **Pin it** — Click the puzzle icon in Chrome's toolbar → pin **Microsoft Fast Login** so the ⚡ icon is always accessible

---

## Setup

1. Click the **⚡ icon** in your toolbar
2. Enter your **Microsoft email** (e.g. `netid@nyu.edu`) and **password**
3. Click **Save Settings**

That's it. Visit any Microsoft login page and watch it go.

---

## Configuration

All settings are in the popup (click ⚡ in your toolbar).

### Credentials
- **Email** and **Password** — stored locally via `chrome.storage.local`, never transmitted

### Automation Steps
Each step can be toggled on or off independently:
- Click account tile
- Fill password page
- Fill email + password page
- Click "Approve with MFA"

### Safety
- **Skip sign-out pages** — detects Microsoft logout flows by URL and heading text, and disables automation so you're never accidentally signed out

### Performance
- **Block tracking & overhead** — uses `declarativeNetRequest` to drop telemetry and CDN image requests on login pages, reducing load time
- **Retry limit** — max attempts per step before giving up (default: 2)

### Display
- **On-page indicator** — toggle the `⚡ Fast Login: Active` badge that appears on login pages
- **View setup guide** — reopens the onboarding page

### URL Patterns
The extension activates on these domains by default:
```
https://login.microsoftonline.com/*
https://*.duosecurity.com/*
```
You can add custom patterns (e.g. your org's ADFS server) directly in the popup.

---

## How it works

The content script runs on configured Microsoft login URLs and detects which step of the login flow is currently showing:

1. **Account picker** — looks for `[data-test-id="your@email.com"]` and clicks it
2. **Password page** — detects a visible password input with no visible email input, fills it, submits
3. **Email + password page** — detects both fields visible, fills both, submits
4. **MFA prompt** — scans for a button containing "Approve with MFA" and clicks it

A `MutationObserver` watches for SPA transitions (the Microsoft login flow is a single-page app). When the email page transitions to the password page, the observer detects the DOM change and immediately triggers the next step — no polling delay.

Resource blocking is handled by a static `declarativeNetRequest` ruleset scoped to `login.microsoftonline.com` as the initiator, so it has no effect on other browsing.

---

## Security

- Credentials are stored in `chrome.storage.local` — isolated to the extension, inaccessible to web pages
- No data is ever sent to any external server
- The extension only activates on URLs you configure
- **Do not use on shared or untrusted computers**

---

## Compatibility

Works with any Microsoft / Azure AD login flow, including:

- NYU Brightspace, NYU Home, NYU VPN portal
- Microsoft 365 and Azure AD org accounts
- Microsoft personal accounts
- Any custom SSO that routes through `login.microsoftonline.com`
- Duo Security MFA (push notification flow)

---

## License

MIT — do whatever you want with it.
