# GridWars: Neural Network Arena
**Submission for Taskmarket Bounty**: Build a Fun Multiplayer Strategy Game for Agents AND Humans  
**Task ID**: `0x1f269fddd348300f6ece321953cd45f559fcf6ffff82cbf16cccf7dcb5a2de39`  
**Reference Code**: `TSK-JKVSTHB7`

---

## 🔗 Links
- **Live Game URL**: [https://agent-grid-wars.vercel.app](https://agent-grid-wars.vercel.app)
- **Public GitHub Repo**: [https://github.com/rishiiicreates/agent-grid-wars](https://github.com/rishiiicreates/agent-grid-wars)
- **Author**: Hrishikesh Yadav ([@rishiiicreates](https://github.com/rishiiicreates))

---

## 🎯 The Pitch (2–3 Sentences)
GridWars is a cyber-tactical turn-based grid warfare game on a 7x7 matrix where human operators and autonomous AI agents battle head-to-head in fast, high-stakes matches under 5 minutes. Players balance a compounding energy economy by expanding toward central Quantum Pylons, fortifying defensive bastions, sniping enemy nodes with Overcharge beams, and cracking defensive turtles with EMP shockwaves. With zero-auth instant matchmaking, procedural Web Audio synthesizer effects, full live match telemetry, and a clean REST API paired with a zero-dependency Python bot, GridWars delivers addictive emergent gameplay for humans and effortless integration for AI agents.

---

## 📜 Rules of the Game (One Paragraph)
GridWars is a 2-player turn-based tactical network game played on a 7x7 grid. Each player starts with a Core Node (10 HP) and 3 Energy, gaining +2 Energy each turn plus bonus Energy from controlled Quantum Pylons (center tiles at `(3,1)`, `(3,3)`, `(3,5)`). On your turn, spend Energy on one tactical action: (1) **Expand** (1⚡) to claim an adjacent neutral tile, extending your power grid; (2) **Fortify** (2⚡) to shield an owned tile with +2 Defense; (3) **Overcharge** (3⚡) to zap an enemy tile in your grid's line-of-sight for 3 Damage; (4) **EMP Shock** (4⚡) to strip all shields, deal 1 damage, and drain 1 energy across a 3x3 sector; or (5) **Bank & Pass** (0⚡) to conserve energy for next round (up to a 10 cap). Obliterate the opponent's Core or capture 25 tiles before Turn 30 to claim victory!

---

## ⚡ REST API Quick Reference

GridWars was built API-first so any LLM, script, or autonomous agent can jump into an arena match immediately.

### 1. Create or Join Match
`POST /api/matches`
```json
{
  "mode": "bot",
  "playerName": "AlphaBot"
}
```

### 2. Inspect Board State & Valid Moves
`GET /api/matches/:id`
```json
{
  "success": true,
  "matchId": "GW-4EJW",
  "turn": 2,
  "activePlayer": 1,
  "players": [...],
  "grid": [[...7x7 matrix...]],
  "validMoves": [
    { "action": "expand", "x": 1, "y": 0, "cost": 1, "description": "Expand network to tile at (1, 0)." },
    { "action": "fortify", "x": 0, "y": 0, "cost": 2, "description": "Fortify Core at (0, 0) with +2 Shield." },
    { "action": "pass", "cost": 0, "description": "Bank 3 energy and pass turn." }
  ]
}
```

### 3. Submit Move
`POST /api/matches/:id/move`
```json
{
  "player": 1,
  "action": "expand",
  "x": 1,
  "y": 0
}
```

---

## 🤖 Running the Sample Autonomous Agent

A standalone Python bot (`bot.py`) is included in the root repository. It requires zero external dependencies (pure Python 3 standard library):

```bash
# Play autonomously against the internal AI:
python3 bot.py --url https://agent-grid-wars.vercel.app --mode bot --name "CyberTitan"

# Join a human's match hosted in browser:
python3 bot.py --url https://agent-grid-wars.vercel.app --match <MATCH_CODE> --name "AgentOmega"
```
The CLI bot renders a real-time ANSI-colored matrix of the battlefield, evaluates tactical moves (pylon priority, shield break, lethal overcharge snipes), and plays until game conclusion.

---

## ✨ Features & Polish Highlights
- **Zero-Auth Browser Play**: 1-click play vs AI Aegis-9 or create shareable 6-character match codes.
- **Instant Bot Fallback**: In bot mode, the heuristic AI reacts synchronously to player moves—no wait time or empty seat friction.
- **Tactile Procedural SFX**: Web Audio API retro-cyber sound synthesizer with laser sweeps, shield humming, EMP rumble, and victory fanfare (fully toggleable).
- **Persistent Multiplayer State**: Cloud storage with Supabase Postgres + in-memory fallback ensures cross-session consistency across browsers and remote agents.
- **Visual Feedback & Replay**: Live telemetry log showing every action, animated damage, energy meters, and victory confetti.
