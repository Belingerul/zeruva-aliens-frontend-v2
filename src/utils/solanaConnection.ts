import { Connection, type Commitment } from "@solana/web3.js";

/**
 * Single source of truth for the client-side Solana RPC connection.
 *
 * SECURITY: this value is shipped to every browser (anything read here ends up
 * in the JS bundle), so NEXT_PUBLIC_RPC_URL must NEVER contain an API key.
 * Keep keyed/paid endpoints (e.g. Helius) on the BACKEND only. For production
 * with a keyed provider, point this at a backend RPC proxy that injects the key
 * server-side instead of putting the key here.
 *
 * Default is the public devnet endpoint, which has no key and is safe to expose.
 */
export const RPC_HTTP_URL =
  process.env.NEXT_PUBLIC_RPC_URL || "https://api.devnet.solana.com";

/** Build a Connection from the shared endpoint. */
export function getConnection(commitment: Commitment = "confirmed"): Connection {
  return new Connection(RPC_HTTP_URL, commitment);
}
