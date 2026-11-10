import mongoose from "mongoose";
import CustomerAddress from "../Models/CustomerAddress.js";

/**
 * Executes database operations within a session transaction if supported (replica set),
 * gracefully falling back to sequential atomic operations on standalone MongoDB.
 */
const withTransaction = async (workFn) => {
  let session = null;
  try {
    session = await mongoose.startSession();
    session.startTransaction();
    const result = await workFn(session);
    await session.commitTransaction();
    return result;
  } catch (err) {
    if (session && session.inTransaction()) {
      await session.abortTransaction();
    }

    const isStandaloneError =
      err.code === 20 ||
      (err.message && err.message.toLowerCase().includes("replica set")) ||
      (err.message && err.message.toLowerCase().includes("transaction numbers are only allowed"));

    if (isStandaloneError) {
      return await workFn(null);
    }
    throw err;
  } finally {
    if (session) {
      session.endSession();
    }
  }
};

/**
 * Validates and extracts GeoJSON coordinates.
 * Accepts location object or raw coordinates, ensuring [longitude, latitude] order.
 */
export const parseAndValidateLocation = (data) => {
  let coords = null;

  if (data.location) {
    if (Array.isArray(data.location.coordinates)) {
      coords = data.location.coordinates;
    } else if (
      data.location.longitude !== undefined &&
      data.location.latitude !== undefined
    ) {
      coords = [data.location.longitude, data.location.latitude];
    }
  } else if (Array.isArray(data.coordinates)) {
    coords = data.coordinates;
  } else if (data.longitude !== undefined && data.latitude !== undefined) {
    coords = [data.longitude, data.latitude];
  }

  // Location is optional for manually entered addresses
  if (coords === null || coords === undefined) {
    return undefined;
  }

  if (!Array.isArray(coords) || coords.length !== 2) {
    const error = new Error("Invalid coordinates format: Must be [longitude, latitude].");
    error.statusCode = 400;
    throw error;
  }

  const longitude = Number(coords[0]);
  const latitude = Number(coords[1]);

  if (isNaN(longitude) || isNaN(latitude)) {
    const error = new Error("Invalid coordinates: Longitude and latitude must be valid numbers.");
    error.statusCode = 400;
    throw error;
  }

  if (longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) {
    const error = new Error(
      "Invalid coordinates: Longitude must be between -180 and 180, and latitude between -90 and 90."
    );
    error.statusCode = 400;
    throw error;
  }

  return {
    type: "Point",
    coordinates: [longitude, latitude],
  };
};

/**
 * Validates required address fields, phone number, pincode and address type.
 */
export const validateAddressInput = (data, isUpdate = false) => {
  // Required fields validation on creation
  if (!isUpdate) {
    const missing = [];
    if (!data.fullName || typeof data.fullName !== "string" || !data.fullName.trim()) missing.push("fullName");
    if (!data.phone || typeof data.phone !== "string" || !data.phone.trim()) missing.push("phone");
    if (!data.addressLine || typeof data.addressLine !== "string" || !data.addressLine.trim()) missing.push("addressLine");
    if (!data.city || typeof data.city !== "string" || !data.city.trim()) missing.push("city");
    if (!data.state || typeof data.state !== "string" || !data.state.trim()) missing.push("state");
    if (data.pincode === undefined || data.pincode === null || !String(data.pincode).trim()) missing.push("pincode");

    if (missing.length > 0) {
      const error = new Error(`Missing required fields: ${missing.join(", ")}.`);
      error.statusCode = 400;
      throw error;
    }
  }

  // Validate phone number (10-digit Indian phone with optional +91)
  if (data.phone !== undefined) {
    if (typeof data.phone !== "string") {
      const error = new Error("Phone number must be a valid string.");
      error.statusCode = 400;
      throw error;
    }
    const cleanedPhone = data.phone.trim().replace(/[\s-]/g, "");
    if (!/^(?:\+?91)?[6-9]\d{9}$/.test(cleanedPhone)) {
      const error = new Error("Please provide a valid 10-digit Indian mobile phone number.");
      error.statusCode = 400;
      throw error;
    }
  }

  // Validate pincode (6-digit Indian postal code)
  if (data.pincode !== undefined) {
    const pincodeStr = String(data.pincode).trim();
    if (!/^[1-9][0-9]{5}$/.test(pincodeStr)) {
      const error = new Error("Please provide a valid 6-digit postal pincode.");
      error.statusCode = 400;
      throw error;
    }
  }

  // Validate address type
  if (data.addressType !== undefined) {
    const allowedTypes = ["home", "office", "hostel", "other"];
    const type = String(data.addressType).trim().toLowerCase();
    if (!allowedTypes.includes(type)) {
      const error = new Error(`Invalid addressType '${data.addressType}'. Allowed types: ${allowedTypes.join(", ")}`);
      error.statusCode = 400;
      throw error;
    }
  }
};

/**
 * 1. Creates a customer address.
 * Automatically makes first address default.
 * If made default, automatically unsets any prior default address.
 */
export const createAddress = async (userId, addressData) => {
  // Validate basic address payload
  validateAddressInput(addressData, false);

  // Validate and parse location if provided
  const location = parseAndValidateLocation(addressData);

  // Check how many addresses this customer currently has
  const existingAddressCount = await CustomerAddress.countDocuments({ userId });

  // Rule 8: When the first address is created, automatically make it the default address.
  let isDefault = existingAddressCount === 0 ? true : Boolean(addressData.isDefault);

  return await withTransaction(async (session) => {
    // Rule 7: If selecting as default, remove default status from any previous default address
    if (isDefault && existingAddressCount > 0) {
      await CustomerAddress.updateMany(
        { userId, isDefault: true },
        { isDefault: false },
        session ? { session } : {}
      );
    }

    const newAddress = new CustomerAddress({
      userId, // Strictly assigned from authenticated JWT
      fullName: addressData.fullName.trim(),
      phone: addressData.phone.trim(),
      addressType: addressData.addressType ? addressData.addressType.trim().toLowerCase() : "home",
      addressLine: addressData.addressLine.trim(),
      landmark: addressData.landmark ? addressData.landmark.trim() : "",
      city: addressData.city.trim(),
      state: addressData.state.trim(),
      pincode: String(addressData.pincode).trim(),
      location,
      isDefault,
    });

    const savedAddress = await newAddress.save(session ? { session } : {});
    return savedAddress;
  });
};

/**
 * 2. Retrieves all addresses belonging to the authenticated customer.
 */
export const getAllAddresses = async (userId) => {
  const addresses = await CustomerAddress.find({ userId }).sort({ isDefault: -1, createdAt: -1 });
  return {
    count: addresses.length,
    addresses,
  };
};

/**
 * 3. Retrieves a specific customer address by ID with ownership verification.
 */
export const getAddressById = async (userId, addressId) => {
  if (!mongoose.Types.ObjectId.isValid(addressId)) {
    const error = new Error("Invalid Address ID format.");
    error.statusCode = 400;
    throw error;
  }

  const address = await CustomerAddress.findById(addressId);
  if (!address) {
    const error = new Error("Address not found.");
    error.statusCode = 404;
    throw error;
  }

  // Security Rule: Customer can only view their own addresses
  if (address.userId.toString() !== userId.toString()) {
    const error = new Error("Access denied. You are not authorized to access this address.");
    error.statusCode = 403;
    throw error;
  }

  return address;
};

/**
 * 4. Updates an existing customer address with allowlisted fields and ownership verification.
 */
export const updateAddress = async (userId, addressId, updateData) => {
  if (!mongoose.Types.ObjectId.isValid(addressId)) {
    const error = new Error("Invalid Address ID format.");
    error.statusCode = 400;
    throw error;
  }

  const existingAddress = await CustomerAddress.findById(addressId);
  if (!existingAddress) {
    const error = new Error("Address not found.");
    error.statusCode = 404;
    throw error;
  }

  // Security Rule: Customer can only update their own addresses
  if (existingAddress.userId.toString() !== userId.toString()) {
    const error = new Error("Access denied. You are not authorized to update this address.");
    error.statusCode = 403;
    throw error;
  }

  // Validate allowed fields if present
  validateAddressInput(updateData, true);

  // Allowlist of updatable fields
  const allowedFields = [
    "fullName",
    "phone",
    "addressType",
    "addressLine",
    "landmark",
    "city",
    "state",
    "pincode",
  ];

  for (const field of allowedFields) {
    if (updateData[field] !== undefined) {
      if (typeof updateData[field] === "string") {
        existingAddress[field] = updateData[field].trim();
      } else {
        existingAddress[field] = updateData[field];
      }
    }
  }

  // Normalize addressType lowercase if provided
  if (updateData.addressType) {
    existingAddress.addressType = updateData.addressType.trim().toLowerCase();
  }

  // Location coordinates update
  if (
    updateData.location !== undefined ||
    updateData.coordinates !== undefined ||
    (updateData.longitude !== undefined && updateData.latitude !== undefined)
  ) {
    const parsedLocation = parseAndValidateLocation(updateData);
    existingAddress.location = parsedLocation;
  }

  // Handle isDefault update
  const wantsDefault = updateData.isDefault === true || updateData.isDefault === "true";
  const wantsRemoveDefault = updateData.isDefault === false || updateData.isDefault === "false";

  return await withTransaction(async (session) => {
    if (wantsDefault && !existingAddress.isDefault) {
      // Unset previous default
      await CustomerAddress.updateMany(
        { userId, isDefault: true },
        { isDefault: false },
        session ? { session } : {}
      );
      existingAddress.isDefault = true;
    } else if (wantsRemoveDefault && existingAddress.isDefault) {
      // If customer wants to un-default this address, ensure another address becomes default if available
      const otherAddress = await CustomerAddress.findOne({
        userId,
        _id: { $ne: addressId },
      }).sort({ updatedAt: -1 });

      if (otherAddress) {
        existingAddress.isDefault = false;
        otherAddress.isDefault = true;
        await otherAddress.save(session ? { session } : {});
      }
      // If no other address exists, it remains the only default address
    }

    const updatedAddress = await existingAddress.save(session ? { session } : {});
    return updatedAddress;
  });
};

/**
 * 5. Sets an address as the customer's default address.
 * Automatically removes default status from any other address.
 */
export const setDefaultAddress = async (userId, addressId) => {
  if (!mongoose.Types.ObjectId.isValid(addressId)) {
    const error = new Error("Invalid Address ID format.");
    error.statusCode = 400;
    throw error;
  }

  const address = await CustomerAddress.findById(addressId);
  if (!address) {
    const error = new Error("Address not found.");
    error.statusCode = 404;
    throw error;
  }

  // Security Rule: Customer can only update their own addresses
  if (address.userId.toString() !== userId.toString()) {
    const error = new Error("Access denied. You are not authorized to update this address.");
    error.statusCode = 403;
    throw error;
  }

  // Already default
  if (address.isDefault) {
    return address;
  }

  return await withTransaction(async (session) => {
    // Remove default flag from all other addresses of this customer
    await CustomerAddress.updateMany(
      { userId, isDefault: true },
      { isDefault: false },
      session ? { session } : {}
    );

    address.isDefault = true;
    const updated = await address.save(session ? { session } : {});
    return updated;
  });
};

/**
 * 6. Deletes a customer address.
 * Rule 9: If the default address is deleted and other addresses exist,
 * automatically select another address as default.
 */
export const deleteAddress = async (userId, addressId) => {
  if (!mongoose.Types.ObjectId.isValid(addressId)) {
    const error = new Error("Invalid Address ID format.");
    error.statusCode = 400;
    throw error;
  }

  const address = await CustomerAddress.findById(addressId);
  if (!address) {
    const error = new Error("Address not found.");
    error.statusCode = 404;
    throw error;
  }

  // Security Rule: Customer can only delete their own addresses
  if (address.userId.toString() !== userId.toString()) {
    const error = new Error("Access denied. You are not authorized to delete this address.");
    error.statusCode = 403;
    throw error;
  }

  const wasDefault = address.isDefault;

  return await withTransaction(async (session) => {
    await CustomerAddress.findByIdAndDelete(addressId, session ? { session } : {});

    let newDefaultAddress = null;
    if (wasDefault) {
      // Find another address for this customer to make default (most recently updated/created)
      newDefaultAddress = await CustomerAddress.findOne({ userId }).sort({ updatedAt: -1 });
      if (newDefaultAddress) {
        newDefaultAddress.isDefault = true;
        await newDefaultAddress.save(session ? { session } : {});
      }
    }

    return {
      success: true,
      message: "Address deleted successfully.",
      deletedAddressId: addressId,
      newDefaultAddress: newDefaultAddress
        ? {
            id: newDefaultAddress._id,
            fullName: newDefaultAddress.fullName,
            addressLine: newDefaultAddress.addressLine,
            isDefault: newDefaultAddress.isDefault,
          }
        : null,
    };
  });
};
