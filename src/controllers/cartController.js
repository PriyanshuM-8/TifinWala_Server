import {
  getCustomerCart,
  addItemToCart,
  updateCartItemQuantity,
  removeCartItem,
  clearCart,
} from "../Services/cartService.js";

/**
 * GET /api/customer/cart
 * Customer retrieves their recalculated cart with fresh database prices.
 */
export const getCartHandler = async (req, res, next) => {
  try {
    const cart = await getCustomerCart(req.user._id);
    return res.status(200).json({
      success: true,
      message: "Cart retrieved successfully.",
      cart,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/customer/cart/items
 * Customer adds a dish to their cart.
 */
export const addItemToCartHandler = async (req, res, next) => {
  try {
    const { foodId, quantity } = req.body;
    const cart = await addItemToCart(req.user._id, { foodId, quantity });
    return res.status(200).json({
      success: true,
      message: "Item added to cart successfully.",
      cart,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/customer/cart/items/:foodId
 * Customer updates the quantity of an item in their cart.
 */
export const updateCartItemHandler = async (req, res, next) => {
  try {
    const { foodId } = req.params;
    const { quantity } = req.body;
    const cart = await updateCartItemQuantity(req.user._id, foodId, quantity);
    return res.status(200).json({
      success: true,
      message: "Cart item quantity updated successfully.",
      cart,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/customer/cart/items/:foodId
 * Customer removes a specific dish from their cart.
 */
export const removeCartItemHandler = async (req, res, next) => {
  try {
    const { foodId } = req.params;
    const cart = await removeCartItem(req.user._id, foodId);
    return res.status(200).json({
      success: true,
      message: "Item removed from cart.",
      cart,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/customer/cart
 * Customer clears their entire cart.
 */
export const clearCartHandler = async (req, res, next) => {
  try {
    const cart = await clearCart(req.user._id);
    return res.status(200).json({
      success: true,
      message: "Cart cleared successfully.",
      cart,
    });
  } catch (error) {
    next(error);
  }
};
