import {
  getAuthToken,
  getNonce,
  setAuthToken,
  verifySignature,
} from "../api";

// Global auth mutex: multiple components may call ensureAuth() at once (especially on mobile)
// which causes multiple Phantom signature prompts. This guarantees only one login happens.
let authInFlight: Promise<string> | null = null;

export async function ensureAuth(wallet: {
  publicKey?: { toBase58: () => string } | null;
  connected: boolean;
  connect: () => Promise<void>;
  // available on @solana/wallet-adapter-react
  select?: (walletName: string) => void;
  signMessage?: (msg: Uint8Array) => Promise<Uint8Array>;
}) {
  // If we already have a JWT, nothing to do.
  const existing = getAuthToken();
  if (existing) return existing;

  if (authInFlight) return await authInFlight;

  authInFlight = (async () => {
    if (!wallet.connected) {
      try {
        // In new tabs the wallet may not be selected yet. Phantom is the only one we ship here.
        wallet.select?.("Phantom");
        await wallet.connect();
      } catch (e: any) {
        const msg = e?.message || String(e);
        if (/not selected/i.test(msg)) {
          throw new Error("No wallet selected. Click the wallet button and pick Phantom.");
        }
        if (/rejected/i.test(msg)) {
          throw new Error(
            "Connection request was rejected in Phantom. Approve the Phantom popup, then try again."
          );
        }
        throw new Error(msg);
      }
    }

    const walletAddress = wallet.publicKey?.toBase58();
    if (!walletAddress) throw new Error("Wallet not connected");

    if (!wallet.signMessage) {
      throw new Error("Wallet doesn't support signMessage (required for login)");
    }

    const { nonce, message } = await getNonce(walletAddress);
    const msgBytes = new TextEncoder().encode(message);
    const sigBytes = await wallet.signMessage(msgBytes);

    // backend expects base58 signature string
    // Use the base58 encoder already in App.tsx? avoid importing; implement tiny encode here.
    const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    function base58Encode(bytes: Uint8Array): string {
      if (!bytes.length) return "";
      const digits: number[] = [0];
      for (let i = 0; i < bytes.length; i++) {
        let carry = bytes[i];
        for (let j = 0; j < digits.length; j++) {
          const x = digits[j] * 256 + carry;
          digits[j] = x % 58;
          carry = (x / 58) | 0;
        }
        while (carry) {
          digits.push(carry % 58);
          carry = (carry / 58) | 0;
        }
      }
      let zeros = 0;
      while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
      let out = "";
      for (let i = 0; i < zeros; i++) out += "1";
      for (let i = digits.length - 1; i >= 0; i--) out += ALPHABET[digits[i]];
      return out;
    }

    const signature = base58Encode(sigBytes);
    const { token } = await verifySignature(walletAddress, nonce, signature);
    setAuthToken(token, walletAddress);
    return token;
  })();

  try {
    return await authInFlight;
  } finally {
    authInFlight = null;
  }
}
