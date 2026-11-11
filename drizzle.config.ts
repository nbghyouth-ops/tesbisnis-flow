import "dotenv/config";
import { defineConfig } from "drizzle-kit";

// Satu-satunya variabel environment aplikasi: DATABASE_URL.
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle/migrations",
  dbCredentials: { url: process.env.DATABASE_URL },
});
