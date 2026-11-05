import { NextRequest, NextResponse } from 'next/server';
import { createInitialMatch, getValidMoves } from '@/lib/gameEngine';
import { getMatch, listRecentMatches, saveMatch } from '@/lib/storage';

function generateMatchId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = 'GW-';
  for (let i = 0; i < 4; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export async function GET() {
  const matches = await listRecentMatches();
  return NextResponse.json({
    success: true,
    matches: matches.map((m) => ({
      id: m.id,
      mode: m.mode,
      status: m.status,
      turn: m.turn,
      activePlayer: m.activePlayer,
      players: m.players.map((p) => ({ name: p.name, score: p.tilesOwned, isBot: p.isBot })),
      winner: m.winner,
      updatedAt: m.updatedAt,
    })),
  });
}

export async function POST(req: NextRequest) {
  try {
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      // Body may be empty
    }

    const mode = body.mode === 'pvp' ? 'pvp' : 'bot';
    const playerName = (body.playerName || (mode === 'bot' ? 'Operator' : 'Player 1')).trim();
    const requestedMatchId = body.matchId?.trim()?.toUpperCase();

    // Check if user is trying to join an existing match
    if (requestedMatchId) {
      const existing = await getMatch(requestedMatchId);
      if (existing) {
        if (existing.status === 'waiting' && existing.mode === 'pvp') {
          // Join as Player 2
          existing.players[1].name = body.playerName || 'Challenger';
          existing.status = 'active';
          existing.history.push({
            turn: existing.turn,
            player: 2,
            action: 'pass',
            text: `${existing.players[1].name} joined as Player 2. Battle initiated!`,
            timestamp: new Date().toISOString(),
          });
          existing.validMoves = getValidMoves(existing, existing.activePlayer);
          await saveMatch(existing);

          return NextResponse.json({
            success: true,
            action: 'joined',
            matchId: existing.id,
            playerIndex: 2,
            mode: existing.mode,
            turn: existing.turn,
            activePlayer: existing.activePlayer,
            state: existing,
          });
        }

        // Return current state of existing match
        return NextResponse.json({
          success: true,
          action: 'connected',
          matchId: existing.id,
          playerIndex: 1,
          mode: existing.mode,
          turn: existing.turn,
          activePlayer: existing.activePlayer,
          state: existing,
        });
      }
    }

    // Create new match
    const matchId = requestedMatchId || generateMatchId();
    const newMatch = createInitialMatch(
      matchId,
      mode,
      playerName,
      mode === 'bot' ? 'A.I. Aegis-9' : 'Waiting for Player 2...'
    );

    await saveMatch(newMatch);

    return NextResponse.json({
      success: true,
      action: 'created',
      matchId: newMatch.id,
      playerIndex: 1,
      mode: newMatch.mode,
      turn: newMatch.turn,
      activePlayer: newMatch.activePlayer,
      state: newMatch,
    });
  } catch (err: any) {
    console.error('[API /api/matches] Error:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
