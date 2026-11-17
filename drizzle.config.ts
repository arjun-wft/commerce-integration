import "dotenv/config";
import { defineConfig } from "drizzle-kit"
import envConfig from './src/config/env.js'

export default defineConfig({
    schema: "./src/database/schema.ts",

    out: "./src/database/migrations",

    dialect: "postgresql",

    dbCredentials: {
        host: envConfig.AIVEN_HOST,
        port: Number(envConfig.AIVEN_PORT),
        user: envConfig.AIVEN_USER!,
        password: envConfig.AIVEN_PASSWORD!,
        database: envConfig.AIVEN_DATABASE!,
        ssl:envConfig.AIVEN_SSL ? { rejectUnauthorized:false } : false,
    },

    verbose: true,
    strict: true,
})