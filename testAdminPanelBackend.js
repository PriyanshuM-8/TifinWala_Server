import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import connectDB from "./src/Config/db.js";
import User from "./src/Models/User.js";
import { getDashboardOverview } from "./src/Services/adminDashboardService.js";
import {
  getOrderReport,
  getRevenueReport,
  getChefReport,
  getCustomerReport,
  getSubscriptionReport,
} from "./src/Services/adminReportService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, ".env") });

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const CYAN = "\x1b[36m";
const RESET = "\x1b[0m";

let passCount = 0;
let failCount = 0;

function assert(condition, testNumber, description) {
  if (condition) {
    console.log(`  ${GREEN}✓ [PASS]${RESET} Test ${testNumber}: ${description}`);
    passCount++;
  } else {
    console.error(`  ${RED}✗ [FAIL]${RESET} Test ${testNumber}: ${description}`);
    failCount++;
  }
}

async function runTests() {
  console.log(`\n${CYAN}======================================================================${RESET}`);
  console.log(`${CYAN}   GharKaSwad - Admin Panel Analytics & Reporting Test Suite          ${RESET}`);
  console.log(`${CYAN}======================================================================${RESET}\n`);

  try {
    await connectDB();

    // Test 1: Verify Admin User exists
    const adminUser = await User.findOne({ role: "admin" });
    assert(
      adminUser !== null && adminUser.role === "admin",
      1,
      `Administrator account exists in database (Email: ${adminUser?.email || "none"})`
    );

    // Test 2: getDashboardOverview executes and returns complete segregated metrics
    const overview = await getDashboardOverview();
    assert(
      overview &&
        overview.customers?.total !== undefined &&
        overview.chefs?.total !== undefined &&
        overview.orders?.total !== undefined &&
        overview.finance?.platformRevenue !== undefined &&
        overview.finance?.collections !== undefined,
      2,
      "getDashboardOverview returns customers, chefs, orders, subscriptions, and segregated ledger"
    );

    // Test 3: getOrderReport returns timeline and method distribution
    const orderReport = await getOrderReport();
    assert(
      orderReport &&
        Array.isArray(orderReport.timeline) &&
        Array.isArray(orderReport.byPaymentMethod),
      3,
      "getOrderReport returns timeline array and byPaymentMethod aggregation"
    );

    // Test 4: getRevenueReport returns segregated revenue, collections and daily timeline
    const revenueReport = await getRevenueReport();
    assert(
      revenueReport &&
        revenueReport.revenue?.commissionRevenue !== undefined &&
        revenueReport.collections?.grossCustomerCollections !== undefined &&
        Array.isArray(revenueReport.timeline),
      4,
      "getRevenueReport returns segregated commission, collections, and daily ledger timeline"
    );

    // Test 5: getChefReport returns topChefs and registration timeline
    const chefReport = await getChefReport();
    assert(
      chefReport &&
        Array.isArray(chefReport.topChefs) &&
        Array.isArray(chefReport.registrationTimeline),
      5,
      "getChefReport returns topChefs and registrationTimeline"
    );

    // Test 6: getCustomerReport returns topCustomers, retention summary and registration timeline
    const customerReport = await getCustomerReport();
    assert(
      customerReport &&
        Array.isArray(customerReport.topCustomers) &&
        customerReport.retentionSummary !== undefined &&
        Array.isArray(customerReport.registrationTimeline),
      6,
      "getCustomerReport returns retention summary and registrationTimeline"
    );

    // Test 7: getSubscriptionReport returns status counts and meal summary
    const subReport = await getSubscriptionReport();
    assert(
      subReport &&
        Array.isArray(subReport.subscriptionStatuses) &&
        subReport.mealSummary?.total !== undefined,
      7,
      "getSubscriptionReport returns subscriptionStatuses and mealSummary fulfillment"
    );

    console.log(`\n${CYAN}----------------------------------------------------------------------${RESET}`);
    console.log(`Tests Completed: ${passCount} Passed, ${failCount} Failed`);
    console.log(`${CYAN}======================================================================${RESET}\n`);

    await mongoose.disconnect();
    process.exit(failCount > 0 ? 1 : 0);
  } catch (err) {
    console.error("Test execution encountered an error:", err);
    await mongoose.disconnect();
    process.exit(1);
  }
}

runTests();
