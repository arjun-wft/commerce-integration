import { Router } from "express"
import { getAllProducts , getAllVariants, getAllVariantsOfProduct, getAllWebhooks, getOneProduct, getVariant, runSync } from "./search.controller.js"
const router = Router()

router.get('/products' , getAllProducts)
router.get('/product/:productId' , getOneProduct)

router.get('/variants/:productId' , getAllVariantsOfProduct)
router.get('/variants' , getAllVariants)
router.get('/variants/:variantId/:productId' , getVariant)
router.get('/sync' , runSync)

router.get('/webhooks' , getAllWebhooks)
export default router