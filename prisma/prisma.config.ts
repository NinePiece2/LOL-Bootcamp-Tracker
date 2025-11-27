import { defineConfig } from "prisma/config";
import { config } from "dotenv";
import { resolve } from "path";
import { existsSync } from "fs";

// Load .env file from project root if it exists (for local development)
const envPath = resolve(__dirname, "../.env");
if (existsSync(envPath)) {
  config({ path: envPath });
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is not set");
}

export default defineConfig({
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
