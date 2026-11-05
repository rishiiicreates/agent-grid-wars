#!/usr/bin/env python3
"""
GridWars Autonomous AI Agent Client
===================================
A lightweight, zero-dependency autonomous bot client for GridWars.
Compatible with Python 3.7+ (uses standard library urllib).

Usage:
  # Play vs internal AI or human on deployed arena:
  python3 bot.py --url https://agent-grid-wars.vercel.app --mode bot --name "CyberTitan"

  # Join an existing multiplayer match hosted by a human in browser:
  python3 bot.py --url https://agent-grid-wars.vercel.app --match GW-XXXX --name "AgentAlpha"

  # Run locally against dev server:
  python3 bot.py --url http://localhost:3000 --mode bot
"""

import argparse
import json
import math
import sys
import time
import urllib.error
import urllib.request

# ANSI Terminal Colors
CYAN = "\033[96m"
RED = "\033[91m"
GREEN = "\033[92m"
YELLOW = "\033[93m"
MAGENTA = "\033[95m"
BOLD = "\033[1m"
DIM = "\033[2m"
RESET = "\033[0m"

PYLON_COORDS = [(3, 1), (3, 3), (3, 5)]


class GridWarsClient:
    def __init__(self, base_url: str):
        self.base_url = base_url.rstrip("/")

    def _request(self, endpoint: str, data: dict = None, method: str = "GET") -> dict:
        url = f"{self.base_url}{endpoint}"
        headers = {"Content-Type": "application/json", "User-Agent": "GridWars-Agent/1.0"}
        body = json.dumps(data).encode("utf-8") if data is not None else None

        req = urllib.request.Request(url, data=body, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            err_body = e.read().decode("utf-8")
            try:
                return json.loads(err_body)
            except Exception:
                raise RuntimeError(f"HTTP {e.code}: {err_body}")
        except Exception as e:
            raise RuntimeError(f"Network error contacting {url}: {e}")

    def create_match(self, mode: str = "bot", name: str = "GridBot") -> dict:
        return self._request("/api/matches", {"mode": mode, "playerName": name}, method="POST")

    def join_match(self, match_id: str, name: str = "GridBot") -> dict:
        return self._request(
            "/api/matches", {"matchId": match_id, "playerName": name, "mode": "pvp"}, method="POST"
        )

    def get_state(self, match_id: str) -> dict:
        return self._request(f"/api/matches/{match_id}", method="GET")

    def submit_move(self, match_id: str, player: int, action: str, x: int = None, y: int = None) -> dict:
        payload = {"player": player, "action": action}
        if x is not None:
            payload["x"] = x
        if y is not None:
            payload["y"] = y
        return self._request(f"/api/matches/{match_id}/move", payload, method="POST")


def print_board(grid: list, p1_name: str, p2_name: str, turn: int):
    """Render 7x7 tactical grid into ANSI color terminal."""
    print(f"\n{BOLD}=== BATTLEFIELD MATRIX (TURN {turn}/30) ==={RESET}")
    print(f" {CYAN}■ P1: {p1_name}{RESET}  |  {RED}■ P2: {p2_name}{RESET}  |  {YELLOW}⚡ Pylons: (3,1), (3,3), (3,5){RESET}\n")

    header = "    " + "   ".join(str(x) for x in range(7))
    print(f"{DIM}{header}{RESET}")
    print("  +" + "---+" * 7)

    for y in range(7):
        row_str = f"{DIM}{y}{RESET} |"
        for x in range(7):
            cell = grid[y][x]
            owner = cell.get("owner", 0)
            ctype = cell.get("type", "empty")
            shield = cell.get("shield", 0)
            hp = cell.get("hp", 0)

            shield_char = f"{shield}" if shield > 0 else " "

            if ctype == "core":
                tag = "C1" if owner == 1 else "C2"
                color = CYAN if owner == 1 else RED
                row_str += f"{color}{BOLD}{tag}{shield_char}{RESET}|"
            elif ctype == "pylon":
                color = YELLOW if owner == 0 else (CYAN if owner == 1 else RED)
                row_str += f"{color}⚡P{shield_char}{RESET}|"
            elif owner == 1:
                row_str += f"{CYAN}■1{shield_char}{RESET}|"
            elif owner == 2:
                row_str += f"{RED}■2{shield_char}{RESET}|"
            else:
                row_str += f"{DIM} · {RESET}|"
        print(row_str)
        print("  +" + "---+" * 7)


def evaluate_tactical_move(move: dict, state: dict, my_player: int) -> float:
    """Heuristic scoring function for turn-based tactical evaluation."""
    action = move["action"]
    enemy_player = 2 if my_player == 1 else 1
    grid = state["grid"]
    player_data = state["players"][my_player - 1]
    enemy_data = state["players"][enemy_player - 1]
    my_energy = player_data["energy"]

    enemy_core = (0, 0) if enemy_player == 1 else (6, 6)
    my_core = (0, 0) if my_player == 1 else (6, 6)

    score = 0.0

    if action == "overcharge":
        tx, ty = move["x"], move["y"]
        target = grid[ty][tx]
        if target["type"] == "core":
            score = 1200.0
            if target["hp"] <= 3 and target["shield"] == 0:
                score = 9999.0  # Lethal strike!
        elif target["type"] == "pylon":
            score = 400.0
        else:
            score = 220.0

    elif action == "emp":
        tx, ty = move["x"], move["y"]
        enemy_units = 0
        shields_stripped = 0
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                nx, ny = tx + dx, ty + dy
                if 0 <= nx < 7 and 0 <= ny < 7:
                    c = grid[ny][nx]
                    if c["owner"] == enemy_player:
                        enemy_units += 1
                        shields_stripped += c.get("shield", 0)
        score = 300.0 + (shields_stripped * 120.0) + (enemy_units * 75.0)

    elif action == "expand":
        tx, ty = move["x"], move["y"]
        cell = grid[ty][tx]
        if cell["type"] == "pylon":
            score = 650.0  # Pylons compound energy economy
        else:
            # Distance to closest neutral pylon
            min_pylon_dist = min(
                abs(tx - px) + abs(ty - py)
                for px, py in PYLON_COORDS
                if grid[py][px]["owner"] != my_player
            )
            # Distance to enemy core
            core_dist = abs(tx - enemy_core[0]) + abs(ty - enemy_core[1])
            score = 250.0 - (min_pylon_dist * 20.0) - (core_dist * 6.0)

    elif action == "fortify":
        tx, ty = move["x"], move["y"]
        cell = grid[ty][tx]
        if cell["type"] == "core":
            score = 420.0 if cell.get("shield", 0) == 0 else 180.0
        elif cell["type"] == "pylon":
            score = 250.0
        else:
            score = 90.0

    elif action == "pass":
        # Pass is smart when low on energy to save for Overcharge or EMP
        if my_energy <= 2:
            score = 140.0
        else:
            score = 10.0

    return score


def run_agent_loop(client: GridWarsClient, match_id: str, player_idx: int, bot_name: str):
    print(f"\n{GREEN}{BOLD}>>> Agent '{bot_name}' connected to Match {match_id} as Player {player_idx}!{RESET}")
    print(f"{CYAN}Waiting for turns... Poll interval: 1.0s{RESET}\n")

    last_turn_played = -1

    while True:
        try:
            state = client.get_state(match_id)
        except Exception as e:
            print(f"{RED}Error fetching state: {e}{RESET}")
            time.sleep(2)
            continue

        turn = state.get("turn", 1)
        active_player = state.get("activePlayer")
        winner = state.get("winner")

        if winner:
            print_board(state["grid"], state["players"][0]["name"], state["players"][1]["name"], turn)
            print(f"\n{BOLD}{YELLOW}================ MATCH OVER ================{RESET}")
            if winner == player_idx:
                print(f"{GREEN}{BOLD}🏆 VICTORY! Our agent conquered the grid!{RESET}")
            elif winner == "draw":
                print(f"{YELLOW}{BOLD}⚖️ MATCH DRAWN! Equal territory.{RESET}")
            else:
                print(f"{RED}{BOLD}💀 DEFEAT. Enemy achieved victory.{RESET}")
            print(f"Reason: {state.get('winReason')}")
            break

        if active_player == player_idx:
            print_board(state["grid"], state["players"][0]["name"], state["players"][1]["name"], turn)
            valid_moves = state.get("validMoves", [])

            if not valid_moves:
                print(f"{YELLOW}No valid moves returned. Submitting pass...{RESET}")
                client.submit_move(match_id, player_idx, "pass")
                time.sleep(1)
                continue

            # Evaluate each move
            scored_moves = [
                (evaluate_tactical_move(m, state, player_idx), m)
                for m in valid_moves
            ]
            scored_moves.sort(key=lambda item: item[0], reverse=True)
            best_score, best_move = scored_moves[0]

            action = best_move["action"]
            tx = best_move.get("x")
            ty = best_move.get("y")
            cost = best_move.get("cost", 0)

            print(
                f"{GREEN}⚡ Executing: {BOLD}{action.upper()}{RESET} at ({tx}, {ty}) "
                f"[Cost: {cost} Energy, Score: {best_score:.1f}]"
            )

            res = client.submit_move(match_id, player_idx, action, tx, ty)
            if not res.get("success"):
                print(f"{RED}Move failed: {res.get('error')}{RESET}")

            last_turn_played = turn
            time.sleep(0.8)
        else:
            opp_name = state["players"][active_player - 1]["name"]
            print(f"{DIM}Waiting for {opp_name} (Turn {turn})...{RESET}", end="\r", flush=True)
            time.sleep(1.0)


def main():
    parser = argparse.ArgumentParser(description="GridWars Autonomous Strategy Agent")
    parser.add_argument(
        "--url", default="http://localhost:3000", help="GridWars API base URL"
    )
    parser.add_argument(
        "--match", default=None, help="Match ID to join (e.g. GW-ABCD). If omitted, creates new."
    )
    parser.add_argument(
        "--mode", default="bot", choices=["bot", "pvp"], help="Match mode when creating"
    )
    parser.add_argument(
        "--name", default="NeuralAegis", help="Agent display name"
    )

    args = parser.parse_args()
    client = GridWarsClient(args.url)

    print(f"{BOLD}{CYAN}====================================================")
    print(f"      GRIDWARS // AUTONOMOUS AGENT CONTROLLER       ")
    print(f"===================================================={RESET}")
    print(f"Arena Host: {args.url}")
    print(f"Agent Name: {args.name}")

    if args.match:
        print(f"Attempting to join match: {args.match}...")
        resp = client.join_match(args.match, args.name)
        if not resp.get("success"):
            print(f"{RED}Failed to join match: {resp.get('error')}{RESET}")
            sys.exit(1)
        match_id = resp["matchId"]
        player_idx = resp.get("playerIndex", 2)
    else:
        print(f"Creating new match [mode={args.mode}]...")
        resp = client.create_match(args.mode, args.name)
        if not resp.get("success"):
            print(f"{RED}Failed to create match: {resp.get('error')}{RESET}")
            sys.exit(1)
        match_id = resp["matchId"]
        player_idx = resp.get("playerIndex", 1)

    run_agent_loop(client, match_id, player_idx, args.name)


if __name__ == "__main__":
    main()
