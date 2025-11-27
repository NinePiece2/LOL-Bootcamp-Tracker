import { defineConfig } from "prisma/config";
import { config } from "dotenv";
import { resolve } from "path";
import { existsSync } from "fs";

// Load .env file from project root if it exists (for local development)
const envPath = resolve(__dirname, "../.env");
if (existsSync(envPath)) {
  config({ path: envPath });
}

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL environment variable is not set");
  console.error("Available environment variables:", Object.keys(process.env).filter(k => k.includes('DB') || k.includes('DATABASE')));
  throw new Error("DATABASE_URL environment variable is not set");
}

console.log("Prisma config loaded with DATABASE_URL");

export default defineConfig({
  datasource: {
    url: databaseUrl,
  },
});
