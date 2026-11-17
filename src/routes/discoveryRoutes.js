import express from "express";
import {
  discoverFoodsHandler,
  getDiscoveryCategoriesHandler,
} from "../controllers/discoveryController.js";

const router = express.Router();

/**
 * Public Food & Category Discovery Endpoints
 * (No Authentication Required)
 */
// 1. Food Discovery with search, category, foodType, price, tags, location & sort
router.get("/foods", discoverFoodsHandler);

// 2. Category Discovery for browsing
router.get("/categories", getDiscoveryCategoriesHandler);

export default router;
