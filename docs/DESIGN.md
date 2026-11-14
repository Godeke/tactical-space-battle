# Vector Fleet — tactical space battle

Design baseline: 14 November 2026. Home: [Godeke/tactical-space-battle](https://github.com/Godeke/tactical-space-battle).

## 1. Direction

Vector Fleet is an original browser-based space combat game about commanding a small fleet through continuous three-dimensional space. Its central decisions are where a ship will be, how it will be moving, which surfaces it exposes, and which weapons can physically reach a target. The computer handles the bookkeeping and numerical integration; the player sees trajectories, firing opportunities, resource consequences, and uncertainty.

Keep the current simultaneous planning structure: each player controls three ships, prepares private standing orders, and commits to 30 simulated seconds of execution. Unlimited planning time and freely controlled playback make tactical judgment more important than reflexes. Solo AI, two-player skirmishes, spectators, saves, and recovery remain first-class capabilities.

This repository is the independent home of the game. AVT provided the starting context, but compatibility with its rules, ship sheets, tables, vocabulary, and outcomes is not a requirement. There is no AVID, hex grid, discrete facing window, remainder chart, ghost choice, or player-resolved geometric ambiguity in the new rules. We author our own ship designs, weapon systems, damage models, and balance data.

**Physics is a constraint on the design.** Convenience should come from controls, automation, prediction and presentation. It must not quietly grant free acceleration, instantaneous attitude changes, unlimited power, or momentum-free weapon launches. Where we simplify physics, identify the approximation, its valid scale, and the test that keeps it honest.

The intended scope preserves the inspiration's breadth of tactical decisions. Beams, kinetic weapons, **guided missiles, countermeasures, electronic counter-countermeasures, and complete three-axis attitude control are required core combat capabilities**. Their tabletop procedures are replaced by continuous geometry, physical state and automation. A beam/kinetic skirmish is an incremental prototype, not the finished combat scope. See the [feature-parity inventory](FEATURE-PARITY.md) for current implementation status and the completion gate.

## 2. What exists, and what this document changes

This migration preserves the playable prototype. The following distinctions prevent design intentions from being mistaken for implemented features.

| Area | Migrated playable baseline | Intended next system |
|---|---|---|
| Flight | Continuous position/velocity; quaternion facing; capped angular motion; fuel-dependent mass | Explicit thruster forces, lever arms, inertia, and angular momentum |
| Weapon coverage | One ship-centered forward cone and a tracking-rate check | Individually placed fixed/gimballed mounts with joint limits and hull obstruction |
| Ship geometry | Enlarged procedural display models; spherical collision hulls | Reviewed model-aligned collision geometry, armor surfaces, hardpoints and internal volumes |
| Damage | Scalar hull plus four abstract system conditions | Hit-point/direction/material-dependent armor and spatial component damage |
| Energy/heat | MJ storage, regeneration, normalized heat, fixed cooling | Auditable power and thermal-energy budgets, temperature limits, radiator behavior |
| Weapons | Authored beam falloff, ballistic rounds, automatic defense | Per-mount beam/kinetic/defense models with recoil and geometry-derived opportunities |
| Information | Exact visible enemy motion; private plans and internal state | Core seeker/contact and electronic-warfare model; detailed fleet sensor fog is a later module |
| Hosting | Standalone accounts and game saves in this repository | Keep service boundaries independent of gameplay; no shared AVT account database |

The inherited numbers are **prototype balance values**, not a validated spacecraft technology model. Migration does not implement the model-based systems below or certify the existing thrust, reactor, radiator and weapon budgets as mutually consistent. Model-based mounts are the next gameplay milestone.

## 3. Command experience

Players issue intent: coast, reach a location with a requested velocity, match another ship's velocity, maintain a formation offset, orient toward a direction/target, and select firing priorities. Orders persist until replaced, completed, or made invalid by damage or destruction. Guidance computes bounded controls; it never edits position or velocity directly.

Flight planning must show an achievable trajectory, time to rotate, braking distance, expected propellant expenditure and arrival error. A formation is a set of independently flown trajectories. Ships can fail to hold formation when their capabilities differ. Formation slots and warnings help the player avoid collisions; they do not grant collision immunity.

The battlefield is the primary interface. Select a ship or a mount to see its physical field of fire, target line, tracking motion, obstruction and predicted firing windows. Use a timeline to explore how rotation and relative motion change the solution. Show short reasons such as “hull blocks this mount,” “traverse limit,” “tracking cannot keep up,” or “insufficient stored energy.” Every displayed reason must come from the same evaluator used by the server.

Provide world and ship-relative reference axes, velocity arrows, closest approach, relative speed, and numeric entry alongside pointing controls. A reference plane is a navigation aid, not a movement surface. Avoid forcing a common plane on the engagement. Keep keyboard access, readable status summaries, stable camera/selection and reduced-motion playback.

Enemy forecasts extrapolate available observations. They must never execute private enemy plans to improve the displayed forecast. Keep predicted and resolved paths visually distinct. A 30-second commitment is a command interval; combat events still occur throughout it, rather than waiting for its end.

## 4. Ship models define tactical geometry

### One coordinated asset definition

Use a ship-local, right-handed coordinate system in metres: +Z is the nose, +Y the dorsal direction, and +X the lateral axis. Quaternions map ship-local coordinates into the inertial battle frame. Joint angles and angular rates use radians in simulation; degrees are a presentation choice. The asset root is a fixed authored reference point. Store the center of mass separately, since propellant use or damage may move it.

Each versioned ship definition binds:

- A render model, initially glTF/GLB, with stable named nodes and reviewed units/transforms.
- Simplified collision geometry aligned with that model, composed of convex hulls or other explicitly supported primitives. Use multiple pieces for concave hulls so a broad bounding shape does not close intended firing gaps.
- Armor surfaces with material, thickness and component association; internal component volumes for engines, stores, weapons, power and cooling.
- Mass properties, propellant stores, thruster positions/directions, and weapon hardpoints.
- A geometry/content version and hashes of the compiled simulation asset and render asset.

The render mesh alone cannot establish a weapon's mechanical range of motion or material properties. Those are authored metadata. A build-time asset compiler validates model-node references, units, scales, transforms, collision volumes and mount definitions, then emits renderer-independent simulation data. The browser and server consume the same compiled geometry. Cosmetic LOD or camera zoom must not change a hit or firing permission.

The existing enlarged ship meshes are a prototype concession. As precise geometry arrives, render physical hulls at true scale and use enlarged selection markers, outlines and labels for readability. Never enlarge the simulation collider to make distant ships easier to click.

### Weapon mount definition

The first mount schema needs stable identity, parent model node, base transform, muzzle transform, joint hierarchy, traverse limits, angular speed/acceleration limits, weapon reference, and relevant damage state. Fixed mounts have no moving joints. A two-axis turret has separate yaw and elevation axes; more complex mechanisms can follow after this model is proven.

Do not replace every mount with a generic cone. A dorsal turret may have broad azimuth travel but a restricted depression angle. An aft battery may have a narrow mechanical range but a clear line behind the engine structure. A forward fixed gun depends on hull attitude. Author each of those deliberately.

At a simulation time, firing eligibility follows this sequence:

1. Transform target position, relative velocity, and the predicted intercept into the mount's local frame.
2. Solve the mount's required joint angles using its authored axes and limits. Respect traverse direction, wraparound and mechanical stops; do not choose an unreachable equivalent angle.
3. Advance the joints under their current speed, acceleration and damage constraints. A geometrically reachable bearing may still be temporarily untrackable.
4. Cast from the actual muzzle along the current firing solution against the owning hull, its appendages and other ships. Account for the moving turret geometry. Use a scale-aware muzzle-origin tolerance, not a blanket exclusion of the firing ship.
5. Evaluate energy, thermal state, ammunition, pulse timing, and target authorization. Fire only when all conditions agree.

A model-derived arc is therefore a **reachable and unobstructed region**, which may change as a turret, radiator or other articulated part moves. The UI can sample this region for visualization, but its displayed polygon is never the authoritative firing test. Server-side joint solving and obstruction tests remain authoritative.

The first demonstrator is one original hull with three deliberately different hardpoints: a fixed forward gun, a dorsal turret obstructed by an aft structure, and an aft defense mount. Use procedural geometry initially to prove the behavior before investing in final art.

## 5. Physical model

### Translation, propulsion and mass

Use SI units internally and double-precision state. In a gravity-free local inertial frame, acceleration comes from the sum of actual external forces divided by instantaneous mass. A ship without thrust coasts. There is no aerodynamic drag, global speed cap masquerading as physics, or automatic turn toward velocity.

For a thruster with effective exhaust velocity `ve`, use `massFlow = thrust / ve`, with propellant exhaustion resolved inside the integration interval. `ve` includes the intended pressure-thrust approximation. Test a straight burn against `deltaV = ve * ln(initialMass / finalMass)` under the corresponding ideal assumptions. These relations provide propulsion consistency; they do not establish a plausible engine power source by themselves. [NASA thrust equations](https://www.grc.nasa.gov/WWW/BGH/rktthsum.html), [NASA ideal rocket equation](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/ideal-rocket-equation/).

Separate reaction mass, stored chemical/other energy, and electrical power when the selected propulsion model requires it. An electric drive cannot draw a small reactor's output while silently delivering arbitrarily large exhaust kinetic power. The initial technology budget must state thrust, exhaust velocity, energy source, efficiency, waste heat, dry mass and propellant together. Treat speculative technology as explicit authored assumptions.

### Attitude and angular momentum

Represent angular momentum and an inertia tensor in a documented frame. A thruster away from the center of mass produces torque `r × F` as well as translation. Integrate rigid-body rotation, including the gyroscopic term when working in body coordinates. Reaction control expends propellant; stabilizing a spin requires torque. Coasting rotation does not decay for free.

The flight controller can choose thruster allocations to satisfy player intent subject to those limits. Initially use rigid hulls and authored mass distributions; recompute approved mass/inertia contributions as propellant and ammunition are consumed. Defer structural flex and complex slosh. Update momentum consistently when mass leaves the ship; do not simply change inertia and invent energy.

Full orientation control includes pitch, yaw and **roll about the nose**, plus attitude-hold and persistent-spin intent. A nose direction alone does not specify roll. Orders must be able to specify a complete attitude or nose direction plus a dorsal reference, with singularities handled internally. Roll must matter through the physical placement of mounts, armor and vulnerable components. The existing nose-only facing controls do not meet this requirement. Maneuvering, rolling to present a surface and holding a weapon on target all compete for actual control authority.

### Kinetics, beams and defense

Kinetic projectiles inherit the muzzle's world velocity, including `angularVelocity × muzzleOffset`, plus their launch velocity. Apply equal-and-opposite launch impulse to the ship and the associated off-axis torque. Resolve time of flight, moving targets, intervening geometry and friendly fire. Use relative impact velocity for energy and momentum. Swept collision detection is required so a fast round cannot pass through a hull between ticks.

Beam damage should depend on delivered energy, dwell time, spot area/divergence, incidence and material response, with engineering limits on pulse power and heat. The inherited range-damage formula is a placeholder. For the first local-arena model, instantaneous beam propagation is acceptable only when `range / c` is well below the timing-error budget; document that bound. Do not present large-scale or relativistic engagements as supported by this approximation.

Point defense uses ordinary physical mounts, tracking and energy/ammunition constraints. It selects threats and intercept opportunities automatically, but the defense does not receive a guaranteed kill merely because a projectile enters an abstract radius. Escorts can defend friendly ships when their actual geometry, observations and resources permit it.

### Guided missiles and countermeasures — required core combat

Missiles are physical vehicles with position, velocity, attitude, remaining propellant, thrust limits, guidance state and an authored warhead. Launch velocity includes the launching mount's motion; subsequent turns require acceleration. Support launch, powered flight, coasting, target acquisition, terminal guidance, loss/reacquisition of track, interception and impact. A missile can exhaust its maneuver budget and miss even when it still knows where its target is. Launch envelopes should communicate this distinction to the player.

Guidance must consume observations through a seeker interface rather than reading the target's true state directly. Each seeker defines a sensing channel, field of regard, tracking limits, update timing and discrimination capability. Implement a bounded, explainable contact model sufficient for acquisition, decoy rejection, jamming and reacquisition. Whole-fleet fog of war need not precede this: exact public ship motion can remain a clearly labeled information mode, while missiles still have their own limited observations.

Countermeasures include expendable decoys and electronic interference matched to those sensing channels. A decoy has a trajectory, signature, lifetime and inventory cost; it does not inherit an enemy missile's target-lock state. A jammer has geometry, power requirements, emissions and effects on measurements/track quality. Counter-countermeasures improve discrimination or tracking under explicit limits. A missile seeker must not receive a hidden “real ship versus decoy” flag. Do not make every countermeasure work on every weapon type or turn jamming into a universal damage-reduction percentage.

Distinguish physical destruction by point defense, misleading or degrading guidance, and maneuvering beyond a missile's reachable intercept. These mechanisms can reinforce one another, but each needs its own observable explanation. Uncertainty may be modeled with seeded randomness, recorded for replay; any probability must arise from the documented sensing/engagement model rather than a generic countermeasure success roll.

Players set launch intent, salvo coordination, target priorities, defensive reserve, expendable-use policy and emission policy during planning. Onboard systems react throughout the 30-second interval using the same information available to that side. A threat discovered during execution must not wait until the next planning boundary for an already-authorized defense. Defensive policies have inventories, budgets and thresholds; they do not reveal hidden enemy plans or guarantee survival.

The core-combat acceptance scenario must demonstrate a guided intercept, a maneuver-induced miss, a decoy-induced track transfer, a seeker resisting a decoy, jamming and reacquisition, physical interception, and a coordinated salvo challenging finite escort capacity. All outcomes need inspectable timelines and saved-game replay. More elaborate missile buses, specialist warheads and detailed sensor propagation can follow this complete basic engagement loop.

### Damage, energy and heat

Resolve entry point, surface normal and direction against physical collision/armor geometry. Use material and thickness to determine an explicitly approximate penetration/damage result, then intersect internal component volumes where appropriate. Avoid claiming that kinetic energy alone accurately predicts hypervelocity penetration. Start with documented empirical coefficients and test their monotonic behavior. No printed hit-location or hull-face table is required.

Track energy in joules internally and display convenient units. Reactor/generator output, stores, weapon draws, propulsion loads, electronics, losses and heat rejection must balance. Track thermal energy and temperature using declared heat capacities. In vacuum, external cooling is radiative; a later radiator model should use area, emissivity, absolute temperature and environmental exposure rather than a fixed “cooling points” deduction. A first lumped thermal model may use `P = emissivity * sigma * area * (T^4 - backgroundT^4)` under its stated view-factor/environment assumptions. [NASA Passive Thermal Control Engineering Guidebook, radiation section](https://ntrs.nasa.gov/api/citations/20220006584/downloads/NASAPassiveThermalGuidebookv5%201Public.pdf).

Damage can sever capacity or create leaks. Those consequences change the same propulsion/power/thermal model used by forecasts; they must not be disconnected cosmetic status effects. Defer detailed fragmentation clouds, crew casualties, repair parties and fluid dynamics until their tactical value justifies them.

### Scope of realism

The first scenario remains a short-duration local engagement in a gravity-free inertial frame with nonrelativistic velocities. Gravity is deliberately omitted, not canceled by unexplained hovering. Orbital scenarios require a separate versioned gravity model, consistent frames, and orbital validation before introduction. Detailed multispectral fleet sensor simulation, light-time communication, relativity, plasma/exhaust interactions and detailed thermochemistry are deferred. Basic missile seekers, decoys, jamming and counter-countermeasures are required core systems. Exact public enemy motion in the initial information mode is a gameplay assumption, not a claim about real sensors or an entitlement for missile guidance to read hidden ground truth.

Use floating origins for rendering only; shifting a camera origin must not change authoritative world state. Validate content/scenarios against the supported numerical range and speed regime rather than silently clamping ship motion.

## 6. Simulation, authoring and validation

Keep a pure simulation core independent of Three.js, browser frame rate, persistence and account management. The server owns results. The browser uses public state and owner-authorized data for forecasts and smooth rendering. Replays pin engine, content, geometry versions and all necessary inputs. Never silently reinterpret an old save under a new mount or physics model.

The inherited 20 Hz step is the initial integration baseline, not a physical event schedule. Refine or split steps around propellant exhaustion, impacts, joint stops and other relevant events. Simultaneous effects must be resolved without a side advantage caused by array order. Rendering can interpolate state but cannot decide hits. Use stable ordering and replay tests on supported runtimes; do not promise bit-identical cross-platform floating-point results without evidence.

Required acceptance evidence for the next milestones:

- **Geometry:** rotating the entire engagement preserves eligibility; fixed and gimballed mounts differ correctly; pitch poles, yaw wrap, grazing rays, self-obstruction, muzzle placement and moving appendages have explicit tests. Changing visual LOD does not change outcomes.
- **Flight:** analytical drift and rocket-equation burns; exhausted fuel; torque-free motion; lever-arm torque; off-axis recoil; moving formation leaders; convergence when the timestep is halved.
- **Conservation:** linear/angular momentum for isolated interactions and an explicit energy/heat budget, including ejected propellant/projectiles. Model dissipation where energy is intentionally lost from useful motion.
- **Impacts:** fast moving target/projectile crossings, simultaneous impacts, grazing contact, material/thickness trends and component hits. No tunneling or frame-rate-dependent damage.
- **Missile engagements:** finite acceleration/propellant, seeker field of regard and track loss, decoy discrimination, channel-specific jamming/counter-countermeasures, interceptable missiles, coordinated salvos and limited escort defenses. A shared observer interface prevents seekers or AI from using hidden truth.
- **Attitude:** explicit roll changes available mounts and exposed surfaces without changing linear velocity for free; attitude hold and spin use finite torque/propellant. Full-attitude orders remain well-defined at nose-direction poles.
- **Experience:** a player can explain a blocked shot by selecting its mount, inspect a future firing opportunity, plan braking and compare exposed hull surfaces without a reference chart.
- **Authority:** private plans cannot affect enemy forecasts; AI has no hidden-state advantage; commitment retries, restarts, spectator views and pinned replay remain correct.
- **Performance:** retain the six-ship/200-projectile benchmark; profile model queries and batch broad-phase tests. Target smooth 60 fps rendering and under two seconds per committed interval on a documented test machine, with recorded distributions rather than a single optimistic sample.

## 7. Delivery order and decisions

1. **Independent foundation — this migration.** Standalone installation, accounts, saves, test suite and this design baseline. Preserve existing flight/combat behavior and clearly label its approximations.
2. **Model-based mounts and full attitude — next implementation.** Ship asset contract/compiler, demonstrator hull, per-mount state and evaluation, self-occlusion, explicit roll/full-attitude orders, and selected-mount visualization. Complete geometry tests and one explainable combat scenario before converting all ships.
3. **Physical budgets.** Thruster layouts and inertia, recoil, coupled propellant/energy accounting, thermal energy/temperature and radiators. Replace prototype numbers with internally consistent authored technology budgets.
4. **Spatial combat damage.** Collision proxies, armor/material response and component volumes shared with the renderer; validate conservation and performance.
5. **Combined-arms combat — required before core combat is complete.** Guided missiles, the necessary seeker/contact model, expendable decoys, jamming/counter-countermeasures, physical point defense and escort coordination. Implement and test missiles with their defenses together; neither is an optional distant extension.
6. **Content and tactics.** Distinct original fleet roles, AI that uses every core weapon/defense and understands geometry and exposed systems, tutorials, loadout choices and balance playtests. Advanced sensor fog, missile buses, specialist warheads and orbital scenarios follow the complete core engagement loop.

Defaults carried forward: three ships per side; simultaneous 30-second commitments; no mid-interval player interrupts; exact visible enemy motion and private orders; original content; desktop browser first. Product name remains **Vector Fleet**, repository name **tactical-space-battle**. The technology era and final art direction remain future content decisions; neither blocks extraction or the geometry demonstrator. This document specifies the new direction and next milestones, not a claim that all of these systems shipped with the migration.
