// src/api.ts

export interface Alien {
  id: number;
  alien_id?: number;
  image: string;
  tier?: string;
  roi?: number;
}

export interface SpinResponse {
  tier: "Nothing" | "Common" | "Rare" | "Epic" | "Legendary";
  roi: number; // now absolute dollars per day (0, 2, 5, 8, 10...)
  alien: {
    id: number | null; // null when tier === "Nothing"
    image: string; // always valid URL (custom image for Nothing)
  };
  db_id: number | null; // null when tier === "Nothing"
  serverSignature?: string;
}

export interface Ship {
  level: number;
}

export interface ExpeditionStatus {
  ok?: boolean;
  server_ts?: string;
  expedition_active: boolean;
  expedition_started_at: string | null;
  expedition_ends_at: string | null;
  expedition_planet: string | null;
}

export interface AlienWithStats extends Alien {
  id: number;
  image: string;
  tier: string;
  roi: number;
}

export const getRandomAliens = async (count = 16): Promise<Alien[]> => {
  return await apiRequest<Alien[]>(`/get-random-aliens?count=${count}`);
};

export const spin = async (
  eggType: "basic" | "rare" | "ultra",
): Promise<SpinResponse> => {
  return await apiRequest<SpinResponse>("/spin", {
    method: "POST",
    body: JSON.stringify({ eggType }),
  });
};

export const buyEgg = async (eggType: "basic" | "rare" | "ultra") => {
  return await apiRequest<{
    serialized: string;
    intentId: string;
    amountSol: number;
    lamports: number;
    solUsd: number;
    solUsdSource: string;
    admin: string;
    eggType: "basic" | "rare" | "ultra";
    priceUsd: number;
    expiresAt: string;
  }>("/buy-egg", {
    method: "POST",
    body: JSON.stringify({ eggType }),
  });
};

export const confirmBuyEgg = async (
  eggType: "basic" | "rare" | "ultra",
  signature: string,
  intentId: string,
) => {
  return await apiRequest<{ ok: true; eggType: string; credited: number; signature: string; amountSol: number }>(
    "/confirm-buy-egg",
    {
      method: "POST",
      body: JSON.stringify({ eggType, signature, intentId }),
    },
  );
};

export const confirmBuySpaceship = async (
  level: number,
  signature: string,
  intentId: string,
) => {
  return await apiRequest<{ ok: true; level: number; signature: string }>(
    "/confirm-buy-spaceship",
    {
      method: "POST",
      body: JSON.stringify({ level, signature, intentId }),
    },
  );
};

export const getShip = async (wallet: string): Promise<Ship> => {
  const shipWithSlots = await apiRequest<ShipWithSlots>(`/ship/${wallet}`);
  return { level: shipWithSlots.level };
};

export const getAliens = async (wallet: string): Promise<AlienWithStats[]> => {
  return await apiRequest<AlienWithStats[]>(`/aliens/${wallet}`);
};

export const getUserAliens = getAliens;

export const registerUser = async () => {
  return await apiRequest(`/register`, {
    method: "POST",
    body: JSON.stringify({}),
  });
};

export interface ShipSlot {
  slot_index: number;
  alien: {
    id: number;
    alien_id: number;
    image: string;
    tier: string;
    roi: number;
  } | null;
}

export interface ShipWithSlots {
  level: number;
  maxSlots: number;
  slots: ShipSlot[];
}

export const getShipWithSlots = async (
  wallet: string,
): Promise<ShipWithSlots> => {
  return await apiRequest<ShipWithSlots>(`/ship/${wallet}`);
};

export const assignSlot = async (
  _wallet: string,
  slotIndex: number,
  alienDbId: number,
) => {
  // wallet is derived from the auth token on the backend
  return await apiRequest(`/assign-slot`, {
    method: "POST",
    body: JSON.stringify({ slotIndex, alienDbId }),
  });
};

export const unassignSlot = async (_wallet: string, alienDbId: number) => {
  return await apiRequest(`/unassign-slot`, {
    method: "POST",
    body: JSON.stringify({ alienDbId }),
  });
};

export const upgradeShipLevel = async (wallet: string, newLevel: number) => {
  return await apiRequest(`/upgrade-ship`, {
    method: "POST",
    body: JSON.stringify({ wallet, newLevel }),
  });
};

export const upgradeShip = upgradeShipLevel;

export const getPlanets = async () => {
  return await apiRequest(`/planets`, { method: "GET" });
};

export const getExpeditionStatus = async () => {
  return await apiRequest(`/expedition/status`, { method: "GET" });
};

export const startExpedition = async (planet = "planet-1") => {
  return await apiRequest(`/expedition/start`, {
    method: "POST",
    body: JSON.stringify({ planet }),
  });
};

export const buySpaceship = async (
  wallet: string,
  level: number,
): Promise<{
  serialized: string;
  intentId: string;
  amountSol: number;
  lamports: number;
  solUsd: number;
  solUsdSource: string;
  admin: string;
  level: number;
  priceUsd: number;
  expiresAt: string;
}> => {
  // wallet is derived from the auth token on the backend
  return await apiRequest(`/buy-spaceship`, {
    method: "POST",
    body: JSON.stringify({ wallet, level }),
  });
};

// Configure backend URL via NEXT_PUBLIC_API_BASE_URL.
// Default to same-origin `/api` so Next.js can rewrite to the real backend (see next.config.mjs).
// This avoids browser CORS issues (especially on trycloudflare / Cloudflare Pages).
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "/api";

// ===== Auth token storage =====
const TOKEN_KEY = "zeruva_jwt";
const WALLET_KEY = "zeruva_wallet";

export const AUTH_CHANGED_EVENT = "zeruva_auth_changed";

export function setAuthToken(token: string, wallet: string) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(WALLET_KEY, wallet);
  window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
}

export function clearAuthToken() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(WALLET_KEY);
  window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
}

export function getAuthToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getAuthWallet(): string | null {
  return localStorage.getItem(WALLET_KEY);
}

export async function getNonce(
  wallet: string,
): Promise<{ nonce: string; message: string; ttl_ms: number }> {
  return await apiRequest("/auth/nonce", {
    method: "POST",
    body: JSON.stringify({ wallet }),
  });
}

export async function verifySignature(
  wallet: string,
  nonce: string,
  signature: string,
): Promise<{ token: string }> {
  return await apiRequest("/auth/verify", {
    method: "POST",
    body: JSON.stringify({ wallet, nonce, signature }),
  });
}

export async function apiRequest<T>(
  endpoint: string,
  options?: RequestInit,
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  const token = typeof window !== "undefined" ? getAuthToken() : null;

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options?.headers || {}),
      },
      // If the backend is configured with credentials, this ensures cookies would flow too.
      credentials: "include",
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`API Error: ${response.status} - ${text}`);
    }

    return response.json();
  } catch (err: any) {
    if (err.message === "Failed to fetch" || err.name === "TypeError") {
      throw new Error(
        "Cannot connect to backend. Please configure CORS on your backend.",
      );
    }
    throw err;
  }
}

export { API_BASE_URL };
