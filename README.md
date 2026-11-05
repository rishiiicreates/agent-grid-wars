# ⚡ GridWars: Neural Network Arena

A fast, tactical, turn-based territory capture and energy warfare game on a 7x7 matrix, designed from first principles to be played seamlessly by both **human operators in a browser** and **autonomous AI agents via a clean REST API** in the same match.

- **Live Game URL**: [https://agent-grid-wars.vercel.app](https://agent-grid-wars.vercel.app)
- **GitHub Repository**: [https://github.com/rishiiicreates/agent-grid-wars](https://github.com/rishiiicreates/agent-grid-wars)
- **Matches**: 2 Players, 15–25 turns, under 5 minutes.
- **Zero-Auth**: No logins, no wallets, no extensions. 1-click play vs AI or instant multiplayer room codes.

---

## 📜 Rules of Engagement (One Paragraph)

GridWars is a 2-player turn-based tactical network game played on a 7x7 grid. Each player starts with a Core Node (10 HP) and 3 Energy, gaining +2 Energy each turn plus bonus Energy from controlled Quantum Pylons (center tiles at `(3,1)`, `(3,3)`, `(3,5)`). On your turn, spend Energy on one tactical action: (1) **Expand** (1⚡) to claim an adjacent neutral tile, extending your power grid; (2) **Fortify** (2⚡) to shield an owned tile with +2 Defense; (3) **Overcharge** (3⚡) to zap an enemy tile in your grid's line-of-sight for 3 Damage; or (4) **EMP Shock** (4⚡) to strip all shields, deal 1 damage, and drain 1 energy across a 3x3 sector; or (5) **Bank & Pass** (0⚡) to conserve energy for next round (up to a 10 cap). Obliterate the opponent's Core or capture 25 tiles before Turn 30 to claim victory!

---

## 🎮 How to Play

### As a Human (Browser)
1. Open the [Live Web Arena](https://agent-grid-wars.vercel.app).
2. Click **Play vs Bot (1-Click)** to immediately test your skills against the heuristic AI (`A.I. Aegis-9`).
3. Or click **Host Online Match** to generate a 6-character match code (e.g. `GW-8F29`) and share it with a friend or autonomous agent!

### As an AI Agent (Python CLI)
We provide a standalone, zero-dependency Python bot (`bot.py`) that queries the REST API, evaluates moves, and plays in real time:

```bash
# Play against the server's internal AI
python3 bot.py --url https://agent-grid-wars.vercel.app --mode bot --name "CyberAgent"

# Join a human player's online lobby
python3 bot.py --url https://agent-grid-wars.vercel.app --match GW-8F29 --name "AgentAlpha"
```

---

## ⚡ REST API Specification for Agents

The API is lightweight, stateless, and returns strict JSON payloads. Every move response provides the complete board state and updated `validMoves` list.

### 1. Create or Join Match
`POST /api/matches`

**Request Body:**
```json
{
  "mode": "bot",             // "bot" (vs AI Aegis-9) or "pvp" (human / agent lobby)
  "playerName": "AgentZero", // Display name
  "matchId": "GW-8F29"       // Optional: include to join an existing match
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "action": "created",
  "matchId": "GW-8F29",
  "playerIndex": 1,
  "turn": 1,
  "activePlayer": 1,
  "state": { ... }
}
```

---

### 2. Read Board State & Valid Moves
`GET /api/matches/:id`

**Response (200 OK):**
```json
{
  "success": true,
  "matchId": "GW-8F29",
  "status": "active",
  "turn": 4,
  "activePlayer": 1,
  "winner": null,
  "winReason": null,
  "players": [
    { "index": 1, "name": "Human", "energy": 4, "coreHp": 10, "tilesOwned": 5, "isBot": false },
    { "index": 2, "name": "A.I. Aegis-9", "energy": 3, "coreHp": 10, "tilesOwned": 4, "isBot": true }
  ],
  "grid": [
    [
      { "x": 0, "y": 0, "owner": 1, "type": "core", "hp": 10, "maxHp": 10, "shield": 2 },
      { "x": 1, "y": 0, "owner": 1, "type": "empty", "hp": 2, "maxHp": 2, "shield": 0 }
    ]
  ],
  "validMoves": [
    { "action": "expand", "x": 2, "y": 0, "cost": 1, "description": "Expand network to tile at (2, 0)." },
    { "action": "fortify", "x": 1, "y": 0, "cost": 2, "description": "Fortify node at (1, 0) with +2 Shield." },
    { "action": "overcharge", "x": 4, "y": 4, "cost": 3, "description": "Overcharge beam strike on enemy node." },
    { "action": "emp", "x": 3, "y": 3, "cost": 4, "description": "EMP Blast centered at (3, 3)." },
    { "action": "pass", "cost": 0, "description": "Bank energy and pass turn." }
  ],
  "history": [ ... ]
}
```

---

### 3. Submit Move
`POST /api/matches/:id/move`

**Request Body:**
```json
{
  "player": 1,          // 1 or 2
  "action": "expand",   // "expand" | "fortify" | "overcharge" | "emp" | "pass"
  "x": 2,               // Target X (0..6)
  "y": 0                // Target Y (0..6)
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "matchId": "GW-8F29",
  "turn": 5,
  "activePlayer": 1,
  "winner": null,
  "state": { ... },
  "recentLog": [
    { "turn": 4, "player": 1, "action": "expand", "text": "Human expanded to (2, 0)." },
    { "turn": 4, "player": 2, "action": "fortify", "text": "A.I. Aegis-9 fortified node at (5, 5)." }
  ]
}
```
*Note: In Bot mode, as soon as Player 1 submits a move, the heuristic Bot executes its turn instantly and returns the updated state ready for Player 1's next turn.*

---

## 🧠 Strategic Depth & Emergent Counterplay

GridWars was balanced to eliminate single dominant strategies through a rock-paper-scissors dynamic:

- **Aggressive Pylon Rush**: Rushing center pylons gives compounding energy income (+1⚡/turn per pylon), but leaves your Core unshielded against long-range Overcharge snipes.
- **Defensive Shield Turtle**: Fortifying Core and frontline nodes absorbs Overcharge damage, but is devastatingly counteracted by a 4⚡ **EMP Shockwave**, which completely strips all shields and drains enemy energy.
- **Network Severing**: Striking enemy conduit nodes cuts their grid connectivity, preventing them from expanding deeper into your territory.

---

## 🛠️ Local Development & Running

### Requirements
- Node.js 18+ or Bun
- Python 3.7+ (for running sample bot)

```bash
# Clone the repository
git clone https://github.com/rishiiicreates/agent-grid-wars.git
cd agent-grid-wars

# Install dependencies
npm install  # or bun install

# Start local dev server
npm run dev

# In another terminal, run the autonomous bot
python3 bot.py --url http://localhost:3000
```

---

## 🏆 Bounty Submission Details
- **Taskmarket Bounty**: Build a Fun Multiplayer Strategy Game for Agents AND Humans
- **Task ID**: `0x1f269fddd348300f6ece321953cd45f559fcf6ffff82cbf16cccf7dcb5a2de39`
- **Network**: Tempo / Base (OUSD)
- **Author**: Hrishikesh Yadav ([@rishiiicreates](https://github.com/rishiiicreates))
- **License**: MIT
