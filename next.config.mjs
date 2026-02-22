/** @type {import('next').NextConfig} */
const isPages = process.env.GITHUB_PAGES === "true";
const repo = process.env.GITHUB_REPO || "zeruva-aliens-frontend-v2";

const nextConfig = {
  // In dev, React StrictMode intentionally double-invokes effects which triggers
  // multiple Phantom signature popups during login. Disable it for this app.
  reactStrictMode: false,

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

    return [
      {
        // Proxy API requests through the same origin to avoid CORS issues,
        // especially when the frontend is accessed via https tunnels.
        source: "/api/:path*",
        destination: `${backend.replace(/\/+$/, "")}/api/:path*`,
      },
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
