import {
  createAddress,
  getAllAddresses,
  getAddressById,
  updateAddress,
  setDefaultAddress,
  deleteAddress,
} from "../Services/addressService.js";

/**
 * POST /api/customer/addresses
 * Authenticated customer creates a new delivery address.
 */
export const createAddressHandler = async (req, res, next) => {
  try {
    const address = await createAddress(req.user._id, req.body);
    return res.status(201).json({
      success: true,
      message: "Customer address created successfully.",
      address,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/customer/addresses
 * Retrieves all delivery addresses belonging to the authenticated customer.
 */
export const getAllAddressesHandler = async (req, res, next) => {
  try {
    const result = await getAllAddresses(req.user._id);
    return res.status(200).json({
      success: true,
      count: result.count,
      addresses: result.addresses,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/customer/addresses/:id
 * Retrieves a single customer address by its ID.
 */
export const getAddressByIdHandler = async (req, res, next) => {
  try {
    const address = await getAddressById(req.user._id, req.params.id);
    return res.status(200).json({
      success: true,
      address,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/customer/addresses/:id
 * Updates an existing address of the authenticated customer.
 */
export const updateAddressHandler = async (req, res, next) => {
  try {
    const address = await updateAddress(req.user._id, req.params.id, req.body);
    return res.status(200).json({
      success: true,
      message: "Customer address updated successfully.",
      address,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/customer/addresses/:id/default
 * Sets the specified address as the customer's default address.
 */
export const setDefaultAddressHandler = async (req, res, next) => {
  try {
    const address = await setDefaultAddress(req.user._id, req.params.id);
    return res.status(200).json({
      success: true,
      message: "Default address updated successfully.",
      address,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/customer/addresses/:id
 * Deletes an address belonging to the authenticated customer.
 * If the deleted address was default, another existing address automatically becomes default.
 */
export const deleteAddressHandler = async (req, res, next) => {
  try {
    const result = await deleteAddress(req.user._id, req.params.id);
    return res.status(200).json({
      success: true,
      message: result.message,
      deletedAddressId: result.deletedAddressId,
      newDefaultAddress: result.newDefaultAddress,
    });
  } catch (error) {
    next(error);
  }
};
