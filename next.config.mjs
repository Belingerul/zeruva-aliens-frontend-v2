/** @type {import('next').NextConfig} */
const isPages = process.env.GITHUB_PAGES === "true";
const repo = process.env.GITHUB_REPO || "zeruva-aliens-frontend-v2";

const nextConfig = {
  // In dev, React StrictMode intentionally double-invokes effects which triggers
  // multiple Phantom signature popups during login. Disable it for this app.
  reactStrictMode: false,

  // Hide the Next.js dev overlay/badge (the bottom-corner "Compiling…" + logo).
  // Note: this only hides the indicator. The first-visit compile delay is a
  // dev-only behavior (routes compile on demand); a production build
  // (`next build && next start`) pre-compiles every route, so realm pages open
  // instantly with no "compiling" step.
  devIndicators: false,

  // Turbopack (Next 16 default) is dramatically faster than webpack for dev
  // cold-starts and HMR. An empty/standard config is enough here — the only
  // webpack tweak below (stubbing pino-pretty) is for a walletconnect dep that
  // this app doesn't actually import (only the Phantom adapter is used).
  // `root` pins the workspace so Next stops inferring the wrong dir from a
  // stray lockfile in the home folder.
  turbopack: {
    root: import.meta.dirname,
  },

  // GitHub Pages = static hosting. Next must export a static site.
  ...(isPages
    ? {
        output: "export",
        trailingSlash: true,
        // Pages serves under /<repo>
        basePath: `/${repo}`,
        assetPrefix: `/${repo}/`,
      }
    : {}),

  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },

  async rewrites() {
    // Rewrites only work when you have a running Next server (dev/serverful).
    // On GitHub Pages (static export), the frontend must call the backend directly
    // via NEXT_PUBLIC_API_BASE_URL.
    if (isPages) return [];

    const backend =
      process.env.BACKEND_URL ||
      "https://zeruva-backend-production.up.railway.app";

    const be = backend.replace(/\/+$/, "");
    return [
      {
        // Proxy API requests through the same origin to avoid CORS issues,
        // especially when the frontend is accessed via https tunnels.
        source: "/api/:path*",
        destination: `${be}/api/:path*`,
      },
      // Alien art + NFT metadata live on the backend; proxy them same-origin so
      // images load when the app is opened over a Cloudflare tunnel on a phone.
      { source: "/static/:path*", destination: `${be}/static/:path*` },
      { source: "/nft/:path*", destination: `${be}/nft/:path*` },
    ];
  },

  webpack: (config) => {
    // Some walletconnect deps pull in pino tooling that expects optional deps.
    // We don't need pretty logging in the Next bundles.
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      "pino-pretty": false,
    };
    return config;
  },
};

export default nextConfig;
