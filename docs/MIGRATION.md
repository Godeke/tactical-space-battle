# Vector Fleet extraction

Date: 14 November 2026.

Source: `Godeke/avt`, working-copy subtree `apps/vector/`, with repository HEAD `a62d5754270ca3beab5732a01386fd7a3179b321`. The subtree was untracked in that working copy, so that HEAD alone does not reconstruct it. `source-manifest.json` records the SHA-256 hash of each imported source file before extraction changes, including the numeric-input fixes present at migration time.

Destination: `Godeke/tactical-space-battle`, initially empty, with the application at the repository root. Product name remains Vector Fleet.

## Transferred

- Core simulation, ship content, state/order types and math.
- React/Three.js client, styling and build configuration.
- Game storage, command routes and process lifecycle.
- Simulation/store/HTTP/browser tests, including existing input-editing fixes.

## Independence changes

- Removed `@avt/storage` and all cross-repository imports.
- Replaced the imported AVT account/HTTP adapter with project-owned account provisioning, salted password hashing, bounded sessions, CSRF validation and rate-limited login.
- Replaced AVT hosting configuration and database variables with the `VECTOR_*` interface. No PostgreSQL dependency is required.
- Changed account cookies and the CSRF header to the `vector` namespace. Stable game API paths remain `/vector/api`.
- Relocated save/test output beneath this repository and declared browser-test dependencies directly.
- Added standalone install/build/check scripts, CI and the design baseline.

No books, extracted charts, source artwork, AVT ship data, repository history, live saves, certificates, credentials or account database were copied. No license grant for third-party material is implied. Historical inspiration is recorded without carrying over a compatibility obligation.

The migration keeps the existing simulation/content version because game physics and content are unchanged by extraction. Authentication sessions are intentionally independent and end on restart. Old authenticated saves need an explicit account-ID migration; copying them alone does not transfer control to newly provisioned users.

After the standalone build and tests pass and the destination is published, the AVT working copy removes the extracted application and its workspace dependency, leaving a README link to the new repository. Existing unrelated edits in the AVT working copy are preserved. AVT's own GitHub branch is not changed by this migration unless separately committed and pushed.

The new design document describes planned physical/model systems explicitly. Extraction itself does not replace the existing spherical colliders, generic firing cone, abstract damage, or thermal model.

## Verification on 14 November 2026

- Installed dependencies from this repository's own manifest and lockfile.
- `npm run check`: build, typecheck, and 22 tests passed, including real standalone account hashing, login, CSRF, logout and hosting validation.
- `npm run test:browser`: both Edge journeys passed, including a complete solo game, save/restart, signed numeric input, and separate multiplayer/spectator browser contexts.
- Checked executable source/manifests for AVT imports, cookie names, database configuration and absolute links to the old checkout; none remain.
- The simulation/content files are unchanged from the captured source. Physics and model-based-system changes remain future versioned work.

Browser multiplayer uses deterministic test identities; real standalone account transport is exercised by the HTTP tests. Remote TLS deployment, production operations and the future model-based systems are not claimed as verified by these checks.
