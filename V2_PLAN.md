# Zeruva v2 — The Great Expedition (spec draft)

## Goal
Create a **new** game loop inspired by ore.supply: many slots, everyone picks one, emissions accrue, one slot wins and takes the pot.
Keep current Zeruva (v1) intact.

## Core entities
- Round
  - id
  - starts_at / ends_at
  - status: open | closed | settled
  - prize_pool_usd (or lamports if SOL)
  - winning_ship_index (0..24)
  - randomness_seed (for auditing)
- Ship slot
  - ship_index 0..24
  - total_entries / total_stake
- Entry
  - wallet
  - round_id
  - ship_index
  - amount (entries or stake)

## Mechanics (v1)
- Fixed **25 ships** per round.
- Player buys **entries** (off-chain credit) via existing payment intent flow.
- Player assigns entries to exactly one ship (can allow split later).
- At round end, backend settles:
  - chooses winning ship (initially: equal probability per ship; later: weighted)
  - distributes prize pool to wallets that chose the ship (pro-rata by entries)

## Randomness
- MVP: server-side seed combining (round_id + server secret + current time) and hash.
- Better: use Solana blockhash/signature as entropy.
- Best: VRF.

## UI
- New panel: “Great Expedition”
  - grid of 25 ships
  - select a ship
  - buy entries
  - show your entries per ship
  - show countdown and last winner.

## Security / anti-spam
- Rate limit entry placement.
- Prevent double settlement.
- Auth required for any wallet-scoped mutation.

