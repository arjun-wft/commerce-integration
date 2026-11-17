import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

export const __filename = fileURLToPath(import.meta.url)
export const __dirname = path.dirname(__filename)

dotenv.config({
    path:path.join(__dirname , '..' , '..' ,'.env')
})

const envConfig = {
    PORT:process.env.PORT || "8000",
    NODE_ENV:process.env.NODE_ENV!,

    AIVEN_HOST:process.env.AIVEN_HOST!,
    AIVEN_CA_PEM:process.env.AIVEN_CA_PEM!,
    AIVEN_MAX_POOL:parseInt(process.env.AIVEN_MAX_POOL!) || 10,
    AIVEN_PORT:parseInt(process.env.AIVEN_PORT!),
    AIVEN_USER:process.env.AIVEN_USER!,
    AIVEN_PASSWORD:process.env.AIVEN_PASSWORD,
    AIVEN_DATABASE:process.env.AIVEN_DATABASE!,
    AIVEN_SSL:process.env.AIVEN_SSL !== 'false',

    MEDUSA_BASE_URL:process.env.MEDUSA_BASE_URL,
    MEDUSA_PUBLISHABLE_KEY:process.env.MEDUSA_PUBLISHABLE_KEY!,
    MEDUSA_SECRET_KEY:process.env.MEDUSA_SECRET_KEY!,

    DIRECTUS_BASE_URL:process.env.DIRECTUS_BASE_URL!,
    DIRECTUS_TOKEN:process.env.DIRECTUS_TOKEN!,

    MEDUSA_WEBHOOK_SECRET:process.env.MEDUSA_WEBHOOK_SECRET,
    DIRECTUS_WEBHOOK_SECRET:process.env.DIRECTUS_WEBHOOK_SECRET,

    REDIS_USERNAME:process.env.REDIS_USERNAME!,
    REDIS_PASSWORD:process.env.REDIS_PASSWORD!,
    REDIS_HOST:process.env.REDIS_HOST!,
    REDIS_PORT:process.env.REDIS_PORT!,
}

export default Object.freeze(envConfig)