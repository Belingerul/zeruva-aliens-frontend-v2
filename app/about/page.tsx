import Link from "next/link";

export default function AboutPage() {
  return (
    <div className="min-h-dvh bg-gradient-to-br from-gray-950 via-gray-900 to-black text-gray-100 px-5 py-6">
      <div className="max-w-xl mx-auto">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-extrabold">About Zeruva — The Great Expedition</h1>
          <Link className="text-sm text-cyan-300" href="/">Back</Link>
        </div>

        <div className="mt-4 rounded-2xl border border-gray-800 bg-black/30 p-4">
          <div className="text-sm text-gray-300">
            The Great Expedition is a luck-based PvP pot on Solana: you board ships, the round ends, and one ship wins.
          </div>

          <div className="mt-3 text-sm text-gray-300">
            <span className="font-semibold text-gray-100">Tokenomics:</span> 70% winner bucket, 25% participation bucket,
            5% treasury.
          </div>

          <div className="mt-3 text-sm text-gray-300">
            <span className="font-semibold text-gray-100">Fairness model:</span> weighted ticket selection + commit–reveal
            seed per round.
          </div>

          <div className="mt-3 text-xs text-gray-400">
            Roadmap: move the commit on-chain and integrate a verifiable randomness source (VRF) once the on-chain program
            is deployed.
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-gray-800 bg-black/20 p-4">
          <div className="text-sm font-semibold">Crew & Crossing (planned)</div>
          <div className="text-sm text-gray-300 mt-2">
            Crew loadouts will modify quality-of-life limits (like number of crossings per round or crossing fees) without
            changing the underlying odds.
          </div>
          <div className="text-sm text-gray-300 mt-2">
            Crossing lets you re-route deployed SOL between ships mid-round. It will be rate-limited and closes before the
            final cutoff to prevent last-second sniping.
          </div>
        </div>

        <div className="mt-6 text-xs text-gray-500">
          We won’t claim audits, VRF, or on-chain guarantees until they’re actually shipped.
        </div>
      </div>
    </div>
  );
}
