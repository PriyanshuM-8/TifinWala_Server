import mongoose from "mongoose";

const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
      throw new Error("MONGO_URI environment variable is not defined");
    }

    const conn = await mongoose.connect(mongoUri);
    console.log(` MongoDB connected successfully`);
    return conn;
  } catch (error) {
    console.error("[Database] MongoDB connection failed:", error.message);
    process.exit(1);
  }
};

export default connectDB;
