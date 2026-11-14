# Tactical feature parity

Updated 14 November 2026. This is a capability comparison against the inspiration's tactical breadth, not a promise to reproduce its rules or numerical balance. The old AVT browser project also had unfinished features; its roadmap is not evidence that all of the board game's systems were playable there.

Vector Fleet currently provides a playable **flight and beam/kinetic skirmish foundation**. It does not yet provide full tactical feature parity. Migration into a separate repository did not add missing combat systems.

## Current state and required core target

| Capability | Current Vector Fleet implementation | Required core-combat target |
|---|---|---|
| 3D movement and inertia | Present: continuous position/velocity, thrust, braking, fuel/mass and destination guidance | Physically consistent thruster forces and propellant/energy budgets; readable intercept and braking predictions |
| Orientation | Partial: quaternion attitude, angular-rate limits and nose-facing intent; no explicit roll/spin order | Full pitch/yaw/roll, complete attitude intent, attitude hold and persistent spin, with torque/inertia and meaningful surface exposure |
| Weapon arcs | Simplified ship-centered forward cone | Model-aligned hardpoints, joint limits, tracking and self-obstruction shared by simulation and display |
| Beams | Present, simplified range falloff and resource costs | Individual mounts, delivered energy/dwell/spot geometry, thermal constraints and material response |
| Ballistic/coilgun-style weapons | Present: inherited ship velocity, lead calculation, ammunition and swept impacts | Actual muzzle motion, recoil, physical mounts and spatial impact/damage |
| Guided missiles | Absent; current `Projectile` objects are unguided ballistic rounds | Finite thrust/propellant, acquisition, guidance, terminal approach, track loss/reacquisition and interceptable missile vehicles |
| Point defense | Simplified: automatically removes an eligible nearby closing projectile at a resource/cooldown cost | Physical defensive mounts and intercept solutions, target scheduling, finite capacity, and escort protection |
| Expendable countermeasures | Absent | Decoy trajectories, signatures, lifetimes, inventories and channel-dependent seeker interaction |
| Electronic warfare and counter-countermeasures | Absent | Explicit emissions, power/geometry effects on observations, track quality and discrimination; no universal hit modifier |
| Sensors/seeker observations | Exact public enemy motion; no seeker/contact model | A bounded contact model needed for missiles and countermeasures; separate from later detailed fleet fog of war |
| Armor and system damage | Partial: directional armor, scalar hull and four abstract system conditions | Geometry-aligned armor/materials and component volumes; failures alter the same flight/weapon/resource models |
| Power, heat and fuel | Present, simplified | Coupled physical budgets, finite stores, temperature limits and radiator behavior |
| Formations and fleet coordination | Basic leader-relative formations and per-ship targets | Coordinated salvos, escort coverage, complementary mount geometry and defensive priorities |
| Command and multiplayer | Present: private plans, 30-second commitments, solo AI, multiplayer, spectators and recovery | Preserve these capabilities across every added system; automatic authorized defense throughout execution |
| Ship roles/loadouts | Three fixed procedural designs | Original designs with meaningful weapon, defense and resource tradeoffs; no copied ship-sheet compatibility requirement |

The [core state and order types](../core/types.ts) and [simulation](../core/simulation.ts) are the implementation evidence. In particular, quaternion storage does not imply complete attitude controls, and basic point defense does not imply decoys or electronic warfare.

## What parity means here

Preserve decisions such as choosing between a beam shot and a missile salvo, conserving defensive ammunition, rolling an intact surface toward a threat, sacrificing emissions discipline for a stronger track, coordinating an escort, or forcing an attacker to spend missile delta-v. Replace low-resolution procedures with continuous, inspectable behavior:

- **Missiles:** launch geometry and evolving reachable intercepts replace hex-based approach bookkeeping.
- **Countermeasures:** sensor-channel and trajectory interactions replace a universal defensive bonus.
- **Orientation:** full three-axis attitude and mount placement replace facing windows and lateral-arc ambiguity.
- **Beams and kinetics:** actual lines of fire, tracking and intercept geometry replace range/bearing lookups.
- **Damage/resources:** impacts, components and budgets produce consequences that the computer tracks and explains.

The target retains tactical depth. The reductions are in manual calculations, discretization artifacts and exception handling. Original rules terminology and table outcomes are not acceptance requirements.

## Core-combat completion gate

Do not describe the game as tactically complete while missiles, countermeasures or full attitude control are absent. A core-complete skirmish must include:

1. Beams, unguided kinetics and guided missiles with materially different uses.
2. Physical interception, decoys, channel-specific electronic interference and counter-countermeasures, with finite resources and observable failure modes.
3. Full attitude control whose roll and facing change mount coverage and component/armor exposure.
4. Coupled flight, weapon, damage, power and thermal behavior; maneuver and resource costs remain meaningful.
5. AI, player controls, forecast uncertainty, readable execution and durable replay for those systems together.

Develop the missile/defense loop as one milestone after the shared geometry, attitude and resource foundations. Balance passes and tutorials can begin earlier, but completing a polished beam-only scenario does not satisfy this gate.

## Later extensions

Detailed fleet sensor fog, orbital environments, missile buses and deployment vehicles, specialist nuclear/EMP effects, repair/crew procedures, docking/transfers, campaign progression and unrestricted ship construction remain later work. This is a sequencing boundary, not a decision to reproduce every tabletop feature. Add each when its tactical value and physically grounded model are clear.

All statuses above describe the current code. The revised target and completion gate are design commitments; this document update does not implement the missing systems.
