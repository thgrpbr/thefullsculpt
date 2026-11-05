import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

/**
 * Produção: export estático (app roda no navegador; API PHP/MySQL em /api na Hostinger).
 * Desenvolvimento: /api é repassado ao servidor PHP local (php -S 127.0.0.1:8081 scripts/dev-api.php).
 * Cabeçalhos de segurança de produção ficam em public/.htaccess.
 */
const nextConfig: NextConfig = {
  ...(isProd ? { output: "export" as const } : {}),
  trailingSlash: true,
  images: { unoptimized: true },
  poweredByHeader: false,
  reactStrictMode: true,
  ...(isProd
    ? {}
    : {
        async rewrites() {
          return [{ source: "/api/:path*", destination: "http://127.0.0.1:8081/api/:path*" }];
        },
      }),
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
