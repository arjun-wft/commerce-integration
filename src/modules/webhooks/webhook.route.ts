import {Router} from 'express'
import { handleDirectusWehook , handleMedusaWebhook } from './webhook.controller.js'
import { verifyMedusaSignature } from '../middlewares/verify-medusa.js'
import { verifyDirectusSignature } from '../middlewares/verify-directus.js'
const router = Router()

router.post("/medusa" , verifyMedusaSignature , handleMedusaWebhook)
router.post("/directus" , verifyDirectusSignature , handleDirectusWehook)

export default router