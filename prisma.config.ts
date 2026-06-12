import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // In production (Railway), DATABASE_URL points to the mounted volume.
    // Locally it falls back to the dev file.
    url: process.env.DATABASE_URL ?? "file:./prisma/dev.db",
  },
});
