'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import confetti from 'canvas-confetti';
import { sfx } from '@/lib/audio';
import { ActionType, Cell, MatchState, Move } from '@/lib/types';
import { COSTS, PYLON_COORDS } from '@/lib/gameEngine';

export default function GridWarsPage() {
  const [matchState, setMatchState] = useState<MatchState | null>(null);
  const [playerIndex, setPlayerIndex] = useState<1 | 2>(1);
  const [selectedAction, setSelectedAction] = useState<ActionType>('expand');
  const [hoveredCell, setHoveredCell] = useState<{ x: number; y: number } | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [showAgentModal, setShowAgentModal] = useState(false);
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Poll for opponent moves in PvP mode
  useEffect(() => {
    if (!matchState || matchState.winner || matchState.mode !== 'pvp') return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/matches/${matchState.id}`);
        if (res.ok) {
          const data = await res.json();
          if (data.success) {
            setMatchState((prev) => {
              if (!prev) return data;
              // Check if turn or status changed
              if (
                data.turn !== prev.turn ||
                data.activePlayer !== prev.activePlayer ||
                data.winner !== prev.winner ||
                data.status !== prev.status
              ) {
                if (data.winner === playerIndex) {
                  sfx.playVictory();
                  triggerConfetti();
                } else if (data.winner && data.winner !== 'draw') {
                  sfx.playDefeat();
                } else {
                  sfx.playClick();
                }
              }
              return data;
            });
          }
        }
      } catch (err) {
        console.error('Polling error:', err);
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [matchState, playerIndex]);

  const showToastMsg = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const triggerConfetti = () => {
    try {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#06b6d4', '#3b82f6', '#ec4899', '#10b981'],
      });
    } catch {
      // Ignore if confetti fails
    }
  };

  // Start Quick Play vs Bot
  const startBotMatch = async () => {
    setLoading(true);
    sfx.playClick();
    try {
      const res = await fetch('/api/matches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'bot', playerName: 'Operator' }),
      });
      const data = await res.json();
      if (data.success) {
        setMatchState(data.state);
        setPlayerIndex(1);
        setSelectedAction('expand');
        showToastMsg('Match deployed vs A.I. Aegis-9!');
      }
    } catch (err) {
      showToastMsg('Failed to create match.');
    } finally {
      setLoading(false);
    }
  };

  // Host Online PvP Match
  const hostOnlineMatch = async () => {
    setLoading(true);
    sfx.playClick();
    try {
      const res = await fetch('/api/matches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'pvp', playerName: 'Host' }),
      });
      const data = await res.json();
      if (data.success) {
        setMatchState(data.state);
        setPlayerIndex(1);
        setSelectedAction('expand');
        showToastMsg(`Match ${data.matchId} hosted! Share code with opponent.`);
      }
    } catch (err) {
      showToastMsg('Failed to host match.');
    } finally {
      setLoading(false);
    }
  };

  // Join Existing Match
  const joinMatch = async (code: string) => {
    if (!code.trim()) return;
    setLoading(true);
    sfx.playClick();
    try {
      const res = await fetch('/api/matches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matchId: code.trim().toUpperCase(),
          playerName: 'Challenger',
        }),
      });
      const data = await res.json();
      if (data.success) {
        setMatchState(data.state);
        setPlayerIndex(data.playerIndex || 2);
        setSelectedAction('expand');
        showToastMsg(`Joined match ${data.matchId}!`);
      } else {
        showToastMsg(data.error || 'Failed to join match.');
      }
    } catch (err) {
      showToastMsg('Error connecting to match.');
    } finally {
      setLoading(false);
    }
  };

  // Execute Move
  const executeMove = async (action: ActionType, x?: number, y?: number) => {
    if (!matchState || matchState.winner || loading) return;
    if (matchState.activePlayer !== playerIndex) {
      showToastMsg('Wait for your turn!');
      return;
    }

    const currentP = matchState.players[playerIndex - 1];
    const cost = COSTS[action];
    if (currentP.energy < cost) {
      showToastMsg(`Insufficient energy! Need ${cost}⚡ (have ${currentP.energy}⚡).`);
      return;
    }

    setLoading(true);

    // Play appropriate sound effect
    if (action === 'expand') sfx.playExpand();
    else if (action === 'fortify') sfx.playFortify();
    else if (action === 'overcharge') sfx.playOvercharge();
    else if (action === 'emp') sfx.playEMP();
    else sfx.playClick();

    try {
      const res = await fetch(`/api/matches/${matchState.id}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          player: playerIndex,
          action,
          x,
          y,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setMatchState(data.state);
        if (data.winner === playerIndex) {
          sfx.playVictory();
          triggerConfetti();
        } else if (data.winner && data.winner !== 'draw') {
          sfx.playDefeat();
        }
      } else {
        showToastMsg(data.error || 'Invalid move.');
      }
    } catch (err) {
      showToastMsg('Error submitting move.');
    } finally {
      setLoading(false);
    }
  };

  const handleCellClick = (cell: Cell) => {
    if (!matchState || matchState.winner || matchState.activePlayer !== playerIndex) return;

    if (selectedAction === 'pass') {
      executeMove('pass');
      return;
    }

    // Check if cell is a valid target for selectedAction
    const valid = matchState.validMoves.some(
      (m) => m.action === selectedAction && m.x === cell.x && m.y === cell.y
    );

    if (valid) {
      executeMove(selectedAction, cell.x, cell.y);
    } else {
      // If clicking on cell without valid move, alert or switch action intelligently
      if (selectedAction === 'expand' && cell.owner === playerIndex && cell.shield < 4) {
        setSelectedAction('fortify');
        sfx.playClick();
      } else if (
        selectedAction === 'expand' &&
        cell.owner !== 0 &&
        cell.owner !== playerIndex
      ) {
        setSelectedAction('overcharge');
        sfx.playClick();
      } else {
        showToastMsg(`Tile (${cell.x}, ${cell.y}) is not a valid target for ${selectedAction.toUpperCase()}.`);
      }
    }
  };

  const handlePass = () => {
    executeMove('pass');
  };

  const copyMatchCode = () => {
    if (!matchState) return;
    navigator.clipboard.writeText(matchState.id);
    setCopied(true);
    showToastMsg('Match ID copied to clipboard!');
    setTimeout(() => setCopied(false), 2000);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === '1') setSelectedAction('expand');
      if (e.key === '2') setSelectedAction('fortify');
      if (e.key === '3') setSelectedAction('overcharge');
      if (e.key === '4') setSelectedAction('emp');
      if (e.key === ' ' || e.key === 'p') {
        e.preventDefault();
        handlePass();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [matchState, playerIndex]);

  const p1 = matchState?.players[0];
  const p2 = matchState?.players[1];
  const isMyTurn = matchState?.activePlayer === playerIndex && !matchState.winner;

  // Compute controlled pylons
  const p1Pylons =
    matchState?.grid
      ? PYLON_COORDS.filter((p) => matchState.grid[p.y][p.x].owner === 1).length
      : 0;
  const p2Pylons =
    matchState?.grid
      ? PYLON_COORDS.filter((p) => matchState.grid[p.y][p.x].owner === 2).length
      : 0;

  return (
    <div className="min-h-screen bg-[#07090e] text-slate-100 flex flex-col font-sans selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* Toast Notification */}
      {toast && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 bg-slate-900/95 border border-cyan-500/50 text-cyan-300 px-4 py-2 rounded-lg shadow-xl shadow-cyan-950/50 backdrop-blur-md text-sm font-mono flex items-center gap-2 animate-bounce">
          <span className="inline-block w-2 h-2 rounded-full bg-cyan-400 animate-ping"></span>
          {toast}
        </div>
      )}

      {/* Top Navbar */}
      <header className="border-b border-slate-800/80 bg-slate-950/60 backdrop-blur-md px-4 lg:px-8 py-3.5 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center font-bold text-white shadow-lg shadow-cyan-500/20 text-sm tracking-wider">
            GW
          </div>
          <div>
            <h1 className="font-extrabold text-base md:text-lg tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-sky-300 to-blue-400">
              GRIDWARS
            </h1>
            <p className="text-[10px] text-slate-400 tracking-widest font-mono uppercase">
              Agent & Human Strategy Arena
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {matchState && (
            <button
              onClick={copyMatchCode}
              className="px-3 py-1.5 rounded-md bg-slate-900 border border-slate-700 hover:border-cyan-500/60 text-xs font-mono text-cyan-300 flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Click to copy match code"
            >
              <span className="text-slate-400">MATCH:</span>
              <span className="font-bold text-white">{matchState.id}</span>
              <span className="text-[10px]">{copied ? '✓' : '⧉'}</span>
            </button>
          )}

          <button
            onClick={() => setShowAgentModal(true)}
            className="px-3 py-1.5 rounded-md bg-cyan-950/40 border border-cyan-500/40 hover:bg-cyan-900/40 text-cyan-300 text-xs font-mono transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <span className="text-cyan-400">⚡</span>
            <span className="hidden sm:inline">Agent</span> API
          </button>

          <button
            onClick={() => setShowRules(true)}
            className="px-3 py-1.5 rounded-md bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 text-xs font-medium transition-colors cursor-pointer"
          >
            Rules
          </button>

          <button
            onClick={() => {
              const muted = sfx.toggleMute();
              setIsMuted(muted);
            }}
            className="w-8 h-8 rounded-md bg-slate-900 border border-slate-800 hover:border-slate-700 flex items-center justify-center text-slate-300 text-xs transition-colors cursor-pointer"
            title={isMuted ? 'Unmute Audio' : 'Mute Audio'}
          >
            {isMuted ? '🔇' : '🔊'}
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-5 lg:p-6 flex flex-col gap-4">
        {!matchState ? (
          /* Lobby / Welcome Hero */
          <div className="flex-1 flex flex-col items-center justify-center py-10 px-4 max-w-3xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-950/60 border border-cyan-500/30 text-cyan-300 text-xs font-mono mb-6">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
              TEMPO & BASE NETWORK READY • TURN-BASED ARENA
            </div>

            <h2 className="text-3xl sm:text-5xl font-black tracking-tight text-white mb-4">
              Tactical Warfare for{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-sky-300">
                Agents
              </span>{' '}
              and{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-rose-400 to-red-400">
                Humans
              </span>
            </h2>

            <p className="text-slate-400 text-sm sm:text-base max-w-xl mx-auto mb-8 leading-relaxed">
              Expand your power grid across a 7x7 quantum matrix. Control central energy pylons,
              fortify your defenses, unleash Overcharge beams, and deploy EMP shockwaves to destroy
              the enemy Core.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-md mb-8">
              <button
                onClick={startBotMatch}
                disabled={loading}
                className="w-full py-3.5 px-5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 font-semibold text-white shadow-lg shadow-cyan-500/25 transition-all transform hover:-translate-y-0.5 active:translate-y-0 cursor-pointer flex items-center justify-center gap-2"
              >
                <span>⚔️</span>
                <span>Play vs Bot (1-Click)</span>
              </button>

              <button
                onClick={hostOnlineMatch}
                disabled={loading}
                className="w-full py-3.5 px-5 rounded-xl bg-slate-900 border border-slate-700 hover:border-cyan-500 font-semibold text-slate-200 hover:text-white transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <span>🌐</span>
                <span>Host Online Match</span>
              </button>
            </div>

            {/* Join Existing Match Bar */}
            <div className="w-full max-w-md bg-slate-900/60 border border-slate-800 rounded-xl p-3 flex gap-2">
              <input
                type="text"
                placeholder="Enter Match Code (e.g. GW-8F29)"
                value={joinCodeInput}
                onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
              <button
                onClick={() => joinMatch(joinCodeInput)}
                disabled={loading || !joinCodeInput}
                className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-medium text-xs transition-colors cursor-pointer"
              >
                Join
              </button>
            </div>

            {/* Quick Feature Badges */}
            <div className="grid grid-cols-3 gap-3 w-full max-w-lg mt-10 text-left">
              <div className="p-3 rounded-lg bg-slate-950/40 border border-slate-800/80">
                <div className="text-cyan-400 text-lg mb-1">⚡ 0-Auth</div>
                <div className="text-[11px] text-slate-400">
                  No signups or wallets required. Jump straight into tactical play.
                </div>
              </div>
              <div className="p-3 rounded-lg bg-slate-950/40 border border-slate-800/80">
                <div className="text-sky-400 text-lg mb-1">🤖 Agent Ready</div>
                <div className="text-[11px] text-slate-400">
                  Clean REST API & 50-line Python bot client included.
                </div>
              </div>
              <div className="p-3 rounded-lg bg-slate-950/40 border border-slate-800/80">
                <div className="text-rose-400 text-lg mb-1">⏱️ &lt; 5 Mins</div>
                <div className="text-[11px] text-slate-400">
                  30 max fast turns with deep chess-like emergent strategy.
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Active Match Layout */
          <div className="flex-1 flex flex-col lg:flex-row gap-5 items-start">
            {/* Left & Middle Column: HUD + Board + Controls */}
            <div className="flex-1 w-full flex flex-col gap-4">
              {/* Turn Banner & Match Stats */}
              <div className="bg-slate-950/70 border border-slate-800/80 rounded-2xl p-3.5 sm:p-4 flex flex-wrap items-center justify-between gap-3 shadow-lg">
                <div className="flex items-center gap-3">
                  <div
                    className={`px-3 py-1.5 rounded-lg font-mono text-xs font-bold uppercase tracking-wider flex items-center gap-2 ${
                      matchState.winner
                        ? 'bg-amber-950/60 border border-amber-500/50 text-amber-300'
                        : isMyTurn
                        ? 'bg-cyan-950/70 border border-cyan-500/60 text-cyan-300 animate-pulse'
                        : 'bg-rose-950/60 border border-rose-500/50 text-rose-300'
                    }`}
                  >
                    <span
                      className={`w-2 h-2 rounded-full ${
                        matchState.winner
                          ? 'bg-amber-400'
                          : isMyTurn
                          ? 'bg-cyan-400'
                          : 'bg-rose-400'
                      }`}
                    ></span>
                    {matchState.winner
                      ? 'MATCH CONCLUDED'
                      : isMyTurn
                      ? 'YOUR TURN'
                      : `${matchState.players[matchState.activePlayer - 1].name.toUpperCase()}'S TURN`}
                  </div>

                  <span className="text-xs font-mono text-slate-400">
                    TURN <strong className="text-white">{matchState.turn}</strong> / 30
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={startBotMatch}
                    className="text-xs text-slate-400 hover:text-slate-200 px-2.5 py-1 rounded bg-slate-900 border border-slate-800 transition-colors cursor-pointer"
                  >
                    New Game
                  </button>
                  <button
                    onClick={() => setMatchState(null)}
                    className="text-xs text-slate-400 hover:text-rose-300 px-2.5 py-1 rounded bg-slate-900 border border-slate-800 transition-colors cursor-pointer"
                  >
                    Lobby
                  </button>
                </div>
              </div>

              {/* Player Status Cards */}
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                {/* Player 1 Card (Cyan) */}
                <div
                  className={`p-3.5 rounded-xl border transition-all ${
                    matchState.activePlayer === 1
                      ? 'bg-cyan-950/20 border-cyan-500/60 shadow-lg shadow-cyan-950/50'
                      : 'bg-slate-950/40 border-slate-800/80'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-sm shadow-cyan-400"></span>
                      <span className="text-xs sm:text-sm font-bold text-white truncate">
                        {p1?.name} {playerIndex === 1 && '(You)'}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950/60 border border-cyan-500/30 px-1.5 py-0.5 rounded">
                      P1
                    </span>
                  </div>

                  {/* Core HP Bar */}
                  <div className="mb-2">
                    <div className="flex justify-between text-[11px] font-mono mb-1">
                      <span className="text-slate-400">Core HP</span>
                      <span className="font-bold text-cyan-300">{p1?.coreHp} / 10</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-cyan-500 to-sky-400 transition-all duration-300"
                        style={{ width: `${Math.max(0, ((p1?.coreHp || 0) / 10) * 100)}%` }}
                      ></div>
                    </div>
                  </div>

                  {/* Energy Meter */}
                  <div className="flex items-center justify-between text-[11px] font-mono mb-1">
                    <span className="text-slate-400">Energy</span>
                    <span className="font-bold text-amber-300">⚡ {p1?.energy} / 10</span>
                  </div>
                  <div className="flex gap-1 mb-2">
                    {Array.from({ length: 10 }).map((_, i) => (
                      <div
                        key={i}
                        className={`h-2 flex-1 rounded-sm transition-all ${
                          i < (p1?.energy || 0)
                            ? 'bg-amber-400 shadow-sm shadow-amber-400/50'
                            : 'bg-slate-800/80'
                        }`}
                      ></div>
                    ))}
                  </div>

                  <div className="flex justify-between text-[10px] font-mono text-slate-400 pt-1 border-t border-slate-800/60">
                    <span>Tiles: {p1?.tilesOwned}</span>
                    <span>Pylons: {p1Pylons} (+{p1Pylons}⚡)</span>
                  </div>
                </div>

                {/* Player 2 Card (Crimson) */}
                <div
                  className={`p-3.5 rounded-xl border transition-all ${
                    matchState.activePlayer === 2
                      ? 'bg-rose-950/20 border-rose-500/60 shadow-lg shadow-rose-950/50'
                      : 'bg-slate-950/40 border-slate-800/80'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-400 shadow-sm shadow-rose-400"></span>
                      <span className="text-xs sm:text-sm font-bold text-white truncate">
                        {p2?.name} {playerIndex === 2 && '(You)'}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-rose-400 bg-rose-950/60 border border-rose-500/30 px-1.5 py-0.5 rounded">
                      P2
                    </span>
                  </div>

                  {/* Core HP Bar */}
                  <div className="mb-2">
                    <div className="flex justify-between text-[11px] font-mono mb-1">
                      <span className="text-slate-400">Core HP</span>
                      <span className="font-bold text-rose-300">{p2?.coreHp} / 10</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-rose-500 to-red-400 transition-all duration-300"
                        style={{ width: `${Math.max(0, ((p2?.coreHp || 0) / 10) * 100)}%` }}
                      ></div>
                    </div>
                  </div>

                  {/* Energy Meter */}
                  <div className="flex items-center justify-between text-[11px] font-mono mb-1">
                    <span className="text-slate-400">Energy</span>
                    <span className="font-bold text-amber-300">⚡ {p2?.energy} / 10</span>
                  </div>
                  <div className="flex gap-1 mb-2">
                    {Array.from({ length: 10 }).map((_, i) => (
                      <div
                        key={i}
                        className={`h-2 flex-1 rounded-sm transition-all ${
                          i < (p2?.energy || 0)
                            ? 'bg-amber-400 shadow-sm shadow-amber-400/50'
                            : 'bg-slate-800/80'
                        }`}
                      ></div>
                    ))}
                  </div>

                  <div className="flex justify-between text-[10px] font-mono text-slate-400 pt-1 border-t border-slate-800/60">
                    <span>Tiles: {p2?.tilesOwned}</span>
                    <span>Pylons: {p2Pylons} (+{p2Pylons}⚡)</span>
                  </div>
                </div>
              </div>

              {/* 7x7 Battlefield Grid */}
              <div className="bg-slate-950/90 border border-slate-800 rounded-2xl p-3 sm:p-5 shadow-2xl relative overflow-hidden flex flex-col items-center">
                {/* Background grid matrix effect */}
                <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:16px_16px] opacity-25 pointer-events-none"></div>

                <div className="w-full max-w-[500px] aspect-square grid grid-cols-7 gap-1.5 sm:gap-2 relative z-10">
                  {matchState.grid.map((row, y) =>
                    row.map((cell, x) => {
                      const isValidTarget = matchState.validMoves.some(
                        (m) => m.action === selectedAction && m.x === x && m.y === y
                      );

                      const isOwnedByMe = cell.owner === playerIndex;
                      const isEnemy = cell.owner !== 0 && cell.owner !== playerIndex;

                      return (
                        <button
                          key={`${x}-${y}`}
                          onClick={() => handleCellClick(cell)}
                          onMouseEnter={() => setHoveredCell({ x, y })}
                          onMouseLeave={() => setHoveredCell(null)}
                          disabled={!isMyTurn}
                          className={`relative rounded-lg flex flex-col items-center justify-center transition-all duration-150 cursor-pointer select-none group ${
                            cell.owner === 1
                              ? 'bg-cyan-950/40 border-2 border-cyan-500/70 shadow-md shadow-cyan-950/60 hover:border-cyan-300'
                              : cell.owner === 2
                              ? 'bg-rose-950/40 border-2 border-rose-500/70 shadow-md shadow-rose-950/60 hover:border-rose-300'
                              : 'bg-slate-900/60 border border-slate-800/90 hover:border-slate-600'
                          } ${
                            isValidTarget && isMyTurn
                              ? 'ring-2 ring-amber-400/80 ring-offset-1 ring-offset-slate-950 animate-pulse'
                              : ''
                          }`}
                        >
                          {/* Core Citadel Graphic */}
                          {cell.type === 'core' && (
                            <div className="flex flex-col items-center justify-center">
                              <span
                                className={`text-base sm:text-xl font-bold leading-none ${
                                  cell.owner === 1 ? 'text-cyan-400' : 'text-rose-400'
                                }`}
                              >
                                ⬢
                              </span>
                              <span className="text-[8px] font-mono font-bold mt-0.5 text-white/90">
                                {cell.hp}HP
                              </span>
                            </div>
                          )}

                          {/* Quantum Pylon Graphic */}
                          {cell.type === 'pylon' && (
                            <div className="flex flex-col items-center justify-center">
                              <span
                                className={`text-sm sm:text-base font-bold leading-none ${
                                  cell.owner === 0
                                    ? 'text-amber-400 animate-pulse'
                                    : cell.owner === 1
                                    ? 'text-cyan-300'
                                    : 'text-rose-300'
                                }`}
                              >
                                ⚡
                              </span>
                              <span className="text-[8px] font-mono text-slate-400">
                                {cell.owner === 0 ? 'PYLON' : `${cell.hp}HP`}
                              </span>
                            </div>
                          )}

                          {/* Empty Regular Cell */}
                          {cell.type === 'empty' && cell.owner !== 0 && (
                            <div className="text-[9px] font-mono text-white/70">
                              {cell.hp}HP
                            </div>
                          )}

                          {/* Shield Counter Badge */}
                          {cell.shield > 0 && (
                            <div className="absolute -top-1 -right-1 bg-sky-500 text-slate-950 text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center shadow-sm">
                              🛡{cell.shield}
                            </div>
                          )}

                          {/* Coordinates subtle hover overlay */}
                          <span className="absolute bottom-0.5 left-1 text-[7px] font-mono text-slate-600 group-hover:text-slate-400 transition-colors">
                            {x},{y}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>

                {/* Hover Details Preview Footer */}
                <div className="w-full mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs font-mono text-slate-400">
                  <div>
                    {hoveredCell ? (
                      <span>
                        Target: ({hoveredCell.x}, {hoveredCell.y}) •{' '}
                        {matchState.grid[hoveredCell.y][hoveredCell.x].type.toUpperCase()} •
                        Shield:{' '}
                        {matchState.grid[hoveredCell.y][hoveredCell.x].shield}
                      </span>
                    ) : (
                      <span>Hover a tile to view network status</span>
                    )}
                  </div>
                  <div className="text-amber-400">
                    Selected: {selectedAction.toUpperCase()} (Cost: {COSTS[selectedAction]}⚡)
                  </div>
                </div>
              </div>

              {/* Action Command Deck */}
              <div className="bg-slate-950/70 border border-slate-800/80 rounded-2xl p-3 sm:p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-bold text-slate-400 tracking-wider uppercase">
                    Tactical Command Deck
                  </span>
                  <span className="text-[11px] font-mono text-slate-500">
                    Shortcuts: [1] Expand [2] Fortify [3] Overcharge [4] EMP [Space] Pass
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {/* Expand Button */}
                  <button
                    onClick={() => {
                      setSelectedAction('expand');
                      sfx.playClick();
                    }}
                    className={`p-2.5 rounded-xl border flex flex-col items-center justify-center text-center transition-all cursor-pointer ${
                      selectedAction === 'expand'
                        ? 'bg-cyan-950/50 border-cyan-400 text-cyan-200 shadow-md shadow-cyan-950'
                        : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div className="text-base mb-0.5">🌐</div>
                    <div className="text-xs font-bold">EXPAND</div>
                    <div className="text-[10px] font-mono text-amber-400">1⚡ Energy</div>
                  </button>

                  {/* Fortify Button */}
                  <button
                    onClick={() => {
                      setSelectedAction('fortify');
                      sfx.playClick();
                    }}
                    className={`p-2.5 rounded-xl border flex flex-col items-center justify-center text-center transition-all cursor-pointer ${
                      selectedAction === 'fortify'
                        ? 'bg-blue-950/50 border-blue-400 text-blue-200 shadow-md shadow-blue-950'
                        : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div className="text-base mb-0.5">🛡️</div>
                    <div className="text-xs font-bold">FORTIFY</div>
                    <div className="text-[10px] font-mono text-amber-400">2⚡ (+2 Shield)</div>
                  </button>

                  {/* Overcharge Button */}
                  <button
                    onClick={() => {
                      setSelectedAction('overcharge');
                      sfx.playClick();
                    }}
                    className={`p-2.5 rounded-xl border flex flex-col items-center justify-center text-center transition-all cursor-pointer ${
                      selectedAction === 'overcharge'
                        ? 'bg-purple-950/50 border-purple-400 text-purple-200 shadow-md shadow-purple-950'
                        : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div className="text-base mb-0.5">⚡</div>
                    <div className="text-xs font-bold">OVERCHARGE</div>
                    <div className="text-[10px] font-mono text-amber-400">3⚡ (3 DMG)</div>
                  </button>

                  {/* EMP Blast Button */}
                  <button
                    onClick={() => {
                      setSelectedAction('emp');
                      sfx.playClick();
                    }}
                    className={`p-2.5 rounded-xl border flex flex-col items-center justify-center text-center transition-all cursor-pointer ${
                      selectedAction === 'emp'
                        ? 'bg-rose-950/50 border-rose-400 text-rose-200 shadow-md shadow-rose-950'
                        : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div className="text-base mb-0.5">💥</div>
                    <div className="text-xs font-bold">EMP SHOCK</div>
                    <div className="text-[10px] font-mono text-amber-400">4⚡ (3x3 Area)</div>
                  </button>

                  {/* Bank & Pass Button */}
                  <button
                    onClick={handlePass}
                    disabled={!isMyTurn}
                    className="p-2.5 rounded-xl border border-slate-800 bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white flex flex-col items-center justify-center text-center transition-all cursor-pointer disabled:opacity-50"
                  >
                    <div className="text-base mb-0.5">⏭️</div>
                    <div className="text-xs font-bold">BANK / PASS</div>
                    <div className="text-[10px] font-mono text-emerald-400">+2 Income</div>
                  </button>
                </div>
              </div>
            </div>

            {/* Right Column: Tactical Event Log & Match Intelligence */}
            <div className="w-full lg:w-80 flex flex-col gap-4">
              {/* Event Log Box */}
              <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 flex flex-col h-96 shadow-xl">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
                  <span className="text-xs font-mono font-bold text-slate-400 tracking-wider uppercase flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                    Battle Telemetry Log
                  </span>
                  <span className="text-[10px] font-mono text-slate-500">REALTIME</span>
                </div>

                <div className="flex-1 overflow-y-auto space-y-2 pr-1 font-mono text-xs">
                  {matchState.history
                    .slice()
                    .reverse()
                    .map((item, idx) => (
                      <div
                        key={idx}
                        className="p-2 rounded-lg bg-slate-900/50 border border-slate-800/80 text-[11px] leading-relaxed"
                      >
                        <div className="flex justify-between text-[9px] text-slate-500 mb-0.5">
                          <span>TURN {item.turn}</span>
                          <span
                            className={
                              item.player === 1 ? 'text-cyan-400' : 'text-rose-400'
                            }
                          >
                            P{item.player}
                          </span>
                        </div>
                        <p className="text-slate-300">{item.text}</p>
                      </div>
                    ))}
                </div>
              </div>

              {/* Match Objectives Card */}
              <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 text-xs font-mono">
                <h3 className="font-bold text-slate-300 mb-2 uppercase tracking-wider text-[11px]">
                  Victory Conditions
                </h3>
                <ul className="space-y-1.5 text-slate-400 text-[11px]">
                  <li className="flex items-start gap-1.5">
                    <span className="text-cyan-400">1.</span>
                    <span>
                      <strong className="text-white">Core Annihilation:</strong> Reduce enemy Core
                      to 0 HP.
                    </span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <span className="text-cyan-400">2.</span>
                    <span>
                      <strong className="text-white">Grid Domination:</strong> Control 25+ tiles
                      simultaneously.
                    </span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <span className="text-cyan-400">3.</span>
                    <span>
                      <strong className="text-white">Turn 30 Tiebreak:</strong> Most tiles owned
                      when time expires.
                    </span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Rules Modal */}
      {showRules && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-950 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative">
            <button
              onClick={() => setShowRules(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white text-lg font-mono cursor-pointer"
            >
              ✕
            </button>
            <h2 className="text-xl font-bold text-white mb-2 tracking-tight">
              GridWars Tactical Manual
            </h2>
            <div className="space-y-4 text-xs font-sans text-slate-300 leading-relaxed max-h-[70vh] overflow-y-auto pr-1">
              <div className="p-3 rounded-lg bg-cyan-950/30 border border-cyan-500/30 text-cyan-200">
                <strong>One-Paragraph Rules:</strong> GridWars is a 2-player turn-based tactical
                network game played on a 7x7 grid. Each player starts with a Core Node (10 HP) and 3
                Energy, gaining +2 Energy each turn plus bonus Energy from controlled Quantum Pylons
                (center tiles). On your turn, spend Energy to: (1) <strong>Expand</strong> (1⚡) to
                claim an adjacent neutral tile, extending your power grid; (2) <strong>Fortify</strong>{' '}
                (2⚡) to shield an owned tile with +2 Defense; (3) <strong>Overcharge</strong> (3⚡)
                to zap an enemy tile in your grid's line-of-sight for 3 Damage; or (4){' '}
                <strong>EMP Shock</strong> (4⚡) to strip shields, disrupt energy, and deal 1 damage
                across a 3x3 sector. Destroy the opponent's Core or capture 25 tiles before Turn 30
                to claim victory!
              </div>

              <div>
                <h4 className="font-bold text-white mb-1">Actions & Energy Costs:</h4>
                <ul className="list-disc list-inside space-y-1 text-slate-400 font-mono text-[11px]">
                  <li>
                    <strong className="text-cyan-400">Expand (1⚡):</strong> Claim any neutral tile
                    adjacent (up/down/left/right) to your network.
                  </li>
                  <li>
                    <strong className="text-blue-400">Fortify (2⚡):</strong> Add +2 Shield to an
                    owned tile (absorbs incoming damage before HP).
                  </li>
                  <li>
                    <strong className="text-purple-400">Overcharge (3⚡):</strong> Ranged beam
                    dealing 3 Damage to any enemy tile within 2 steps of your grid.
                  </li>
                  <li>
                    <strong className="text-rose-400">EMP Shock (4⚡):</strong> 3x3 blast that
                    strips all enemy shields, deals 1 damage, and steals 1 energy.
                  </li>
                  <li>
                    <strong className="text-emerald-400">Bank & Pass (0⚡):</strong> Take no action
                    and save energy for future turns (max 10 cap).
                  </li>
                </ul>
              </div>

              <div>
                <h4 className="font-bold text-white mb-1">Energy Economy:</h4>
                <p className="text-slate-400">
                  Every turn, you gain a base +2 Energy. Controlling Quantum Pylons (at (3,1), (3,3),
                  and (3,5)) grants an additional +1 Energy per pylon each round!
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Agent API Modal */}
      {showAgentModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-950 border border-slate-800 rounded-2xl max-w-xl w-full p-6 shadow-2xl relative">
            <button
              onClick={() => setShowAgentModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white text-lg font-mono cursor-pointer"
            >
              ✕
            </button>
            <h2 className="text-xl font-bold text-white mb-1 flex items-center gap-2">
              <span className="text-cyan-400">⚡</span> Agent REST API
            </h2>
            <p className="text-xs text-slate-400 mb-4">
              Autonomous AI agents can play GridWars through a lightweight JSON API.
            </p>

            <div className="space-y-3 font-mono text-xs">
              <div className="bg-slate-900 p-3 rounded-lg border border-slate-800">
                <div className="text-slate-400 text-[10px] uppercase mb-1">1. Create or Join Match</div>
                <pre className="text-cyan-300 overflow-x-auto text-[11px]">
                  POST /api/matches{'\n'}
                  {JSON.stringify({ mode: 'bot', playerName: 'MyAIAgent' }, null, 2)}
                </pre>
              </div>

              <div className="bg-slate-900 p-3 rounded-lg border border-slate-800">
                <div className="text-slate-400 text-[10px] uppercase mb-1">2. Read Board & Valid Moves</div>
                <pre className="text-cyan-300 overflow-x-auto text-[11px]">
                  GET /api/matches/{matchState?.id || 'GW-EXAMPLE'}
                </pre>
              </div>

              <div className="bg-slate-900 p-3 rounded-lg border border-slate-800">
                <div className="text-slate-400 text-[10px] uppercase mb-1">3. Submit Move</div>
                <pre className="text-cyan-300 overflow-x-auto text-[11px]">
                  POST /api/matches/{matchState?.id || 'GW-EXAMPLE'}/move{'\n'}
                  {JSON.stringify({ player: 1, action: 'expand', x: 1, y: 0 }, null, 2)}
                </pre>
              </div>

              <div className="bg-cyan-950/40 border border-cyan-500/30 p-2.5 rounded-lg text-[11px] text-cyan-200">
                💡 Run our sample python bot: <code className="text-white">python3 bot.py</code>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Game Over Victory / Defeat Modal */}
      {matchState?.winner && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-950 border border-slate-800 rounded-3xl max-w-md w-full p-6 sm:p-8 text-center shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="text-5xl mb-3">
              {matchState.winner === playerIndex ? '🏆' : matchState.winner === 'draw' ? '⚖️' : '💀'}
            </div>

            <h2 className="text-2xl sm:text-3xl font-black text-white mb-2">
              {matchState.winner === playerIndex
                ? 'VICTORY ACHIEVED'
                : matchState.winner === 'draw'
                ? 'TACTICAL STALEMATE'
                : 'DEFEAT'}
            </h2>

            <p className="text-sm font-mono text-slate-300 mb-6">{matchState.winReason}</p>

            <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-4 mb-6 grid grid-cols-2 gap-3 text-xs font-mono">
              <div>
                <span className="text-slate-400 block">Total Turns</span>
                <strong className="text-white text-base">{matchState.turn}</strong>
              </div>
              <div>
                <span className="text-slate-400 block">Your Territory</span>
                <strong className="text-cyan-300 text-base">
                  {matchState.players[playerIndex - 1]?.tilesOwned} tiles
                </strong>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={startBotMatch}
                className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 font-semibold text-white transition-all cursor-pointer"
              >
                Play Again
              </button>
              <button
                onClick={() => setMatchState(null)}
                className="py-3 px-4 rounded-xl bg-slate-900 border border-slate-700 hover:border-slate-500 text-slate-300 transition-all cursor-pointer"
              >
                Lobby
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
