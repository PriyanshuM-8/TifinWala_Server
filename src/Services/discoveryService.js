import mongoose from "mongoose";
import Food from "../Models/Food.js";
import Category from "../Models/Category.js";
import User from "../Models/User.js";
import ChefProfile from "../Models/ChefProfile.js";

/**
 * Validates search and filter parameters for public food discovery.
 */
export const validateDiscoveryFilters = (params) => {
  const {
    foodType,
    minPrice,
    maxPrice,
    lat,
    lng,
    maxDistance,
    sort,
  } = params;

  // Validate foodType
  if (foodType && !["veg", "non_veg"].includes(foodType.toLowerCase())) {
    const error = new Error("Invalid foodType filter. Allowed values are 'veg' or 'non_veg'.");
    error.statusCode = 400;
    throw error;
  }

  // Validate price ranges
  if (minPrice !== undefined && minPrice !== null && String(minPrice).trim() !== "") {
    const minVal = Number(minPrice);
    if (isNaN(minVal) || minVal < 0) {
      const error = new Error("Invalid minPrice: Minimum price must be a non-negative number.");
      error.statusCode = 400;
      throw error;
    }
  }

  if (maxPrice !== undefined && maxPrice !== null && String(maxPrice).trim() !== "") {
    const maxVal = Number(maxPrice);
    if (isNaN(maxVal) || maxVal < 0) {
      const error = new Error("Invalid maxPrice: Maximum price must be a non-negative number.");
      error.statusCode = 400;
      throw error;
    }
  }

  if (
    minPrice !== undefined &&
    maxPrice !== undefined &&
    minPrice !== "" &&
    maxPrice !== ""
  ) {
    if (Number(minPrice) > Number(maxPrice)) {
      const error = new Error("Invalid price range: minPrice cannot be greater than maxPrice.");
      error.statusCode = 400;
      throw error;
    }
  }

  // Validate coordinates
  const hasLat = lat !== undefined && lat !== null && String(lat).trim() !== "";
  const hasLng = lng !== undefined && lng !== null && String(lng).trim() !== "";

  if ((hasLat && !hasLng) || (!hasLat && hasLng)) {
    const error = new Error("Both latitude (lat) and longitude (lng) must be provided together for location filtering.");
    error.statusCode = 400;
    throw error;
  }

  if (hasLat && hasLng) {
    const latNum = Number(lat);
    const lngNum = Number(lng);

    if (isNaN(latNum) || isNaN(lngNum)) {
      const error = new Error("Invalid coordinates: Latitude and longitude must be valid numeric values.");
      error.statusCode = 400;
      throw error;
    }

    if (latNum < -90 || latNum > 90) {
      const error = new Error("Invalid latitude: Latitude must be between -90 and 90 degrees.");
      error.statusCode = 400;
      throw error;
    }

    if (lngNum < -180 || lngNum > 180) {
      const error = new Error("Invalid longitude: Longitude must be between -180 and 180 degrees.");
      error.statusCode = 400;
      throw error;
    }

    if (maxDistance !== undefined && maxDistance !== null && String(maxDistance).trim() !== "") {
      const maxDistVal = Number(maxDistance);
      if (isNaN(maxDistVal) || maxDistVal <= 0) {
        const error = new Error("Invalid maxDistance: Distance must be a positive number of meters.");
        error.statusCode = 400;
        throw error;
      }
    }
  }

  // Validate sort option
  if (sort && !["price_asc", "price_desc", "newest", "distance"].includes(sort)) {
    const error = new Error(
      "Invalid sort option. Allowed values are 'price_asc', 'price_desc', 'newest', or 'distance'."
    );
    error.statusCode = 400;
    throw error;
  }

  if (sort === "distance" && (!hasLat || !hasLng)) {
    const error = new Error("Sorting by distance requires valid latitude (lat) and longitude (lng) coordinates.");
    error.statusCode = 400;
    throw error;
  }
};

/**
 * Public Food Discovery Service
 *
 * Supports comprehensive search and filtering:
 * 1. Search food by name and description
 * 2. Filter by category (ObjectId or slug)
 * 3. Filter by veg/non_veg
 * 4. Filter by price range
 * 5. Filter by custom food tags
 * 6. Filter by chef
 * 7. Filter by city
 * 8. Filter by distance (using chef's GeoJSON location)
 * 9. Pagination and sorting
 *
 * Ensures all public business rules:
 * - Food isActive: true
 * - Food availability: "available"
 * - Food availableQuantity > 0
 * - Category isActive: true
 * - Chef approvalStatus: "approved"
 * - Chef User account isActive: true
 * - Never exposes private chef information
 */
export const discoverFoods = async (queryParams = {}) => {
  // Validate all query parameters first
  validateDiscoveryFilters(queryParams);

  const {
    search,
    category,
    foodType,
    minPrice,
    maxPrice,
    tag,
    chefId,
    city,
    lat,
    lng,
    maxDistance,
    sort,
    page = 1,
    limit = 12,
  } = queryParams;

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 12));
  const skip = (pageNum - 1) * limitNum;

  const hasCoordinates =
    lat !== undefined &&
    lng !== undefined &&
    String(lat).trim() !== "" &&
    String(lng).trim() !== "";

  // =========================================================================
  // PATH A: DISTANCE-BASED GEOSPATIAL AGGREGATION (When lat & lng are supplied)
  // =========================================================================
  if (hasCoordinates) {
    const latNum = Number(lat);
    const lngNum = Number(lng);
    const maxDistMeters = maxDistance
      ? Math.min(100000, Number(maxDistance))
      : 10000;

    // 1. Chef Profile criteria
    const chefGeoMatch = {
      approvalStatus: "approved",
      "location.coordinates": { $exists: true, $type: "array", $ne: [] },
    };

    if (city && String(city).trim()) {
      chefGeoMatch.city = { $regex: new RegExp(`^${String(city).trim()}$`, "i") };
    }

    if (chefId && String(chefId).trim()) {
      if (mongoose.Types.ObjectId.isValid(chefId)) {
        chefGeoMatch.$or = [
          { _id: new mongoose.Types.ObjectId(chefId) },
          { userId: new mongoose.Types.ObjectId(chefId) },
        ];
      }
    }

    // 2. Food matching expressions
    const foodMatchConditions = [
      { $eq: ["$chefId", "$$chefUserId"] },
      { $eq: ["$isActive", true] },
      { $eq: ["$availability", "available"] },
      { $gt: ["$availableQuantity", 0] },
      { $in: ["$moderationStatus", ["approved", null]] },
    ];

    if (foodType && ["veg", "non_veg"].includes(foodType.toLowerCase())) {
      foodMatchConditions.push({ $eq: ["$foodType", foodType.toLowerCase()] });
    }

    if (minPrice !== undefined && minPrice !== "" && !isNaN(Number(minPrice))) {
      foodMatchConditions.push({ $gte: ["$price", Number(minPrice)] });
    }

    if (maxPrice !== undefined && maxPrice !== "" && !isNaN(Number(maxPrice))) {
      foodMatchConditions.push({ $lte: ["$price", Number(maxPrice)] });
    }

    if (tag && String(tag).trim()) {
      const cleanTag = String(tag).trim().toLowerCase().replace(/\s+/g, "-");
      foodMatchConditions.push({ $in: [cleanTag, "$tags"] });
    }

    if (search && String(search).trim()) {
      const searchRegex = new RegExp(String(search).trim(), "i");
      foodMatchConditions.push({
        $or: [
          { $regexMatch: { input: "$name", regex: searchRegex } },
          { $regexMatch: { input: "$description", regex: searchRegex } },
        ],
      });
    }

    // Resolve Category ID if specified
    if (category && String(category).trim()) {
      const catVal = String(category).trim();
      if (mongoose.Types.ObjectId.isValid(catVal)) {
        foodMatchConditions.push({
          $eq: ["$categoryId", new mongoose.Types.ObjectId(catVal)],
        });
      } else {
        const catDoc = await Category.findOne({
          slug: catVal.toLowerCase(),
          isActive: true,
        });
        if (catDoc) {
          foodMatchConditions.push({ $eq: ["$categoryId", catDoc._id] });
        } else {
          return {
            foods: [],
            pagination: {
              currentPage: pageNum,
              totalPages: 0,
              totalItems: 0,
              limit: limitNum,
            },
          };
        }
      }
    }

    // Determine Sort stage
    let sortStage = { distanceKm: 1 };
    if (sort === "price_asc") {
      sortStage = { price: 1 };
    } else if (sort === "price_desc") {
      sortStage = { price: -1 };
    } else if (sort === "newest") {
      sortStage = { createdAt: -1 };
    } else if (sort === "distance") {
      sortStage = { distanceKm: 1 };
    }

    const geoPipeline = [
      {
        $geoNear: {
          near: {
            type: "Point",
            coordinates: [lngNum, latNum],
          },
          distanceField: "distMeters",
          maxDistance: maxDistMeters,
          spherical: true,
          query: chefGeoMatch,
        },
      },
      {
        $match: {
          $expr: {
            $lte: [
              "$distMeters",
              { $multiply: [{ $ifNull: ["$serviceRadiusKm", 10] }, 1000] },
            ],
          },
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "chefUser",
        },
      },
      { $unwind: "$chefUser" },
      { $match: { "chefUser.isActive": true } },
      {
        $lookup: {
          from: "foods",
          let: { chefUserId: "$userId", distMeters: "$distMeters", chefDoc: "$$ROOT" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: foodMatchConditions,
                },
              },
            },
          ],
          as: "foods",
        },
      },
      { $unwind: "$foods" },
      {
        $lookup: {
          from: "categories",
          localField: "foods.categoryId",
          foreignField: "_id",
          as: "categoryDoc",
        },
      },
      { $unwind: "$categoryDoc" },
      { $match: { "categoryDoc.isActive": true } },
      {
        $project: {
          _id: "$foods._id",
          name: "$foods.name",
          description: "$foods.description",
          tags: "$foods.tags",
          price: "$foods.price",
          image: "$foods.image",
          foodType: "$foods.foodType",
          preparationTime: "$foods.preparationTime",
          availableQuantity: "$foods.availableQuantity",
          ingredients: "$foods.ingredients",
          servingSize: "$foods.servingSize",
          availability: "$foods.availability",
          category: {
            id: "$categoryDoc._id",
            name: "$categoryDoc.name",
            slug: "$categoryDoc.slug",
          },
          kitchen: {
            chefId: "$_id",
            kitchenName: "$kitchenName",
            ownerName: "$ownerName",
            city: "$city",
            cuisineTypes: "$cuisineTypes",
            rating: { $ifNull: ["$rating", 0] },
            reviewCount: { $ifNull: ["$reviewCount", 0] },
            serviceRadiusKm: { $ifNull: ["$serviceRadiusKm", 10] },
          },
          distanceKm: { $round: [{ $divide: ["$distMeters", 1000] }, 2] },
          createdAt: "$foods.createdAt",
        },
      },
      { $sort: sortStage },
      {
        $facet: {
          metadata: [{ $count: "total" }],
          data: [{ $skip: skip }, { $limit: limitNum }],
        },
      },
    ];

    const result = await ChefProfile.aggregate(geoPipeline);
    const totalItems = result[0]?.metadata[0]?.total || 0;
    const foods = result[0]?.data || [];

    return {
      foods,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(totalItems / limitNum) || (totalItems === 0 ? 0 : 1),
        totalItems,
        limit: limitNum,
      },
    };
  }

  // =========================================================================
  // PATH B: STANDARD EFFICIENT QUERY (When coordinates are NOT supplied)
  // =========================================================================

  // 1. Resolve Active Categories
  const activeCategoriesQuery = { isActive: true };
  if (category && String(category).trim()) {
    const catVal = String(category).trim();
    if (mongoose.Types.ObjectId.isValid(catVal)) {
      activeCategoriesQuery._id = catVal;
    } else {
      activeCategoriesQuery.slug = catVal.toLowerCase();
    }
  }

  const activeCategories = await Category.find(activeCategoriesQuery).select("_id name slug");
  if (activeCategories.length === 0) {
    return {
      foods: [],
      pagination: {
        currentPage: pageNum,
        totalPages: 0,
        totalItems: 0,
        limit: limitNum,
      },
    };
  }
  const eligibleCategoryIds = activeCategories.map((c) => c._id);

  // 2. Resolve Approved & Active Chefs
  const chefFilter = { approvalStatus: "approved" };
  if (city && String(city).trim()) {
    chefFilter.city = { $regex: new RegExp(`^${String(city).trim()}$`, "i") };
  }

  if (chefId && String(chefId).trim()) {
    if (mongoose.Types.ObjectId.isValid(chefId)) {
      chefFilter.$or = [
        { _id: new mongoose.Types.ObjectId(chefId) },
        { userId: new mongoose.Types.ObjectId(chefId) },
      ];
    }
  }

  const approvedProfiles = await ChefProfile.find(chefFilter).select(
    "_id userId kitchenName ownerName city cuisineTypes rating reviewCount serviceRadiusKm"
  );
  if (approvedProfiles.length === 0) {
    return {
      foods: [],
      pagination: {
        currentPage: pageNum,
        totalPages: 0,
        totalItems: 0,
        limit: limitNum,
      },
    };
  }

  const chefUserIds = approvedProfiles.map((p) => p.userId);
  const activeUsers = await User.find({
    _id: { $in: chefUserIds },
    isActive: true,
  }).select("_id");

  const activeUserSet = new Set(activeUsers.map((u) => u._id.toString()));
  const eligibleProfiles = approvedProfiles.filter((p) =>
    activeUserSet.has(p.userId.toString())
  );

  if (eligibleProfiles.length === 0) {
    return {
      foods: [],
      pagination: {
        currentPage: pageNum,
        totalPages: 0,
        totalItems: 0,
        limit: limitNum,
      },
    };
  }

  const eligibleChefUserIds = eligibleProfiles.map((p) => p.userId);
  const profileByUserId = new Map();
  eligibleProfiles.forEach((p) => {
    profileByUserId.set(p.userId.toString(), p);
  });

  // 3. Build Standard Food Query
  const foodQuery = {
    isActive: true,
    availability: "available",
    availableQuantity: { $gt: 0 },
    categoryId: { $in: eligibleCategoryIds },
    chefId: { $in: eligibleChefUserIds },
    moderationStatus: { $in: ["approved", null] },
  };

  if (foodType && ["veg", "non_veg"].includes(foodType.toLowerCase())) {
    foodQuery.foodType = foodType.toLowerCase();
  }

  if (tag && String(tag).trim()) {
    foodQuery.tags = String(tag).trim().toLowerCase().replace(/\s+/g, "-");
  }

  if (minPrice !== undefined || maxPrice !== undefined) {
    foodQuery.price = {};
    if (minPrice !== undefined && minPrice !== "" && !isNaN(Number(minPrice))) {
      foodQuery.price.$gte = Number(minPrice);
    }
    if (maxPrice !== undefined && maxPrice !== "" && !isNaN(Number(maxPrice))) {
      foodQuery.price.$lte = Number(maxPrice);
    }
  }

  if (search && String(search).trim()) {
    foodQuery.name = { $regex: new RegExp(String(search).trim(), "i") };
  }

  // Sorting
  const sortObj = {};
  if (sort === "price_asc") {
    sortObj.price = 1;
  } else if (sort === "price_desc") {
    sortObj.price = -1;
  } else {
    // Default newest
    sortObj.createdAt = -1;
  }

  const totalItems = await Food.countDocuments(foodQuery);
  const foods = await Food.find(foodQuery)
    .populate("categoryId", "name slug")
    .sort(sortObj)
    .skip(skip)
    .limit(limitNum);

  const safeFoods = foods.map((food) => {
    const kitchenProfile = profileByUserId.get(food.chefId.toString());
    return {
      _id: food._id,
      name: food.name,
      description: food.description,
      tags: food.tags,
      price: food.price,
      image: food.image,
      foodType: food.foodType,
      preparationTime: food.preparationTime,
      availableQuantity: food.availableQuantity,
      ingredients: food.ingredients,
      servingSize: food.servingSize,
      availability: food.availability,
      category: food.categoryId
        ? {
            id: food.categoryId._id,
            name: food.categoryId.name,
            slug: food.categoryId.slug,
          }
        : null,
      kitchen: kitchenProfile
        ? {
            chefId: kitchenProfile._id,
            kitchenName: kitchenProfile.kitchenName,
            ownerName: kitchenProfile.ownerName,
            city: kitchenProfile.city,
            cuisineTypes: kitchenProfile.cuisineTypes,
            rating: kitchenProfile.rating || 0,
            reviewCount: kitchenProfile.reviewCount || 0,
            serviceRadiusKm: kitchenProfile.serviceRadiusKm || 10,
          }
        : null,
      createdAt: food.createdAt,
    };
  });

  return {
    foods: safeFoods,
    pagination: {
      currentPage: pageNum,
      totalPages: Math.ceil(totalItems / limitNum) || (totalItems === 0 ? 0 : 1),
      totalItems,
      limit: limitNum,
    },
  };
};

/**
 * Returns all active categories for public discovery.
 */
export const getDiscoveryCategories = async () => {
  const categories = await Category.find({ isActive: true })
    .select("_id name slug description image")
    .sort({ name: 1 });

  return categories;
};
