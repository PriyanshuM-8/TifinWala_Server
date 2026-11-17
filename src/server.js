import http from "http";
import dotenv from "dotenv";
dotenv.config();

import app from "./app.js";
import connectDB from "./Config/db.js";
import { initSocket } from "./Config/socket.js";
import { migrateLegacyFoods } from "./Services/adminFoodService.js";

const PORT = process.env.PORT || 5001;

const startServer = async () => {
  try {
    await connectDB();
    await migrateLegacyFoods();

    // Create standard HTTP server wrapping Express app
    const httpServer = http.createServer(app);

    // Initialize Socket.IO with WebSocket support
    initSocket(httpServer);

    httpServer.listen(PORT, () => {
      console.log(`Server running on port ${PORT} with real-time Socket.IO`);
    });
  } catch (error) {
    console.error(" Server startup failed:", error.message);
    process.exit(1);
  }
};

startServer();
