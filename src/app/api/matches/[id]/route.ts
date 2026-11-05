import { NextRequest, NextResponse } from 'next/server';
import { runBotTurn } from '@/lib/gameEngine';
import { getMatch, saveMatch } from '@/lib/storage';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const matchId = id.toUpperCase();
    let state = await getMatch(matchId);

    if (!state) {
      return NextResponse.json(
        { success: false, error: `Match '${matchId}' not found.` },
        { status: 404 }
      );
    }

    // If active player is Bot and game active, ensure bot has played
    if (state.mode === 'bot' && state.activePlayer === 2 && !state.winner) {
      state = runBotTurn(state);
      await saveMatch(state);
    }

    return NextResponse.json({
      success: true,
      matchId: state.id,
      status: state.status,
      mode: state.mode,
      turn: state.turn,
      activePlayer: state.activePlayer,
      winner: state.winner,
      winReason: state.winReason,
      players: state.players,
      grid: state.grid,
      validMoves: state.validMoves,
      history: state.history.slice(-20),
      updatedAt: state.updatedAt,
    });
  } catch (err: any) {
    console.error('[API /api/matches/:id] Error:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
