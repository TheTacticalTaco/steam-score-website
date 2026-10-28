# Steam Score

A responsive website that calculates a custom gamer score from Steam achievement rarity.

## Requirements
- Node.js 18 or newer
- A Steam Web API key: https://steamcommunity.com/dev/apikey

## Run locally
1. Unzip the project and open a terminal in the project folder.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy `.env.example` to `.env` and put your Steam API key in it.
4. Set the environment variable before starting the server. Node does not load `.env` automatically unless you add a dotenv package, so the simplest options are:
   - macOS/Linux: `export STEAM_API_KEY="your_key_here" && npm start`
   - Windows PowerShell: `$env:STEAM_API_KEY="your_key_here"; npm start`
5. Open http://localhost:3000

## Scoring
- 50%+ unlocked globally: 5 points
- 40–49.99%: 10 points
- 30–39.99%: 15 points
- 15–29.99%: 20 points
- 10–14.99%: 25 points
- 5–9.99%: 30 points
- 1–4.99%: 35 points
- Under 1%: 50 points
- All achievements unlocked in a game: +100 bonus points

An achievement without an available Steam global rarity percentage is shown as "rarity unavailable" and does not add points. The site scans games for which Steam exposes achievement stats; some games won't return stats, and private game details prevent a full library scan.

## Deployment notes
Deploy the Node app to a host that supports Node.js and set `STEAM_API_KEY` as a secret environment variable. Do not put your API key in frontend code or commit it to a public repository. Steam API limits and availability may affect large libraries. For a production public launch, add caching, request throttling, and background jobs to avoid large synchronous scans.
