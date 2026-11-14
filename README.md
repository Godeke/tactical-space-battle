# Vector Fleet

An independent browser game about commanding small fleets through continuous 3D space. Players prepare private orders, commit simultaneously, and watch 30 simulated seconds of Newtonian flight and combat. Play solo against AI or host a multiplayer operation with spectators.

**[Read the design document](docs/DESIGN.md)** for the new focus: original ship systems, model-based weapon mounts and obstruction, and physically consistent propulsion, rotation, energy and heat. The imported playable baseline still uses simplified firing cones, spherical colliders and abstract damage. Model-based arcs are the next implementation milestone, not a feature claimed by this extraction.

The core-combat target also requires guided missiles, decoys, electronic warfare/counter-countermeasures, and full pitch/yaw/roll control. These are not implemented yet. See the **[feature-parity inventory](docs/FEATURE-PARITY.md)** for what exists today, what replaces the tabletop abstractions, and the completion gate.

## Run locally

Use Node 24.19 or newer with native TypeScript support and npm 12.0.2 or newer. The tested development version is recorded in `.node-version`.

```powershell
npm.cmd ci
npm.cmd run build
npm.cmd start
```

Open **http://127.0.0.1:3100** and choose **Launch solo skirmish**. On macOS/Linux use `npm` instead of `npm.cmd`. `npm run vector` is also available. No other repository, account database or service is needed for practice.

Select a ship, choose a maneuver, set a destination and arrival velocity, then preview the achievable trajectory. Y is height. Zero arrival velocity requests a stop; moving arrivals complete into coasting within the documented controller tolerance. Ships retain momentum, take time to rotate and brake, and spend finite propellant. Orders persist between commitments. The flight manual includes a walkthrough. Playback controls do not change resolved results.

The baseline includes three original procedural ship designs, beams, ballistic rounds, point defense, directional armor, abstract system damage, energy/heat management, formation orders, private forecasts and replay. It remains an experimental tactical model with initial balance and AI.

## Standalone accounts and multiplayer

Accounts belong to this project. Set an account-file path outside source control and provision users from a trusted terminal:

```powershell
$env:VECTOR_AUTH_FILE = 'D:/vector-private/accounts.json'
npm.cmd run account:add -- captain
npm.cmd run account:add -- opponent
npm.cmd start
```

The provisioning command prompts for a hidden password (at least 12 characters); automation may pass a password on stdin. Never pass a password as a command argument. Passwords are stored as salted scrypt hashes. There is no public signup endpoint. Accounts are loaded at server startup, so restart after adding users. Existing usernames cannot be overwritten by this command. Automated password recovery and in-app account administration are not provided in this baseline.

Sign in, host a multiplayer operation, and add an existing username as opponent or spectator. Invitees refresh their lobby to see it. Independent session cookies and CSRF tokens are used. Sessions expire after 24 hours or a server restart; saved games remain available after signing in again. No accounts, credentials, cookies or database schema are shared with AVT.

## Hosting and saves

| Variable | Purpose |
|---|---|
| `VECTOR_PORT` | Listening port, default `3100` |
| `VECTOR_HOST` | Listening IPv4 address, default `127.0.0.1` |
| `VECTOR_ORIGIN` | Canonical browser origin matching the port |
| `VECTOR_AUTH_FILE` | Standalone account file; unset means local solo practice |
| `VECTOR_DATA_DIR` | Save directory, default repository `output/vector-games` |
| `VECTOR_TLS_CERT`, `VECTOR_TLS_KEY` | TLS certificate and key for HTTPS hosting |

Remote binding requires authenticated HTTPS, a matching origin and certificate files. HTTP and unauthenticated practice are restricted to loopback. The server reads process environment variables, not `.env` files automatically. No hosted deployment is performed by this migration.

Run one server per save directory. Game files pin engine/content versions and atomically save commitments, state and replay inputs. The process lock prevents two writers; normal shutdown releases it. A stale lock is recovered only after its recorded process has exited. Back up the save directory and account file together. Do not commit either.

Existing local practice games may be copied manually into a dedicated new save directory while both servers are stopped; retain the originals until checked. Authenticated games reference old account IDs, so importing them requires a deliberate account-ID mapping. This migration transfers source only, with no production game or credential migration.

## Develop and verify

```powershell
npm.cmd run check
npm.cmd run test:browser
```

`check` builds, typechecks and runs simulation, persistence, HTTP, and real standalone-authentication tests. Browser tests cover a complete solo battle, planning, saves, restart, replay, numeric input, compact layouts, two players and a spectator. They use Edge on Windows and Playwright Chromium elsewhere; install Chromium with `npx playwright install chromium`, or set `VECTOR_BROWSER_CHANNEL` explicitly. Artifacts are stored under ignored `output/`.

Source layout: `core/` owns simulation/content/contracts, `client/` owns React/Three.js presentation, `server/` owns HTTP/accounts/persistence, and `test/` contains checks. Simulation is independent of the renderer. Forecasts and authoritative execution share the same controller; enemy private plans are never used in previews.

See [migration provenance](docs/MIGRATION.md) for the extraction boundaries and [design milestones](docs/DESIGN.md#7-delivery-order-and-decisions) for the next work. Performance, balance, accessibility and real-host multiplayer still require acceptance on the intended hardware and installation.
