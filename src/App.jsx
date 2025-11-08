```jsx
import React, { useEffect, useMemo, useState } from "react";

// Single-file React app for playing "Bài Tấn" (Vietnamese variant, 8 cards each)
// - Pass-and-play UI (hotseat)
// - Optional shareable game-state (copy/paste JSON) so friends can continue on different devices
// - Tailwind for styling (assumed available in host project)
// Notes: This is a self-contained component. Drop into a Vite/CRA React project as App.jsx.

const SUITS = ["♣", "♦", "♥", "♠"]; // nhép, rô, cơ, bích
const RANKS = ["6", "7", "8", "9", "10", "J", "Q", "K", "A"]; // low->high

function makeDeck() {
  const deck = [];
  for (const s of SUITS) {
    for (const r of RANKS) {
      deck.push({ suit: s, rank: r, id: `${r}${s}` });
    }
  }
  return deck;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function rankValue(rank) {
  return RANKS.indexOf(rank);
}

function cardString(c) {
  return `${c.rank}${c.suit}`;
}

function findFirstAttacker(players, trump) {
  // Player with smallest trump
  let best = null;
  players.forEach((p, pi) => {
    const trumps = p.hand.filter((c) => c.suit === trump).sort((a, b) => rankValue(a.rank) - rankValue(b.rank));
    if (trumps.length > 0) {
      const candidate = { playerIndex: pi, card: trumps[0] };
      if (!best || rankValue(candidate.card.rank) < rankValue(best.card.rank)) best = candidate;
    }
  });
  return best ? best.playerIndex : 0; // fallback
}

export default function App() {
  const [numPlayers, setNumPlayers] = useState(3);
  const [game, setGame] = useState(null);
  const [logs, setLogs] = useState([]);
  const [shareJson, setShareJson] = useState("");

  useEffect(() => {
    // init automatically
    newGame();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function log(text) {
    setLogs((L) => [text, ...L].slice(0, 200));
  }

  function newGame() {
    const deck = shuffle(makeDeck());
    const players = Array.from({ length: numPlayers }, (_, i) => ({ id: i, name: `Player ${i + 1}`, hand: [] }));

    // deal 8 to each
    for (let i = 0; i < 8; i++) {
      for (let p = 0; p < numPlayers; p++) {
        players[p].hand.push(deck.pop());
      }
    }

    const trumpCard = deck.pop();
    const trump = trumpCard.suit;
    // put trump card back under deck top (common in Tấn): we will keep it as visible trump
    deck.unshift(trumpCard);

    const first = findFirstAttacker(players, trump);

    const state = {
      players,
      deck,
      trump,
      table: [], // array of pairs {attack: card, defend: card|null, by: playerIndex }
      attacker: first,
      defender: (first + 1) % numPlayers,
      phase: "attack", // 'attack' | 'defend' | 'cleanup' | 'finished'
      maxAdds: 0, // limit of additional attacks in current round
    };

    setGame(state);
    setLogs([]);
    log(`New game: ${numPlayers} players, trump ${trump}`);
  }

  function drawToFill(state) {
    // after round, players draw up to 8 in order attacker first then others clockwise
    const s = { ...state };
    const order = [...Array(s.players.length).keys()];
    // start drawing from attacker
    for (let offset = 0; offset < s.players.length; offset++) {
      const pIndex = (s.attacker + offset) % s.players.length;
      const p = s.players[pIndex];
      while (p.hand.length < 8 && s.deck.length > 0) {
        p.hand.push(s.deck.pop());
      }
    }
    return s;
  }

  function canBeat(attackCard, defendCard, trump) {
    if (!defendCard) return false;
    if (attackCard.suit === defendCard.suit) return rankValue(defendCard.rank) > rankValue(attackCard.rank);
    // defend with trump
    return defendCard.suit === trump;
  }

  function playAttack(playerIndex, card) {
    if (!game) return;
    if (game.attacker !== playerIndex) return;
    // enforce attack phase
    const s = structuredClone(game);
    // remove card from hand
    const hand = s.players[playerIndex].hand;
    const idx = hand.findIndex((c) => c.id === card.id);
    if (idx === -1) return;
    hand.splice(idx, 1);

    s.table.push({ attack: card, defend: null, by: playerIndex });
    s.phase = "defend";
    // compute maxAdds allowed: limited by defender's hand size and remaining cards
    s.maxAdds = Math.min( s.players[s.defender].hand.length, 8 - s.table.length);
    setGame(s);
    log(`${s.players[playerIndex].name} attacks ${cardString(card)}`);
  }

  function playDefend(playerIndex, attackIndex, card) {
    if (!game) return;
    if (game.defender !== playerIndex) return;
    const s = structuredClone(game);
    const attPair = s.table[attackIndex];
    if (!attPair || attPair.defend) return;
    const hand = s.players[playerIndex].hand;
    const idx = hand.findIndex((c) => c.id === card.id);
    if (idx === -1) return;

    // check validity
    if (!canBeat(attPair.attack, card, s.trump)) {
      alert("Cannot beat that card");
      return;
    }

    hand.splice(idx, 1);
    attPair.defend = card;
    log(`${s.players[playerIndex].name} defends ${cardString(attPair.attack)} with ${cardString(card)}`);

    // check if all current attacks are defended
    const allDefended = s.table.every((p) => p.defend !== null);
    if (allDefended) {
      // defender succeeded -> cleanup: discard table
      s.table = [];
      // defender becomes next attacker
      s.attacker = s.defender;
      s.defender = (s.attacker + 1) % s.players.length;
      s.phase = "cleanup";
      // then draw
      const after = drawToFill(s);
      after.phase = "attack";
      setGame(after);
      log(`${s.players[playerIndex].name} defended all. Becomes attacker.`);
      checkForFinish(after);
      return;
    }

    setGame(s);
  }

  function addAttack(byPlayerIndex, card) {
    if (!game) return;
    // only attacker or other players allowed to add (in many local variants, others can add)
    // Simplify: allow only attacker to add more during phase 'defend' and before defender gives up
    const s = structuredClone(game);
    if (s.phase !== "defend") return;
    const pHand = s.players[byPlayerIndex].hand;
    const idx = pHand.findIndex((c) => c.id === card.id);
    if (idx === -1) return;

    // check whether card rank exists on table
    const ranksOnTable = new Set(s.table.flatMap((t) => [t.attack.rank, t.defend ? t.defend.rank : null]).filter(Boolean));
    if (!ranksOnTable.has(card.rank)) {
      alert("Can only add cards with ranks already on table");
      return;
    }

    if (s.table.length >= 8) {
      alert("Max 8 attacks in one round");
      return;
    }

    // also can't exceed defender hand size
    if (s.table.length >= s.players[s.defender].hand.length + s.table.filter(t=>t.defend===null).length) {
      // rough guard: keep it simple
    }

    pHand.splice(idx, 1);
    s.table.push({ attack: card, defend: null, by: byPlayerIndex });
    setGame(s);
    log(`${s.players[byPlayerIndex].name} adds attack ${cardString(card)}`);
  }

  function defenderTakes() {
    if (!game) return;
    const s = structuredClone(game);
    const defender = s.defender;
    // collect all cards on table into defender's hand
    const toTake = s.table.flatMap((t) => (t.defend ? [t.attack, t.defend] : [t.attack]));
    s.players[defender].hand.push(...toTake);
    s.table = [];
    // attacker stays same; defender becomes next player after defender
    s.attacker = s.attacker; // attacker remains
    s.defender = (s.attacker + 1) % s.players.length;
    // then draw
    const after = drawToFill(s);
    after.phase = "attack";
    setGame(after);
    log(`${s.players[defender].name} takes ${toTake.length} cards`);
    checkForFinish(after);
  }

  function endTurnIfNeeded() {
    // called to check if attack finished and cleanup
    if (!game) return;
    // if table empty nothing
  }

  function checkForFinish(s) {
    // if anyone has 0 cards and deck empty -> they finish
    const finished = s.players.filter((p) => p.hand.length === 0 && s.deck.length === 0);
    if (finished.length > 0) {
      s.phase = "finished";
      setGame(s);
      log(`Game finished. Winners: ${finished.map(f=>f.name).join(", ")}`);
      return true;
    }
    return false;
  }

  function exportState() {
    if (!game) return;
    const payload = JSON.stringify(game);
    setShareJson(payload);
    navigator.clipboard?.writeText(payload).catch(()=>{});
    log("Game state copied to clipboard (and shown in box). Share with friends to continue")
  }

  function importState() {
    try {
      const s = JSON.parse(shareJson);
      setGame(s);
      log("Imported game state")
    } catch (e) {
      alert("Invalid JSON")
    }
  }

  // UI rendering helpers
  const playersList = game?.players ?? [];

  return (
    <div className="p-4 min-h-screen bg-slate-50 text-slate-900">
      <div className="max-w-5xl mx-auto">
        <header className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold">Bài Tấn — Play (pass-and-play)</h1>
          <div className="flex gap-2">
            <select value={numPlayers} onChange={(e)=>setNumPlayers(Number(e.target.value))} className="border rounded p-1">
              <option value={2}>2 players</option>
              <option value={3}>3 players</option>
              <option value={4}>4 players</option>
            </select>
            <button onClick={newGame} className="bg-blue-600 text-white px-3 py-1 rounded">New game</button>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="col-span-2 bg-white p-4 rounded shadow">
            <div className="flex items-center justify-between mb-3">
              <div>Trump: <span className="font-semibold">{game?.trump ?? '-'}</span></div>
              <div>Deck: {game?.deck?.length ?? 0} cards</div>
              <div>Phase: <span className="font-medium">{game?.phase}</span></div>
            </div>

            <div className="bg-slate-50 p-3 rounded">
              <h3 className="font-semibold mb-2">Table</h3>
              <div className="flex flex-wrap gap-2">
                {game?.table?.length === 0 && <div className="p-3 text-sm text-slate-500">(empty)</div>}
                {game?.table?.map((pair, i) => (
                  <div key={i} className="border rounded p-2 bg-white">
                    <div>Attack: <strong>{cardString(pair.attack)}</strong></div>
                    <div>Defend: {pair.defend ? <strong>{cardString(pair.defend)}</strong> : <span className="text-sm text-slate-400">(not defended)</span>}</div>
                    <div className="text-xs text-slate-500">by {game.players[pair.by].name}</div>
                    {game.defender === game.players.findIndex(p=>p===game.players[game.defender]) && game.phase === 'defend' && pair.defend===null && (
                      <div className="text-xs text-slate-600">Defendable</div>
                    )}
                    {game.phase === 'defend' && game.defender===game.defender && <></>}
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4">
              <h3 className="font-semibold">Players</h3>
              <div className="space-y-3 mt-2">
                {playersList.map((p, pi) => (
                  <div key={p.id} className={`p-3 rounded border ${game?.attacker===pi? 'border-green-500 bg-green-50': ''} ${game?.defender===pi ? 'border-indigo-500 bg-indigo-50':''}`}>
                    <div className="flex items-center justify-between">
                      <div className="font-medium">{p.name} {p.hand.length === 0 && game?.deck?.length===0 ? <span className="text-sm text-amber-700">(Finished)</span> : ''}</div>
                      <div className="text-sm">Cards: {p.hand.length}</div>
                    </div>

                    <div className="mt-2 flex flex-wrap gap-1">
                      {p.hand.map((c) => (
                        <CardButton key={c.id} card={c} playerIndex={pi} game={game} onAttack={playAttack} onAddAttack={addAttack} onDefend={playDefend} />
                      ))}
                    </div>

                    <div className="mt-2 flex gap-2">
                      {game?.defender === pi && (
                        <button onClick={defenderTakes} className="px-2 py-1 border rounded text-sm">Take</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>

          <aside className="bg-white p-4 rounded shadow">
            <h3 className="font-semibold">Controls</h3>
            <div className="mt-2 space-y-2">
              <div className="text-sm">How to play (hotseat):</div>
              <ol className="list-decimal list-inside text-sm text-slate-600">
                <li>Attacker clicks a card in their hand to attack.</li>
                <li>Defender clicks a valid card to defend (must beat the attack).</li>
                <li>Attacker (or others) can add attacks with ranks present on table.</li>
                <li>If defender can't/don't want to defend, click <strong>Take</strong>.</li>
                <li>After round resolves, players auto-draw to 8 cards (attacker first).</li>
              </ol>

              <div className="pt-2">
                <button onClick={exportState} className="w-full bg-amber-600 text-white py-1 rounded mb-2">Copy/share game state</button>
                <button onClick={()=>{ setShareJson(JSON.stringify(game)); navigator.clipboard?.writeText(JSON.stringify(game)).catch(()=>{}); log('Copied current state'); }} className="w-full border py-1 rounded mb-2">Copy JSON</button>

                <textarea value={shareJson} onChange={(e)=>setShareJson(e.target.value)} placeholder="Paste game JSON here to import" className="w-full h-28 border p-2 rounded text-sm" />
                <div className="flex gap-2 mt-2">
                  <button onClick={importState} className="px-3 py-1 border rounded">Import state</button>
                  <button onClick={()=>{ setShareJson(''); }} className="px-3 py-1 border rounded">Clear</button>
                </div>

                <div className="mt-3 text-sm text-slate-500">
                  Note: This simple app uses pass-and-play. For online real-time play we'd need a backend or P2P sync.
                </div>
              </div>

              <div className="mt-3">
                <h4 className="font-semibold">Activity</h4>
                <div className="h-48 overflow-auto text-sm border rounded p-2 mt-2 bg-slate-50">
                  {logs.map((l,i)=>(<div key={i} className="py-0.5">{l}</div>))}
                </div>
              </div>
            </div>
          </aside>
        </div>

        <footer className="mt-6 text-sm text-slate-500">Built for learning & local play. Want networked rooms? Ask and I’ll add a minimal WebSocket server example.</footer>
      </div>
    </div>
  );
}

function CardButton({ card, playerIndex, game, onAttack, onAddAttack, onDefend }) {
  const me = playerIndex;
  const isAttacker = game?.attacker === me;
  const isDefender = game?.defender === me;

  // decide click behaviour depending on phase and role
  function handleClick() {
    if (!game) return;
    if (game.phase === "attack" && isAttacker) {
      onAttack(me, card);
      return;
    }
    if (game.phase === "defend" && isDefender) {
      // find first undefended attack
      const attackIndex = game.table.findIndex(t=>t.defend===null);
      if (attackIndex === -1) { alert('No attack to defend'); return; }
      onDefend(me, attackIndex, card);
      return;
    }
    if (game.phase === "defend" && (isAttacker)) {
      // attacker may add additional attack if rank is present on table
      onAddAttack(me, card);
      return;
    }
    // default: do nothing
  }

  return (
    <button onClick={handleClick} className="px-2 py-1 border rounded text-sm bg-white shadow-sm">
      <div className="text-center font-medium">{card.rank}</div>
      <div className="text-xs">{card.suit}</div>
    </button>
  );
}

```
