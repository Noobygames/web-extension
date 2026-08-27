# OGame Extension Development Roadmap & Feature Matrix

## 1. Competitor Analysis (The Big Three)

- **AntiGameReborn (AGR):** Data-heavy, high micromanagement, spreadsheet-like UI.
- **OGame Infinity (OGI):** Modern UI, seamless integration, excellent expedition fanout and galaxy view.
- **OGlight:** Lightweight, focused on fast espionage workflows and finding inactive players.

## 2. Core Feature Comparison Matrix

| Feature Category    | AntiGameReborn (AGR) | OGame Infinity (OGI) | OGlight    | Our Target Implementation (Market Gap)     |
| :------------------ | :------------------- | :------------------- | :--------- | :----------------------------------------- |
| **UI Philosophy**   | Cluttered, tabular   | Modern, seamless     | Minimalist | Modular, draggable widgets, clean UI       |
| **Loot Trackers**   | High detail (Text)   | Visual (Charts)      | Basic      | Smart capacity-waste warnings              |
| **Fleet Dispatch**  | Complex routines     | Fanout focus         | Raid focus | Dynamic fanout avoiding overfished systems |
| **Galaxy View**     | Solid                | Excellent (Filters)  | Excellent  | Real-time ETA and profit/hour calculations |
| **Empire View**     | Yes                  | Yes                  | Partial    | One-click "Auto-Harvest" calculator        |
| **Sim Integration** | External (TrashSim)  | External (TrashSim)  | In-game    | Seamless in-game sim overlay               |

---

## 3. High-Priority Features (Community Requests)

_These features address current pain points in existing extensions. Use these descriptions as implementation guidelines for the codebase._

### Feature A: Advanced Espionage & Farm Evaluator

- **Goal:** Allow players to sort espionage reports by "Profit per Hour" rather than just absolute loot.
- **Logic Requirements:**
  1. Parse target coordinates from the espionage report.
  2. Calculate distance between the origin planet and the target.
  3. Calculate ETA (Estimated Time of Arrival) based on the user's current engine tech levels (Combustion, Impulse, Hyperspace) and the slowest cargo ship speed.
  4. Calculate `(Total Loot) / (ETA * 2)` to get the true hourly profit.
  5. Inject a sortable column into the game's message interface.

### Feature B: Dynamic Auto-Harvest (Save-Flight) Calculator

- **Goal:** Provide a one-click solution to gather all resources from colonies and send them to a designated "Bank" planet.
- **Logic Requirements:**
  1. Scrape current resource amounts (Metal, Crystal, Deuterium) from all planets and moons via the game's DOM or API.
  2. Calculate the required cargo capacity for each planet.
  3. Match the required capacity against available Large/Small Cargos on that specific planet.
  4. Generate a quick-dispatch button on the Empire view that pre-fills the fleet sending form with the exact ship count and target coordinates of the Bank planet.

### Feature C: Balanced Expedition Dispatch

- **Goal:** Prevent players from sending overlapping or disproportionate expedition fleets.
- **Logic Requirements:**
  1. Check the player's total available expedition slots (based on Astrophysics level) and currently active expeditions.
  2. Count the total available cargo ships on the current planet.
  3. Implement an algorithm: `Ships per Fleet = Math.floor(Total Available Cargos / Open Expedition Slots)`.
  4. Pre-fill the fleet dispatch UI with this dynamically calculated number instead of a static preset.

### Feature D: High-Precision Economy Engine (Lifeforms & Crawlers)

- **Goal:** Fix the inaccurate resource production displays present in other extensions by accurately accounting for the latest game updates.
- **Logic Requirements:**
  1. Read standard mine levels and plasma technology.
  2. Parse active Lifeform tech trees (specifically looking for resource and energy boosts) across all planets.
  3. Calculate the impact of active Crawlers, considering the player's selected class (e.g., Collector bonus) and the Overload setting of Fusion Reactors.
  4. Aggregate these factors into a custom, highly accurate "Real Production" tooltip in the resource bar.

### Feature E: PTRE / Team Synchronization API

- **Goal:** Allow alliance members to share target lists and espionage reports seamlessly.
- **Logic Requirements:**
  1. Implement a REST API client within the extension.
  2. Push parsed espionage report data (Coordinates, Defenses, Fleet, Resources) to a shared PTRE server.
  3. Fetch flagged targets from the server and highlight them in red/green within the user's Galaxy view to prevent duplicate farming by alliance members.
