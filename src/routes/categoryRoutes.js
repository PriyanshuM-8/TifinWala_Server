import express from "express";
import {
  createCategoryHandler,
  getAllCategoriesAdminHandler,
  getActiveCategoriesPublicHandler,
  getCategoryByIdHandler,
  updateCategoryHandler,
  toggleCategoryStatusHandler,
  deleteCategoryHandler,
} from "../controllers/categoryController.js";
import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";
import { handleSingleUpload } from "../middleware/uploadMiddleware.js";

// 1. Public Category Router (/api/categories)
export const publicCategoryRouter = express.Router();
publicCategoryRouter.get("/", getActiveCategoriesPublicHandler);
publicCategoryRouter.get("/:id", getCategoryByIdHandler);

// 2. Admin Category Router (/api/admin/categories)
export const adminCategoryRouter = express.Router();
adminCategoryRouter.use(protect, authorizeRoles("admin"));

adminCategoryRouter.get("/", getAllCategoriesAdminHandler);
adminCategoryRouter.post("/", handleSingleUpload("image"), createCategoryHandler);
adminCategoryRouter.get("/:id", getCategoryByIdHandler);
adminCategoryRouter.put("/:id", handleSingleUpload("image"), updateCategoryHandler);
adminCategoryRouter.patch("/:id/status", toggleCategoryStatusHandler);
adminCategoryRouter.delete("/:id", deleteCategoryHandler);

export default publicCategoryRouter;
