import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import User from "../models/User.js";

// Ensure .env is loaded regardless of execution working directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const seedAdmin = async () => {
  const { ADMIN_NAME, ADMIN_EMAIL, ADMIN_PHONE, ADMIN_PASSWORD, MONGO_URI } = process.env;

  console.log("==================================================");
  console.log("   GharKaSwad - Administrator Account Seeder      ");
  console.log("==================================================");

  if (!MONGO_URI) {
    console.error("❌ Error: MONGO_URI is missing from environment variables.");
    process.exit(1);
  }

  if (!ADMIN_EMAIL || !ADMIN_PASSWORD || !ADMIN_NAME || !ADMIN_PHONE) {
    console.error("❌ Error: Required admin environment variables are missing.");
    console.error("Please configure the following in your .env file:");
    console.error("  - ADMIN_NAME");
    console.error("  - ADMIN_EMAIL");
    console.error("  - ADMIN_PHONE");
    console.error("  - ADMIN_PASSWORD");
    process.exit(1);
  }

  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(MONGO_URI);
    console.log(" Connected to MongoDB.");

    const normalizedEmail = ADMIN_EMAIL.trim().toLowerCase();
    const cleanPhone = ADMIN_PHONE.trim();

    // Check if an account already exists with this email or phone
    const existingUser = await User.findOne({
      $or: [{ email: normalizedEmail }, { phone: cleanPhone }],
    });

    if (existingUser) {
      if (existingUser.role === "admin") {
        console.log(`ℹ️ Admin account already exists with email: ${normalizedEmail}`);
        console.log(" Aborting seed script to prevent accidental password overwrite.");
      } else {
        console.error(
          `❌ Conflict: An account with this email/phone already exists but has role: '${existingUser.role}'.`
        );
      }
      await mongoose.disconnect();
      process.exit(0);
    }

    // Create the permanent Admin user (pre-save hook will hash the password)
    const adminUser = new User({
      name: ADMIN_NAME.trim(),
      email: normalizedEmail,
      phone: cleanPhone,
      password: ADMIN_PASSWORD.trim(),
      role: "admin",
      emailVerified: true,
      isActive: true,
    });

    await adminUser.save();

    console.log(" Admin account created successfully!");
    console.log(`   Name:  ${adminUser.name}`);
    console.log(`   Email: ${adminUser.email}`);
    console.log(`   Phone: ${adminUser.phone}`);
    console.log(`   Role:  ${adminUser.role}`);
    console.log("==================================================");

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error("❌ Failed to seed administrator account:", error.message);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  }
};

seedAdmin();
