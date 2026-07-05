# Monte Carlo Tree Search (MCTS) for Game AI

## Algorithm Overview

MCTS finds the best move by simulating thousands of random games from the current position.

### Four Phases (per iteration)

1. **Selection** — Starting from root, pick the most promising child using UCB1 formula until reaching a leaf
2. **Expansion** — Add one untried move as a new child node
3. **Simulation** — Play random moves until game ends (win/lose/draw)
4. **Backpropagation** — Walk back to root, updating win/visit counts

### UCB1 Formula

```
score = (wins / visits) + C * sqrt(ln(parent.visits) / visits)
```

- First term: exploitation (favor winning moves)
- Second term: exploration (favor less-visited moves)
- C = sqrt(2) ≈ 1.41 (exploration weight constant)

## Implementation Details

### Node Structure
- `board[]` — snapshot of board state at this node
- `symbol` — symbol of the player who JUST moved (important for alternation)
- `children[]` — expanded child nodes
- `untriedMoves[]` — moves not yet expanded
- `wins` / `visits` — statistics for UCB1

### Key Design Decisions

- **`_nextSymbol()`** returns the opponent of the node's symbol — the player who will move next
- **Root node** gets `opponentSymbol` as its symbol (since opponent just moved, now it's AI's turn)
- **Backpropagation**: `wins++` for AI wins, `wins--` for opponent wins, neutral for draws
- **Move selection**: Pick child with most visits (not highest win rate) — more robust

### Difficulty via Iteration Count

More iterations = stronger play:

| Difficulty | Iterations | Variance |
|-----------|-----------|----------|
| Easy | 50–150 | High randomness, makes mistakes |
| Medium | 400–600 | Decent play, some blind spots |
| Hard | 1800–2200 | Near-optimal for 3x3 |

### Variance in Difficulty

Use a random range instead of fixed iteration count:
```javascript
var range = DIFFICULTY[level];
var iterations = range.min + Math.floor(Math.random() * (range.max - range.min + 1));
```

This prevents AI from being perfectly predictable at a given difficulty level.

## Learning System (Position Memory)

AI learns from past games using a persistent transposition table.

### How It Works

1. **Position tracking** — during each AI game, every board state is recorded in `positionHistory[]`
2. **Game result recording** — after game ends, `recordGame()` updates memory for all positions:
   - AI won → `wins++` for each position
   - AI lost → `wins--` for each position
   - Draw → only `visits++` (lowers win rate over time)
3. **Node initialization** — when MCTS creates a new node, it checks memory for the board state:
   - If found: `wins` and `visits` are pre-seeded (scaled by `LEARNING_RATE`)
   - If not: starts from zero as before
4. **Persistence** — memory saved to `ai-memory.json` every 30 seconds and on shutdown

### Architecture

```
Game played → positions recorded → game ends → recordGame()
                                                    ↓
                                          updateMemory(board, result)
                                                    ↓
                                          ai-memory.json (persisted)
                                                    ↓
                        Next game → MCTSNode reads memory → biased search
```

### Key Parameters

| Parameter | Value | Purpose |
|-----------|-------|---------|
| `LEARNING_RATE` | 0.8 | How much memory influences initial node values (0-1) |
| `MAX_MEMORY_ENTRIES` | 50,000 | Cap to prevent unbounded growth |
| `MEMORY_SAVE_INTERVAL_MS` | 30,000 | Auto-save frequency |

### Memory Pruning

When memory exceeds `MAX_MEMORY_ENTRIES`, least-visited entries are removed first.
This keeps frequently-seen positions (early game states) while discarding rare ones.

### Board Key Format

Board state serialized as comma-separated string:
```
"O,X,,O,,X,,,O"  →  position with 4 moves played
```

### Effect on Play

- **First few games**: AI plays normally (no memory yet)
- **After ~10 games**: AI avoids positions that led to losses before
- **After ~50+ games**: AI develops strong preferences for winning lines
- **Easy difficulty still beatable**: fewer iterations = memory has less influence on exploration

### Performance Notes

- For 3x3 tic-tac-toe, 2000 iterations runs in ~50ms on modern hardware
- Win sequence generation is cached per node (same board dimensions)
- `board.slice()` for immutable state per node — necessary for tree integrity
- `simulate()` uses in-place mutation of a copied board (no node creation = faster)
- Memory lookup is O(1) hash map — negligible overhead per node creation
