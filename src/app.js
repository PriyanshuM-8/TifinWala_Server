import express from "express";
import cors from "cors";
import authRoutes from "./routes/authRoutes.js";
import chefRoutes from "./routes/chefRoutes.js";
import adminChefRoutes from "./routes/adminChefRoutes.js";
import adminCustomerRoutes from "./routes/adminCustomerRoutes.js";
import { publicCategoryRouter, adminCategoryRouter } from "./routes/categoryRoutes.js";
import chefFoodRoutes from "./routes/chefFoodRoutes.js";
import publicFoodRoutes from "./routes/publicFoodRoutes.js";
import customerAddressRoutes from "./routes/customerAddressRoutes.js";
import publicChefRoutes from "./routes/publicChefRoutes.js";
import discoveryRoutes from "./routes/discoveryRoutes.js";
import cartRoutes from "./routes/cartRoutes.js";
import customerOrderRoutes from "./routes/customerOrderRoutes.js";
import chefOrderRoutes from "./routes/chefOrderRoutes.js";
import customerSubscriptionRoutes from "./routes/customerSubscriptionRoutes.js";
import chefSubscriptionRoutes from "./routes/chefSubscriptionRoutes.js";
import adminSubscriptionRoutes from "./routes/adminSubscriptionRoutes.js";
import customerLoyaltyRoutes from "./routes/customerLoyaltyRoutes.js";
import adminLoyaltyRoutes from "./routes/adminLoyaltyRoutes.js";
import customerWalletRoutes from "./routes/customerWalletRoutes.js";
import chefWalletRoutes from "./routes/chefWalletRoutes.js";
import chefCommissionWalletRoutes from "./routes/chefCommissionWalletRoutes.js";
import adminWalletRoutes from "./routes/adminWalletRoutes.js";
import paymentRoutes from "./routes/paymentRoutes.js";
import webhookRoutes from "./routes/webhookRoutes.js";
import chefPayoutRoutes from "./routes/chefPayoutRoutes.js";
import customerReviewRoutes from "./routes/customerReviewRoutes.js";
import customerComplaintRoutes from "./routes/customerComplaintRoutes.js";
import adminReviewRoutes from "./routes/adminReviewRoutes.js";
import adminComplaintRoutes from "./routes/adminComplaintRoutes.js";
import adminFoodRoutes from "./routes/adminFoodRoutes.js";
import adminOrderRoutes from "./routes/adminOrderRoutes.js";
import adminFinanceRoutes from "./routes/adminFinanceRoutes.js";
import adminTreasuryRoutes from "./routes/adminTreasuryRoutes.js";
import adminBankAccountRoutes from "./routes/adminBankAccountRoutes.js";
import adminWithdrawalRoutes from "./routes/adminWithdrawalRoutes.js";
import adminDashboardRoutes from "./routes/adminDashboardRoutes.js";
import adminReportRoutes from "./routes/adminReportRoutes.js";
import adminSettingRoutes from "./routes/adminSettingRoutes.js";
import adminAuditLogRoutes from "./routes/adminAuditLogRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import { checkMaintenanceMode } from "./middleware/maintenanceMiddleware.js";
import { notFound, errorHandler } from "./middleware/errorMiddleware.js";

const app = express();

// Standard middleware
app.use(cors());
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);
app.use(express.urlencoded({ extended: true }));
app.use(checkMaintenanceMode);

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
app.use("/api/chef/orders", chefOrderRoutes);
app.use("/api/chef/foods", chefFoodRoutes);
app.use("/api/chef", chefRoutes);
app.use("/api/admin/chefs", adminChefRoutes);
app.use("/api/admin/customers", adminCustomerRoutes);
app.use("/api/categories", publicCategoryRouter);
app.use("/api/admin/categories", adminCategoryRouter);
app.use("/api/foods", publicFoodRoutes);
app.use("/api/customer/addresses", customerAddressRoutes);
app.use("/api/customer/cart", cartRoutes);
app.use("/api/customer/orders", customerOrderRoutes);
app.use("/api/customer/subscriptions", customerSubscriptionRoutes);
app.use("/api/chef/subscription-meals", chefSubscriptionRoutes);
app.use("/api/admin/subscriptions", adminSubscriptionRoutes);
app.use("/api/chefs", publicChefRoutes);
app.use("/api/discovery", discoveryRoutes);
app.use("/api/customer/loyalty", customerLoyaltyRoutes);
app.use("/api/admin/loyalty", adminLoyaltyRoutes);
app.use("/api/customer/wallet", customerWalletRoutes);
app.use("/api/chef/wallet", chefWalletRoutes);
app.use("/api/chef/commission-wallet", chefCommissionWalletRoutes);
app.use("/api/admin/wallets", adminWalletRoutes);
app.use("/api/customer/payments", paymentRoutes);
app.use("/api/webhooks", webhookRoutes);
app.use("/api/chef/payouts", chefPayoutRoutes);
app.use("/api/customer/reviews", customerReviewRoutes);
app.use("/api/customer/complaints", customerComplaintRoutes);
app.use("/api/admin/reviews", adminReviewRoutes);
app.use("/api/admin/complaints", adminComplaintRoutes);
app.use("/api/admin/foods", adminFoodRoutes);
app.use("/api/admin/orders", adminOrderRoutes);
app.use("/api/admin/finance", adminFinanceRoutes);
app.use("/api/admin/treasury", adminTreasuryRoutes);
app.use("/api/admin/bank-accounts", adminBankAccountRoutes);
app.use("/api/admin/withdrawals", adminWithdrawalRoutes);
app.use("/api/admin/dashboard", adminDashboardRoutes);
app.use("/api/admin/reports", adminReportRoutes);
app.use("/api/admin/settings", adminSettingRoutes);
app.use("/api/admin/audit-logs", adminAuditLogRoutes);
app.use("/api/notifications", notificationRoutes);

// Centralized error handling
app.use(notFound);
app.use(errorHandler);

export default app;
