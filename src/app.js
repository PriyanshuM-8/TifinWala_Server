import express from "express";
import cors from "cors";
import authRoutes from "./routes/authRoutes.js";
import chefRoutes from "./routes/chefRoutes.js";
import adminChefRoutes from "./routes/adminChefRoutes.js";
import { publicCategoryRouter, adminCategoryRouter } from "./routes/categoryRoutes.js";
import chefFoodRoutes from "./routes/chefFoodRoutes.js";
import publicFoodRoutes from "./routes/publicFoodRoutes.js";
import customerAddressRoutes from "./routes/customerAddressRoutes.js";
import { notFound, errorHandler } from "./middleware/errorMiddleware.js";

const app = express();

// Standard middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Root health & branding check endpoint
app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    application: "GharKaSwad",
    tagline: "Ghar ka khana, apno jaisa sukoon.",
    status: "Service is active and healthy",
  });
});

// Application Routes
app.use("/api/auth", authRoutes);
app.use("/api/chef/foods", chefFoodRoutes);
app.use("/api/chef", chefRoutes);
app.use("/api/admin/chefs", adminChefRoutes);
app.use("/api/categories", publicCategoryRouter);
app.use("/api/admin/categories", adminCategoryRouter);
app.use("/api/foods", publicFoodRoutes);
app.use("/api/customer/addresses", customerAddressRoutes);

// Centralized error handling
app.use(notFound);
app.use(errorHandler);

export default app;
