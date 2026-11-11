import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Android shell untuk Business Flow. Aplikasi memuat web yang sama (backend/database/izin sama).
 * `server.url` HARUS diisi pemilik saat build rilis lewat environment build Capacitor
 * (CAP_SERVER_URL) — ini bukan ENV aplikasi runtime dan tidak dibaca oleh server Next.js.
 * Penguncian PIN di background ditangani di src/components/lock-provider.tsx (App.appStateChange).
 */
const config: CapacitorConfig = {
  appId: "id.businessflow.app",
  appName: "Business Flow",
  webDir: "public",
  server: process.env.CAP_SERVER_URL ? { url: process.env.CAP_SERVER_URL, cleartext: false } : undefined,
  android: { allowMixedContent: false },
};

export default config;
