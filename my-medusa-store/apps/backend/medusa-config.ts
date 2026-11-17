
import { loadEnv, defineConfig } from '@medusajs/framework/utils'

loadEnv(process.env.NODE_ENV || 'development', process.cwd())

module.exports = defineConfig({
  projectConfig: {
    http: {
      storeCors: process.env.STORE_CORS!,
      adminCors: process.env.ADMIN_CORS!,
      authCors: process.env.AUTH_CORS!,
      jwtSecret: process.env.JWT_SECRET,
      cookieSecret: process.env.COOKIE_SECRET,
    },

    databaseUrl: process.env.DATABASE_URL,

    redisUrl: process.env.REDIS_URL,

    databaseDriverOptions: {
      connection: {
        ssl: process.env.DATABASE_SSL === 'false'
          ? false
          : { rejectUnauthorized: false },
      },
    },
  },
})
