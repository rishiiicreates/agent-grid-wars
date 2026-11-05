import { Cell, MatchState, Move, MoveInput, Player } from './types';

export const GRID_SIZE = 7;
export const MAX_TURNS = 30;
export const CORE_HP = 10;
export const CELL_HP = 2;
export const PYLON_HP = 4;
export const BASE_ENERGY_INCOME = 2;
export const ENERGY_CAP = 10;

export const COSTS = {
  expand: 1,
  fortify: 2,
  overcharge: 3,
  emp: 4,
  pass: 0,
} as const;

export const PYLON_COORDS = [
  { x: 3, y: 1 },
  { x: 3, y: 3 },
  { x: 3, y: 5 },
];

export function createInitialGrid(): Cell[][] {
  const grid: Cell[][] = [];
  for (let y = 0; y < GRID_SIZE; y++) {
    const row: Cell[] = [];
    for (let x = 0; x < GRID_SIZE; x++) {
      const isPylon = PYLON_COORDS.some((p) => p.x === x && p.y === y);
      const isP1Core = x === 0 && y === 0;
      const isP2Core = x === GRID_SIZE - 1 && y === GRID_SIZE - 1;

      if (isP1Core) {
        row.push({
          x,
          y,
          owner: 1,
          type: 'core',
          hp: CORE_HP,
          maxHp: CORE_HP,
          shield: 0,
        });
      } else if (isP2Core) {
        row.push({
          x,
          y,
          owner: 2,
          type: 'core',
          hp: CORE_HP,
          maxHp: CORE_HP,
          shield: 0,
        });
      } else if (isPylon) {
        row.push({
          x,
          y,
          owner: 0,
          type: 'pylon',
          hp: PYLON_HP,
          maxHp: PYLON_HP,
          shield: 0,
        });
      } else {
        row.push({
          x,
          y,
          owner: 0,
          type: 'empty',
          hp: 1,
          maxHp: CELL_HP,
          shield: 0,
        });
      }
    }
    grid.push(row);
  }
  return grid;
}

export function createInitialMatch(
  id: string,
  mode: 'bot' | 'pvp' = 'bot',
  p1Name: string = 'Human Operator',
  p2Name: string = mode === 'bot' ? 'A.I. Aegis-9' : 'Challenger'
): MatchState {
  const grid = createInitialGrid();
  const now = new Date().toISOString();

  const players: [Player, Player] = [
    {
      index: 1,
      name: p1Name || 'Player 1',
      energy: 3,
      coreHp: CORE_HP,
      tilesOwned: 1,
      isBot: false,
    },
    {
      index: 2,
      name: p2Name || (mode === 'bot' ? 'A.I. Aegis-9' : 'Player 2'),
      energy: 3,
      coreHp: CORE_HP,
      tilesOwned: 1,
      isBot: mode === 'bot',
    },
  ];

  const state: MatchState = {
    id,
    status: mode === 'bot' ? 'active' : 'waiting',
    mode,
    turn: 1,
    activePlayer: 1,
    winner: null,
    winReason: null,
    players,
    grid,
    validMoves: [],
    history: [
      {
        turn: 1,
        player: 1,
        action: 'pass',
        text: `Match ${id} initialized. ${players[0].name} (P1) vs ${players[1].name} (P2).`,
        timestamp: now,
      },
    ],
    createdAt: now,
    updatedAt: now,
  };

  state.validMoves = getValidMoves(state, 1);
  return state;
}

export function getValidMoves(state: MatchState, playerIndex: 1 | 2): Move[] {
  if (state.winner || state.status === 'finished') {
    return [];
  }

  const moves: Move[] = [];
  const player = state.players[playerIndex - 1];
  const energy = player.energy;
  const opponentIndex: 1 | 2 = playerIndex === 1 ? 2 : 1;

  // 1. Pass move is always available (Cost: 0)
  moves.push({
    action: 'pass',
    cost: 0,
    description: `Bank ${energy} energy and pass turn.`,
  });

  // 2. Expand moves (Cost: 1)
  if (energy >= COSTS.expand) {
    const candidateCells = new Set<string>();

    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        if (state.grid[y][x].owner === playerIndex) {
          // Check orthogonal neighbors
          const deltas = [
            [-1, 0],
            [1, 0],
            [0, -1],
            [0, 1],
          ];
          for (const [dx, dy] of deltas) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && nx < GRID_SIZE && ny >= 0 && ny < GRID_SIZE) {
              const neighbor = state.grid[ny][nx];
              if (neighbor.owner === 0) {
                const key = `${nx},${ny}`;
                if (!candidateCells.has(key)) {
                  candidateCells.add(key);
                  moves.push({
                    action: 'expand',
                    x: nx,
                    y: ny,
                    cost: COSTS.expand,
                    description: `Expand network to ${neighbor.type === 'pylon' ? 'Quantum Pylon' : 'tile'} at (${nx}, ${ny}).`,
                  });
                }
              }
            }
          }
        }
      }
    }
  }

  // 3. Fortify moves (Cost: 2)
  if (energy >= COSTS.fortify) {
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        const cell = state.grid[y][x];
        if (cell.owner === playerIndex && cell.shield < 4) {
          moves.push({
            action: 'fortify',
            x,
            y,
            cost: COSTS.fortify,
            description: `Fortify ${cell.type === 'core' ? 'Core' : 'node'} at (${x}, ${y}) with +2 Shield.`,
          });
        }
      }
    }
  }

  // 4. Overcharge moves (Cost: 3)
  // Target: Any enemy cell (or enemy Core) within range (Chebyshev distance <= 2) of ANY owned cell
  if (energy >= COSTS.overcharge) {
    const enemyTargets = new Set<string>();

    for (let ey = 0; ey < GRID_SIZE; ey++) {
      for (let ex = 0; ex < GRID_SIZE; ex++) {
        const enemyCell = state.grid[ey][ex];
        if (enemyCell.owner === opponentIndex) {
          // Check if within distance 2 of any owned cell
          let inRange = false;
          for (let y = 0; y < GRID_SIZE && !inRange; y++) {
            for (let x = 0; x < GRID_SIZE && !inRange; x++) {
              if (state.grid[y][x].owner === playerIndex) {
                const dist = Math.max(Math.abs(ex - x), Math.abs(ey - y));
                if (dist <= 2) {
                  inRange = true;
                }
              }
            }
          }

          if (inRange) {
            const key = `${ex},${ey}`;
            if (!enemyTargets.has(key)) {
              enemyTargets.add(key);
              moves.push({
                action: 'overcharge',
                x: ex,
                y: ey,
                cost: COSTS.overcharge,
                description: `Overcharge beam strike on enemy ${enemyCell.type === 'core' ? 'CORE' : 'node'} at (${ex}, ${ey}) for 3 Damage.`,
              });
            }
          }
        }
      }
    }
  }

  // 5. EMP moves (Cost: 4)
  // Target: Any grid center coordinate
  if (energy >= COSTS.emp) {
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        // Only consider EMP where at least one enemy cell is within the 3x3 radius
        let hasEnemyInRadius = false;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && nx < GRID_SIZE && ny >= 0 && ny < GRID_SIZE) {
              if (state.grid[ny][nx].owner === opponentIndex) {
                hasEnemyInRadius = true;
                break;
              }
            }
          }
          if (hasEnemyInRadius) break;
        }

        if (hasEnemyInRadius) {
          moves.push({
            action: 'emp',
            x,
            y,
            cost: COSTS.emp,
            description: `EMP Blast centered at (${x}, ${y}): strips shields, deals 1 damage, drains 1 energy.`,
          });
        }
      }
    }
  }

  return moves;
}

export function applyMove(
  prevState: MatchState,
  input: MoveInput
): { nextState: MatchState; error?: string } {
  if (prevState.winner || prevState.status === 'finished') {
    return { nextState: prevState, error: 'Match is already finished.' };
  }

  if (prevState.activePlayer !== input.player) {
    return {
      nextState: prevState,
      error: `Not player ${input.player}'s turn. Active player is ${prevState.activePlayer}.`,
    };
  }

  const cost = COSTS[input.action];
  const player = prevState.players[input.player - 1];
  const opponentIndex: 1 | 2 = input.player === 1 ? 2 : 1;
  const opponent = prevState.players[opponentIndex - 1];

  if (player.energy < cost) {
    return {
      nextState: prevState,
      error: `Insufficient energy. Action '${input.action}' requires ${cost} energy (you have ${player.energy}).`,
    };
  }

  // Deep clone state
  const nextState: MatchState = JSON.parse(JSON.stringify(prevState));
  const activeP = nextState.players[input.player - 1];
  const oppP = nextState.players[opponentIndex - 1];
  const now = new Date().toISOString();

  // Deduct energy
  activeP.energy -= cost;

  let actionText = '';
  const x = input.x ?? 0;
  const y = input.y ?? 0;

  switch (input.action) {
    case 'pass': {
      actionText = `${activeP.name} (P${input.player}) banked energy and passed.`;
      break;
    }

    case 'expand': {
      if (input.x === undefined || input.y === undefined) {
        return { nextState: prevState, error: 'Target coordinates required for expand.' };
      }
      const cell = nextState.grid[y][x];
      if (cell.owner !== 0) {
        return { nextState: prevState, error: `Tile (${x}, ${y}) is not neutral.` };
      }

      // Check adjacency
      const deltas = [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ];
      const isAdjacent = deltas.some(([dx, dy]) => {
        const nx = x + dx;
        const ny = y + dy;
        return (
          nx >= 0 &&
          nx < GRID_SIZE &&
          ny >= 0 &&
          ny < GRID_SIZE &&
          nextState.grid[ny][nx].owner === input.player
        );
      });

      if (!isAdjacent) {
        return {
          nextState: prevState,
          error: `Tile (${x}, ${y}) is not adjacent to your network.`,
        };
      }

      cell.owner = input.player;
      cell.hp = cell.type === 'pylon' ? PYLON_HP : CELL_HP;
      cell.maxHp = cell.type === 'pylon' ? PYLON_HP : CELL_HP;
      cell.shield = 0;

      actionText = `${activeP.name} (P${input.player}) expanded to ${cell.type === 'pylon' ? 'Quantum Pylon' : 'tile'} at (${x}, ${y}).`;
      break;
    }

    case 'fortify': {
      if (input.x === undefined || input.y === undefined) {
        return { nextState: prevState, error: 'Target coordinates required for fortify.' };
      }
      const cell = nextState.grid[y][x];
      if (cell.owner !== input.player) {
        return { nextState: prevState, error: `You do not own tile at (${x}, ${y}).` };
      }
      cell.shield = Math.min(4, cell.shield + 2);
      actionText = `${activeP.name} (P${input.player}) fortified ${cell.type === 'core' ? 'Core' : 'tile'} at (${x}, ${y}) (Shield: ${cell.shield}).`;
      break;
    }

    case 'overcharge': {
      if (input.x === undefined || input.y === undefined) {
        return { nextState: prevState, error: 'Target coordinates required for overcharge.' };
      }
      const cell = nextState.grid[y][x];
      if (cell.owner !== opponentIndex) {
        return { nextState: prevState, error: `Target at (${x}, ${y}) is not an enemy tile.` };
      }

      // Check range
      let inRange = false;
      for (let gy = 0; gy < GRID_SIZE && !inRange; gy++) {
        for (let gx = 0; gx < GRID_SIZE && !inRange; gx++) {
          if (nextState.grid[gy][gx].owner === input.player) {
            if (Math.max(Math.abs(x - gx), Math.abs(y - gy)) <= 2) {
              inRange = true;
            }
          }
        }
      }

      if (!inRange) {
        return {
          nextState: prevState,
          error: `Enemy tile at (${x}, ${y}) is out of range (max 2 tiles from your network).`,
        };
      }

      let dmg = 3;
      if (cell.shield > 0) {
        const absorbed = Math.min(cell.shield, dmg);
        cell.shield -= absorbed;
        dmg -= absorbed;
      }
      cell.hp -= dmg;

      if (cell.type === 'core') {
        oppP.coreHp = Math.max(0, cell.hp);
        if (cell.hp <= 0) {
          nextState.winner = input.player;
          nextState.winReason = `${activeP.name} obliterated the enemy Core!`;
          nextState.status = 'finished';
        }
      } else if (cell.hp <= 0) {
        // Tile neutralized
        cell.owner = 0;
        cell.hp = 1;
        cell.shield = 0;
      }

      actionText = `${activeP.name} (P${input.player}) struck (${x}, ${y}) with Overcharge beam (Enemy HP: ${Math.max(0, cell.hp)}, Shield: ${cell.shield}).`;
      break;
    }

    case 'emp': {
      if (input.x === undefined || input.y === undefined) {
        return { nextState: prevState, error: 'Target center coordinates required for EMP.' };
      }
      let cellsHit = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < GRID_SIZE && ny >= 0 && ny < GRID_SIZE) {
            const cell = nextState.grid[ny][nx];
            if (cell.owner === opponentIndex) {
              cellsHit++;
              cell.shield = 0; // Strip all shields
              cell.hp -= 1; // 1 damage
              if (cell.type === 'core') {
                oppP.coreHp = Math.max(0, cell.hp);
                if (cell.hp <= 0) {
                  nextState.winner = input.player;
                  nextState.winReason = `${activeP.name}'s EMP blast destroyed the enemy Core!`;
                  nextState.status = 'finished';
                }
              } else if (cell.hp <= 0) {
                cell.owner = 0;
                cell.hp = 1;
              }
            }
          }
        }
      }

      // Energy drain
      if (oppP.energy > 0) {
        oppP.energy -= 1;
      }

      actionText = `${activeP.name} (P${input.player}) detonated EMP at (${x}, ${y}), disrupting ${cellsHit} enemy nodes and draining 1 Energy.`;
      break;
    }
  }

  // Recalculate tile ownership count
  let p1Tiles = 0;
  let p2Tiles = 0;
  for (let gy = 0; gy < GRID_SIZE; gy++) {
    for (let gx = 0; gx < GRID_SIZE; gx++) {
      if (nextState.grid[gy][gx].owner === 1) p1Tiles++;
      if (nextState.grid[gy][gx].owner === 2) p2Tiles++;
    }
  }
  nextState.players[0].tilesOwned = p1Tiles;
  nextState.players[1].tilesOwned = p2Tiles;

  // Check territory domination condition (>= 25 tiles)
  if (!nextState.winner) {
    if (p1Tiles >= 25) {
      nextState.winner = 1;
      nextState.winReason = `${nextState.players[0].name} achieved Network Domination (${p1Tiles} tiles)!`;
      nextState.status = 'finished';
    } else if (p2Tiles >= 25) {
      nextState.winner = 2;
      nextState.winReason = `${nextState.players[1].name} achieved Network Domination (${p2Tiles} tiles)!`;
      nextState.status = 'finished';
    }
  }

  // Push history log
  nextState.history.push({
    turn: nextState.turn,
    player: input.player,
    action: input.action,
    text: actionText,
    timestamp: now,
    target: input.x !== undefined && input.y !== undefined ? { x: input.x, y: input.y } : undefined,
  });

  // If game finished, return immediately
  if (nextState.winner || nextState.status === 'finished') {
    nextState.validMoves = [];
    nextState.updatedAt = now;
    return { nextState };
  }

  // Switch turn
  const nextPlayerIndex: 1 | 2 = input.player === 1 ? 2 : 1;
  nextState.activePlayer = nextPlayerIndex;

  if (nextPlayerIndex === 1) {
    nextState.turn += 1;
  }

  // Turn 30 limit check
  if (nextState.turn > MAX_TURNS) {
    nextState.status = 'finished';
    if (p1Tiles > p2Tiles) {
      nextState.winner = 1;
      nextState.winReason = `Turn limit reached (Turn 30). ${nextState.players[0].name} wins on territory (${p1Tiles} vs ${p2Tiles}).`;
    } else if (p2Tiles > p1Tiles) {
      nextState.winner = 2;
      nextState.winReason = `Turn limit reached (Turn 30). ${nextState.players[1].name} wins on territory (${p2Tiles} vs ${p1Tiles}).`;
    } else {
      if (nextState.players[0].coreHp > nextState.players[1].coreHp) {
        nextState.winner = 1;
        nextState.winReason = `Turn limit reached. ${nextState.players[0].name} wins on Core HP tiebreak.`;
      } else if (nextState.players[1].coreHp > nextState.players[0].coreHp) {
        nextState.winner = 2;
        nextState.winReason = `Turn limit reached. ${nextState.players[1].name} wins on Core HP tiebreak.`;
      } else {
        nextState.winner = 'draw';
        nextState.winReason = `Match drawn after ${MAX_TURNS} turns. Perfect stalemate.`;
      }
    }
    nextState.validMoves = [];
    nextState.updatedAt = now;
    return { nextState };
  }

  // Grant energy income to next active player
  // Base 2 energy + 1 per owned Quantum Pylon
  let pylonCount = 0;
  for (const p of PYLON_COORDS) {
    if (nextState.grid[p.y][p.x].owner === nextPlayerIndex) {
      pylonCount++;
    }
  }
  const income = BASE_ENERGY_INCOME + pylonCount;
  const nextP = nextState.players[nextPlayerIndex - 1];
  nextP.energy = Math.min(ENERGY_CAP, nextP.energy + income);

  // Compute valid moves for next player
  nextState.validMoves = getValidMoves(nextState, nextPlayerIndex);
  nextState.updatedAt = now;

  return { nextState };
}

export function pickBestBotMove(state: MatchState): Move {
  const valid = state.validMoves;
  if (!valid || valid.length === 0) {
    return { action: 'pass', cost: 0, description: 'Pass' };
  }

  const botIndex = state.activePlayer; // 2
  const enemyIndex = botIndex === 1 ? 2 : 1;
  const botPlayer = state.players[botIndex - 1];
  const enemyCore = enemyIndex === 1 ? { x: 0, y: 0 } : { x: 6, y: 6 };
  const botCore = botIndex === 1 ? { x: 0, y: 0 } : { x: 6, y: 6 };

  let bestMove: Move = valid[0];
  let bestScore = -Infinity;

  for (const move of valid) {
    let score = 0;

    switch (move.action) {
      case 'overcharge': {
        const target = state.grid[move.y!][move.x!];
        if (target.type === 'core') {
          // Attacking enemy core is top priority!
          score = 1000;
          if (target.hp <= 3 && target.shield === 0) {
            // Lethal blow!
            score = 5000;
          }
        } else if (target.type === 'pylon') {
          score = 300;
        } else {
          // Normal tile
          score = 150;
        }
        break;
      }

      case 'emp': {
        // Count how many enemy shields and units we hit
        let shieldStripped = 0;
        let enemyHits = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = move.x! + dx;
            const ny = move.y! + dy;
            if (nx >= 0 && nx < GRID_SIZE && ny >= 0 && ny < GRID_SIZE) {
              const cell = state.grid[ny][nx];
              if (cell.owner === enemyIndex) {
                enemyHits++;
                shieldStripped += cell.shield;
              }
            }
          }
        }
        score = 250 + shieldStripped * 100 + enemyHits * 60;
        break;
      }

      case 'expand': {
        const cell = state.grid[move.y!][move.x!];
        if (cell.type === 'pylon') {
          score = 500; // Capturing Pylon is massive!
        } else {
          // Distance to nearest neutral pylon
          let minPylonDist = Infinity;
          for (const p of PYLON_COORDS) {
            if (state.grid[p.y][p.x].owner !== botIndex) {
              const dist = Math.abs(move.x! - p.x) + Math.abs(move.y! - p.y);
              if (dist < minPylonDist) minPylonDist = dist;
            }
          }
          // Distance to enemy core
          const distToEnemyCore = Math.abs(move.x! - enemyCore.x) + Math.abs(move.y! - enemyCore.y);

          score = 200 - minPylonDist * 15 - distToEnemyCore * 5;
        }
        break;
      }

      case 'fortify': {
        const cell = state.grid[move.y!][move.x!];
        if (cell.type === 'core') {
          // If bot core has low shield, fortifying is great
          score = cell.shield === 0 ? 350 : 120;
        } else if (cell.type === 'pylon') {
          score = 180;
        } else {
          score = 80;
        }
        break;
      }

      case 'pass': {
        // If low on energy, passing to save for overcharge/emp is good
        if (botPlayer.energy <= 2) {
          score = 110;
        } else {
          score = 10;
        }
        break;
      }
    }

    // Add slight random jitter (0..10) to break ties organically
    score += Math.random() * 10;

    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
  }

  return bestMove;
}

export function runBotTurn(state: MatchState): MatchState {
  if (state.winner || state.status === 'finished') {
    return state;
  }

  if (state.mode === 'bot' && state.activePlayer === 2 && state.players[1].isBot) {
    const botMove = pickBestBotMove(state);
    const { nextState } = applyMove(state, {
      player: 2,
      action: botMove.action,
      x: botMove.x,
      y: botMove.y,
    });
    return nextState;
  }

  return state;
}
