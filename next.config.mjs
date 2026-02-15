/** @type {import('next').NextConfig} */
const nextConfig = {
  // In dev, React StrictMode intentionally double-invokes effects which triggers
  // multiple Phantom signature popups during login. Disable it for this app.
  reactStrictMode: false,

  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },

  async rewrites() {
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
