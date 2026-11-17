import express from "express";
import {
  getCartHandler,
  addItemToCartHandler,
  updateCartItemHandler,
  removeCartItemHandler,
  clearCartHandler,
} from "../controllers/cartController.js";
import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";

const router = express.Router();

// All cart endpoints require an authenticated customer
router.use(protect, authorizeRoles("customer"));

router.get("/", getCartHandler);
router.delete("/", clearCartHandler);
router.post("/items", addItemToCartHandler);
router.patch("/items/:foodId", updateCartItemHandler);
router.delete("/items/:foodId", removeCartItemHandler);

export default router;
