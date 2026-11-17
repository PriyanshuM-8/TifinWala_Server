import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import { sweepExpiringAndExpiredCoupons } from "../Services/rewardCouponService.js";

// Ensure .env is loaded regardless of execution working directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const runCouponExpirySweep = async () => {
  const { MONGO_URI } = process.env;

  console.log("==================================================");
  console.log("   GharKaSwad - Coupon Expiry & Reminder Sweeper  ");
  console.log("==================================================");

  if (!MONGO_URI) {
    console.error("❌ Error: MONGO_URI is missing from environment variables.");
    process.exit(1);
  }

  try {
    console.log("Connecting to MongoDB Atlas...");
    await mongoose.connect(MONGO_URI);
    console.log("Connected successfully.");

    console.log("Executing coupon sweep...");
    const result = await sweepExpiringAndExpiredCoupons();

    console.log("\nSweep Execution Summary:");
    console.log(`- Swept At:             ${result.sweptAt.toISOString()}`);
    console.log(`- Expired Coupons:      ${result.summary.expiredCount}`);
    console.log(`- 1-Day Urgent Alerts:  ${result.summary.notified1DayCount}`);
    console.log(`- 7-Day Warning Alerts: ${result.summary.notified7DaysCount}`);
    console.log("\n✅ Coupon sweep completed successfully.");
  } catch (error) {
    console.error("❌ Error during coupon sweep:", error.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log("Database connection closed.");
  }
};

runCouponExpirySweep();
