import { NextRequest, NextResponse } from 'next/server';
import { applyMove, runBotTurn } from '@/lib/gameEngine';
import { getMatch, saveMatch } from '@/lib/storage';
import { ActionType } from '@/lib/types';

export async function POST(
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

    if (state.winner || state.status === 'finished') {
      return NextResponse.json(
        {
          success: false,
          error: `Match has finished. Winner: Player ${state.winner}. Reason: ${state.winReason}`,
          state,
        },
        { status: 400 }
      );
    }

    const body = await req.json();
    const player = Number(body.player) as 1 | 2;
    const action = body.action as ActionType;
    const x = body.x !== undefined ? Number(body.x) : undefined;
    const y = body.y !== undefined ? Number(body.y) : undefined;

    if (!player || (player !== 1 && player !== 2)) {
      return NextResponse.json(
        { success: false, error: 'Invalid player index. Must be 1 or 2.' },
        { status: 400 }
      );
    }

    if (!['expand', 'fortify', 'overcharge', 'emp', 'pass'].includes(action)) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid action '${action}'. Allowed: expand, fortify, overcharge, emp, pass.`,
        },
        { status: 400 }
      );
    }

    // Apply player's move
    const { nextState, error } = applyMove(state, { player, action, x, y });

    if (error) {
      return NextResponse.json(
        {
          success: false,
          error,
          activePlayer: state.activePlayer,
          validMoves: state.validMoves,
        },
        { status: 400 }
      );
    }

    state = nextState;

    // If game continues, mode is 'bot', and it is now the Bot's turn (Player 2)
    if (!state.winner && state.mode === 'bot' && state.activePlayer === 2) {
      state = runBotTurn(state);
    }

    // Save updated state
    await saveMatch(state);

    return NextResponse.json({
      success: true,
      matchId: state.id,
      turn: state.turn,
      activePlayer: state.activePlayer,
      winner: state.winner,
      winReason: state.winReason,
      state,
      recentLog: state.history.slice(-5),
    });
  } catch (err: any) {
    console.error('[API /api/matches/:id/move] Error:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
