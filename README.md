# Vegas Octopus V2

An independent, immersive sci-fi trading visualization for iPad and desktop.

## Current build

- Three.js WebGL scene with a glowing neural core, eight animated tentacles, orbital rings, and a 1,450-particle field.
- Pointer interaction, responsive layout, sci-fi HUD, agent panels, market watch, signal queue, and integration status.
- Static single-page app; no local build step required. Three.js is loaded from jsDelivr CDN.
- Designed as a **display layer only**. It does not place orders or modify Vegas Signal System rules.

## Data integrity

The current UI intentionally shows no fabricated market prices, account balances, or Vegas signals. The market feed, signal feed, and funds/account adapters are not connected yet. Status labels explicitly indicate this. Do not treat the animated visual core as a live data connection.

Next integration phase should connect approved read-only data sources through a separate adapter layer. Do not place API secrets or account credentials in client-side HTML/JavaScript.

## Run

Open `index.html` in a modern browser with internet access. WebGL and access to the Three.js CDN are required.

## Repository boundaries

This repository is separate from the Vegas Signal System. It contains no order-execution logic and must not change the trading rules or notification behavior of that system.
