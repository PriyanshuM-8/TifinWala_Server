import mongoose from "mongoose";
import ChefProfile from "../Models/ChefProfile.js";
import User from "../Models/User.js";
import Food from "../Models/Food.js";
import Category from "../Models/Category.js";
import Review from "../Models/Review.js";

/**
 * Searches and discovers nearby chefs using MongoDB GeoJSON $geoNear aggregation,
 * or gracefully falls back to city-based filtering when coordinates are omitted.
 *
 * Security & Eligibility Rules:
 * - Admin-approved chef (approvalStatus: "approved")
 * - Active chef account (User.isActive: true)
 * - Valid coordinates (location.coordinates)
 * - Customer location falls strictly within chef's configured service area (distMeters <= serviceRadiusKm * 1000)
 * - At least one active and available food item in stock (availableFoodCount > 0)
 * - Never exposes private kitchen street addresses, emails, phone numbers, or credentials
 * - Returns distanceKm when geospatial calculation is performed
 * - Sorts by distance ascending
 */
export const getNearbyChefs = async (queryParams = {}) => {
  const { lat, lng, maxDistance, city, page = 1, limit = 10 } = queryParams;

  // Validate pagination
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 10));
  const skip = (pageNum - 1) * limitNum;

  const hasLat = lat !== undefined && lat !== null && String(lat).trim() !== "";
  const hasLng = lng !== undefined && lng !== null && String(lng).trim() !== "";

  // 1. Validate coordinates presence
  if ((hasLat && !hasLng) || (!hasLat && hasLng)) {
    const error = new Error("Both latitude (lat) and longitude (lng) must be provided together.");
    error.statusCode = 400;
    throw error;
  }

  // 2. Neither coordinates nor city provided
  if (!hasLat && !hasLng && (!city || !String(city).trim())) {
    const error = new Error(
      "Either geographic coordinates (lat, lng) or a city name must be provided to find nearby chefs."
    );
    error.statusCode = 400;
    throw error;
  }

  // 3. Geospatial search branch (when valid lat & lng are supplied)
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

    let maxDistMeters = 100000; // Allow scanning up to 100km to find chefs within their own radius
    if (maxDistance !== undefined && maxDistance !== null && String(maxDistance).trim() !== "") {
      const parsedMaxDist = Number(maxDistance);
      if (isNaN(parsedMaxDist) || parsedMaxDist <= 0) {
        const error = new Error("Invalid maxDistance: Distance must be a positive number of meters.");
        error.statusCode = 400;
        throw error;
      }
      maxDistMeters = Math.min(100000, parsedMaxDist);
    }

    const geoMatch = {
      approvalStatus: "approved",
      "location.coordinates": { $exists: true, $type: "array", $ne: [] },
    };

    if (city && String(city).trim()) {
      geoMatch.city = { $regex: new RegExp(`^${String(city).trim()}$`, "i") };
    }

    const pipeline = [
      {
        $geoNear: {
          near: {
            type: "Point",
            coordinates: [lngNum, latNum],
          },
          distanceField: "distMeters",
          maxDistance: maxDistMeters,
          spherical: true,
          query: geoMatch,
        },
      },
      // ENFORCE CHEF SERVICE AREA: Customer must fall within the chef's configured service radius
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
      // Lookup available foods for this chef
      {
        $lookup: {
          from: "foods",
          let: { cUserId: "$chefUser._id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$chefId", "$$cUserId"] },
                    { $eq: ["$isActive", true] },
                    { $eq: ["$availability", "available"] },
                    { $gt: ["$availableQuantity", 0] },
                  ],
                },
              },
            },
            {
              $project: {
                _id: 1,
                name: 1,
                price: 1,
                image: 1,
                foodType: 1,
              },
            },
          ],
          as: "availableFoods",
        },
      },
      // ENFORCE AT LEAST ONE ACTIVE & AVAILABLE FOOD ITEM
      {
        $match: {
          "availableFoods.0": { $exists: true },
        },
      },
      // Lookup reviews & ratings
      {
        $lookup: {
          from: "reviews",
          let: { cProfileId: "$_id", cUserId: "$userId" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $or: [
                    { $eq: ["$chefId", "$$cProfileId"] },
                    { $eq: ["$chefId", "$$cUserId"] },
                  ],
                },
              },
            },
            {
              $group: {
                _id: null,
                avgRating: { $avg: "$rating" },
                reviewCount: { $sum: 1 },
              },
            },
          ],
          as: "ratingStats",
        },
      },
      {
        $facet: {
          metadata: [{ $count: "total" }],
          data: [
            { $skip: skip },
            { $limit: limitNum },
            {
              $project: {
                _id: 1,
                chefId: "$_id",
                userId: "$chefUser._id",
                kitchenName: 1,
                ownerName: 1,
                description: 1,
                city: 1,
                cuisineTypes: 1,
                foodCategories: 1,
                kitchenImages: 1,
                serviceRadiusKm: { $ifNull: ["$serviceRadiusKm", 10] },
                distanceKm: { $round: [{ $divide: ["$distMeters", 1000] }, 2] },
                availableFoodCount: { $size: "$availableFoods" },
                sampleFoods: { $slice: ["$availableFoods", 3] },
                rating: {
                  $ifNull: [
                    { $round: [{ $arrayElemAt: ["$ratingStats.avgRating", 0] }, 1] },
                    4.8,
                  ],
                },
                reviewCount: {
                  $ifNull: [{ $arrayElemAt: ["$ratingStats.reviewCount", 0] }, 0],
                },
              },
            },
          ],
        },
      },
    ];

    const result = await ChefProfile.aggregate(pipeline);
    const totalItems = result[0]?.metadata[0]?.total || 0;
    const chefs = result[0]?.data || [];

    return {
      chefs,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(totalItems / limitNum) || (totalItems === 0 ? 0 : 1),
        totalItems,
        limit: limitNum,
      },
    };
  }

  // 4. City-based fallback branch (when coordinates are omitted)
  const trimmedCity = String(city).trim();
  const cityRegex = new RegExp(`^${trimmedCity}$`, "i");

  // Query approved chefs in this city
  const cityQuery = {
    approvalStatus: "approved",
    city: cityRegex,
  };

  const chefProfiles = await ChefProfile.find(cityQuery)
    .populate({
      path: "userId",
      match: { isActive: true },
      select: "_id name isActive",
    })
    .sort({ createdAt: -1 });

  // Filter out any chefs whose User account is inactive
  const activeChefs = chefProfiles.filter((c) => c.userId && c.userId.isActive);

  // Filter only chefs with active available foods
  const eligibleChefs = [];
  for (const profile of activeChefs) {
    const availableFoods = await Food.find({
      chefId: profile.userId._id,
      isActive: true,
      availability: "available",
      availableQuantity: { $gt: 0 },
    })
      .select("_id name price image foodType")
      .limit(3);

    if (availableFoods.length > 0) {
      const reviewStats = await Review.aggregate([
        {
          $match: {
            $or: [{ chefId: profile._id }, { chefId: profile.userId._id }],
          },
        },
        {
          $group: {
            _id: null,
            avgRating: { $avg: "$rating" },
            reviewCount: { $sum: 1 },
          },
        },
      ]);

      const rating =
        reviewStats[0]?.avgRating !== undefined
          ? Number(reviewStats[0].avgRating.toFixed(1))
          : 4.8;
      const reviewCount = reviewStats[0]?.reviewCount || 0;

      eligibleChefs.push({
        _id: profile._id,
        chefId: profile._id,
        userId: profile.userId._id,
        kitchenName: profile.kitchenName,
        ownerName: profile.ownerName,
        description: profile.description,
        city: profile.city,
        cuisineTypes: profile.cuisineTypes,
        foodCategories: profile.foodCategories,
        kitchenImages: profile.kitchenImages,
        serviceRadiusKm: profile.serviceRadiusKm || 10,
        availableFoodCount: availableFoods.length,
        sampleFoods: availableFoods,
        rating,
        reviewCount,
      });
    }
  }

  const totalItems = eligibleChefs.length;
  const paginatedChefs = eligibleChefs.slice(skip, skip + limitNum);

  return {
    chefs: paginatedChefs,
    pagination: {
      currentPage: pageNum,
      totalPages: Math.ceil(totalItems / limitNum) || (totalItems === 0 ? 0 : 1),
      totalItems,
      limit: limitNum,
    },
  };
};

/**
 * Retrieves public profile details of a single approved & active chef.
 */
export const getPublicChefById = async (chefId) => {
  if (!mongoose.Types.ObjectId.isValid(chefId)) {
    const error = new Error("Invalid Chef ID format.");
    error.statusCode = 400;
    throw error;
  }

  // Support lookup by ChefProfile ID or User ID
  const profile = await ChefProfile.findOne({
    $or: [{ _id: chefId }, { userId: chefId }],
  }).populate({
    path: "userId",
    select: "_id name isActive",
  });

  if (!profile || profile.approvalStatus !== "approved" || !profile.userId || !profile.userId.isActive) {
    const error = new Error("Chef kitchen not found or is currently inactive.");
    error.statusCode = 404;
    throw error;
  }

  // Count currently active and available foods in stock
  const activeCategories = await Category.find({ isActive: true }).select("_id");
  const activeCategoryIds = activeCategories.map((c) => c._id);

  const availableFoodCount = await Food.countDocuments({
    chefId: profile.userId._id,
    categoryId: { $in: activeCategoryIds },
    isActive: true,
    availability: "available",
    availableQuantity: { $gt: 0 },
  });

  // Calculate rating stats
  const reviewStats = await Review.aggregate([
    {
      $match: {
        $or: [{ chefId: profile._id }, { chefId: profile.userId._id }],
      },
    },
    {
      $group: {
        _id: null,
        avgRating: { $avg: "$rating" },
        reviewCount: { $sum: 1 },
      },
    },
  ]);

  const rating =
    reviewStats[0]?.avgRating !== undefined
      ? Number(reviewStats[0].avgRating.toFixed(1))
      : 4.8;
  const reviewCount = reviewStats[0]?.reviewCount || 0;

  return {
    chefId: profile._id,
    userId: profile.userId._id,
    kitchenName: profile.kitchenName,
    ownerName: profile.ownerName,
    city: profile.city,
    description: profile.description,
    cuisineTypes: profile.cuisineTypes,
    foodCategories: profile.foodCategories,
    kitchenImages: profile.kitchenImages,
    serviceRadiusKm: profile.serviceRadiusKm || 10,
    availableFoodCount,
    rating,
    reviewCount,
    createdAt: profile.createdAt,
  };
};

/**
 * Retrieves all publicly available foods for a specific approved chef with filters,
 * sorting, and pagination.
 */
export const getPublicFoodsByChefId = async (chefId, queryParams = {}) => {
  if (!mongoose.Types.ObjectId.isValid(chefId)) {
    const error = new Error("Invalid Chef ID format.");
    error.statusCode = 400;
    throw error;
  }

  // Find chef profile by ChefProfile ID or User ID
  const profile = await ChefProfile.findOne({
    $or: [{ _id: chefId }, { userId: chefId }],
  }).populate({
    path: "userId",
    select: "_id name isActive",
  });

  if (!profile || profile.approvalStatus !== "approved" || !profile.userId || !profile.userId.isActive) {
    const error = new Error("Chef kitchen not found or is currently inactive.");
    error.statusCode = 404;
    throw error;
  }

  const {
    category,
    foodType,
    minPrice,
    maxPrice,
    tag,
    search,
    sort,
    page = 1,
    limit = 10,
  } = queryParams;

  // Active categories only
  const activeCategories = await Category.find({ isActive: true }).select("_id slug");
  const activeCategoryIds = activeCategories.map((c) => c._id);

  const query = {
    chefId: profile.userId._id,
    categoryId: { $in: activeCategoryIds },
    isActive: true,
    availability: "available",
    availableQuantity: { $gt: 0 },
  };

  // Category filter by ObjectId or slug
  if (category && String(category).trim()) {
    const cleanCat = String(category).trim();
    if (mongoose.Types.ObjectId.isValid(cleanCat)) {
      query.categoryId = cleanCat;
    } else {
      const catDoc = activeCategories.find((c) => c.slug === cleanCat.toLowerCase());
      if (catDoc) {
        query.categoryId = catDoc._id;
      } else {
        return {
          chef: {
            chefId: profile._id,
            kitchenName: profile.kitchenName,
            city: profile.city,
          },
          foods: [],
          pagination: {
            currentPage: 1,
            totalPages: 0,
            totalItems: 0,
            limit: parseInt(limit, 10) || 10,
          },
        };
      }
    }
  }

  // Veg / non-veg filter
  if (foodType && ["veg", "non_veg"].includes(foodType.toLowerCase())) {
    query.foodType = foodType.toLowerCase();
  }

  // Custom Tag filter
  if (tag && String(tag).trim()) {
    const cleanTag = String(tag).trim().toLowerCase().replace(/\s+/g, "-");
    query.tags = cleanTag;
  }

  // Price range filter
  if (minPrice !== undefined || maxPrice !== undefined) {
    query.price = {};
    if (minPrice !== undefined && !isNaN(Number(minPrice))) {
      query.price.$gte = Number(minPrice);
    }
    if (maxPrice !== undefined && !isNaN(Number(maxPrice))) {
      query.price.$lte = Number(maxPrice);
    }
  }

  // Text search on name or description
  if (search && String(search).trim()) {
    const searchRegex = new RegExp(String(search).trim(), "i");
    query.$or = [{ name: searchRegex }, { description: searchRegex }];
  }

  // Pagination calculation
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 10));
  const skip = (pageNum - 1) * limitNum;

  // Sorting
  const sortMap = {
    price_asc: { price: 1 },
    price_desc: { price: -1 },
    newest: { createdAt: -1 },
  };
  const sortCriteria = sortMap[sort] || { createdAt: -1 };

  const [totalItems, foods] = await Promise.all([
    Food.countDocuments(query),
    Food.find(query)
      .populate("categoryId", "name slug")
      .sort(sortCriteria)
      .skip(skip)
      .limit(limitNum),
  ]);

  const sanitizedFoods = foods.map((f) => ({
    _id: f._id,
    name: f.name,
    description: f.description,
    price: f.price,
    image: f.image,
    foodType: f.foodType,
    preparationTime: f.preparationTime,
    availableQuantity: f.availableQuantity,
    availability: f.availability,
    servingSize: f.servingSize,
    tags: f.tags,
    category: f.categoryId
      ? { _id: f.categoryId._id, name: f.categoryId.name, slug: f.categoryId.slug }
      : null,
    createdAt: f.createdAt,
  }));

  return {
    chef: {
      chefId: profile._id,
      kitchenName: profile.kitchenName,
      ownerName: profile.ownerName,
      city: profile.city,
      description: profile.description,
      cuisineTypes: profile.cuisineTypes,
      foodCategories: profile.foodCategories,
      kitchenImages: profile.kitchenImages,
      serviceRadiusKm: profile.serviceRadiusKm || 10,
    },
    foods: sanitizedFoods,
    pagination: {
      currentPage: pageNum,
      totalPages: Math.ceil(totalItems / limitNum) || (totalItems === 0 ? 0 : 1),
      totalItems,
      limit: limitNum,
    },
  };
};
