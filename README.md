# Flagged

Free Chrome extension that displays country flags next to X/Twitter usernames and lets you filter your timeline by account location.

## What it does

**Flag display** — Every account on your timeline gets a country flag badge next to their name, pulled from X's own "account based in" data. Hover for the full country name. Now you always know who you're talking to.

**Post filtering** — Pick the countries you don't want to see. Posts from those accounts get blurred out (with a reveal button) or fully hidden from your timeline. Works on tweets and user cells everywhere on X.

## Modes

- **Blocklist** — hide/blur posts from countries you specify (default)
- **Allowlist** — only show posts from countries you specify, hide everything else
- **Flag only** — just show the flags, don't hide anything

## How it works

Flagged uses X's internal `AboutAccountQuery` GraphQL endpoint to look up where each account is registered. Results get cached locally in IndexedDB — no hard limit on account capacity — so the same account never needs to be fetched twice. The extension is rate-limit aware and backs off automatically when X pushes back.

Everything runs locally. No external servers, no analytics, no data leaves your browser.

## Install

1. Install from the Chrome Web Store (no signup required), or load unpacked from this repo
2. Optionally import a pre-loaded database from https://t.me/pillgatesflagged to start filtering immediately
3. Open X and watch the flags appear

## Settings

Click the extension icon to access:

- **Filter mode** — blocklist, allowlist, or flag only
- **Locations** — countries to filter (names, ISO codes, flag emojis, or continents all work)
- **Hide mode** — blur with reveal vs. fully remove
- **Whitelist/Blacklist** — per-handle overrides
- **Database** — export, import, merge, or clear your local cache

## Permissions

- `storage` — saving your settings
- `host_permissions` on `x.com` / `twitter.com` — reading the timeline and querying account data
