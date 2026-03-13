import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

const nextConfig: NextConfig = {
  output: "export",
  async headers() {
    const connectSrc = [
      "'self'",
      "https://*.googleapis.com",
      "https://*.firebaseio.com",
      "wss://*.firebaseio.com",
      "https://identitytoolkit.googleapis.com",
      "https://merlin-backend-531233742939.southamerica-east1.run.app",
      ...(isDev
        ? ["http://localhost:8000", "ws://localhost:8000"]
        : ["https://api.merlincv.com", "wss://api.merlincv.com"]),
    ].join(" ");

    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin-allow-popups",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(self), geolocation=()",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' https://apis.google.com",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: https://*.googleusercontent.com",
              "font-src 'self'",
              `connect-src ${connectSrc}`,
              "frame-src https://accounts.google.com https://merlincv.com https://merlin-489714.firebaseapp.com https://merlin-489714.web.app https://merlin-489714-staging.web.app",
              "media-src 'self' blob:",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
