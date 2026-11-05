import type { NextConfig } from "next";

/**
 * Export estático: o app roda 100% no navegador (dados externos virão por API/Supabase),
 * o que permite hospedar em PHP/HTML da Hostinger e empacotar com Capacitor (iOS/Android).
 * Cabeçalhos de segurança ficam em public/.htaccess.
 */
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  poweredByHeader: false,
  reactStrictMode: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
