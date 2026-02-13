# Flagged

Chrome extension that shows you where X/Twitter accounts are actually from and lets you filter your timeline by country.

## What it does

**Flag display** — Every account on your timeline gets a country flag badge next to their name, pulled from X's own "account based in" data. Hover for the full country name. Now you always know who you're talking to.

**Post filtering** — Pick the countries you don't want to see. Posts from those accounts get blurred out (with a reveal button) or fully hidden from your timeline. Works on tweets and user cells everywhere on X.

## Modes

- **Blocklist** — hide/blur posts from countries you specify (default)
- **Allowlist** — only show posts from countries you specify, hide everything else
- **Flag only** — just show the flags, don't hide anything

## How it works

Flagged uses X's internal `AboutAccountQuery` GraphQL endpoint to look up where each account is registered. Results get cached locally in IndexedDB so the same account never needs to be fetched twice. The extension is rate-limit aware and backs off automatically when X pushes back.

Everything runs locally. No external servers, no analytics, no data leaves your browser.

## Install

1. Clone or download this repo
2. Go to `chrome://extensions`
3. Enable "Developer mode"
4. Click "Load unpacked" and select this folder
5. Open X and watch the flags appear
6. (optional) Check https://t.me/pillgatess for updated databases.

## Settings

Click the extension icon to access:

- **Filter mode** — blocklist, allowlist, or flag only
- **Locations** — countries to filter (names, ISO codes, or flag emojis all work)
- **Hide mode** — blur with reveal vs. fully remove
- **Whitelist/Blacklist** — per-handle overrides
- **Database** — export, import, merge, or clear your local cache

## Permissions

- `storage` — saving your settings
- `host_permissions` on `x.com` / `twitter.com` — reading the timeline and querying account data
