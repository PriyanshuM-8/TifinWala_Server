import {
  createCategory,
  getAllCategoriesAdmin,
  getActiveCategoriesPublic,
  getCategoryById,
  updateCategory,
  toggleCategoryStatus,
  deleteCategory,
} from "../Services/categoryService.js";

/**
 * POST /api/admin/categories
 * Admin creates a new main category. Supports multipart/form-data with 'image' file or JSON body.
 */
export const createCategoryHandler = async (req, res, next) => {
  try {
    const category = await createCategory({
      ...req.body,
      imageFile: req.file,
    });
    return res.status(201).json({
      success: true,
      message: "Category created successfully.",
      category,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/categories
 * Admin lists all categories (active & inactive) with search, pagination, and food counts.
 */
export const getAllCategoriesAdminHandler = async (req, res, next) => {
  try {
    const result = await getAllCategoriesAdmin(req.query);
    return res.status(200).json({
      success: true,
      count: result.categories.length,
      pagination: result.pagination,
      categories: result.categories,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/categories
 * Public endpoint: Returns all active categories for customers and chefs.
 */
export const getActiveCategoriesPublicHandler = async (req, res, next) => {
  try {
    const categories = await getActiveCategoriesPublic();
    return res.status(200).json({
      success: true,
      count: categories.length,
      categories,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/categories/:id
 * Admin views details of a specific category by ID or slug.
 */
export const getCategoryByIdHandler = async (req, res, next) => {
  try {
    const category = await getCategoryById(req.params.id);
    return res.status(200).json({
      success: true,
      category,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/admin/categories/:id
 * Admin updates a category. Supports multipart/form-data with 'image' file or JSON body.
 */
export const updateCategoryHandler = async (req, res, next) => {
  try {
    const category = await updateCategory(req.params.id, req.body, req.file);
    return res.status(200).json({
      success: true,
      message: "Category updated successfully.",
      category,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/admin/categories/:id/status
 * Admin toggles or sets category isActive status (reactivate or deactivate).
 */
export const toggleCategoryStatusHandler = async (req, res, next) => {
  try {
    const { isActive } = req.body;
    const category = await toggleCategoryStatus(req.params.id, isActive);
    return res.status(200).json({
      success: true,
      message: `Category is now ${category.isActive ? "active" : "inactive"}.`,
      category,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/admin/categories/:id
 * Admin deletes a category (strictly blocked if food items are linked).
 */
export const deleteCategoryHandler = async (req, res, next) => {
  try {
    const result = await deleteCategory(req.params.id);
    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};
