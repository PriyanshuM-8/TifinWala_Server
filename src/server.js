import app from "./app.js";
import connectDB from "./Config/db.js";

const PORT = process.env.PORT || 5001;

const startServer = async () => {
  try {
    await connectDB();
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error(" Server startup failed:", error.message);
    process.exit(1);
  }
}; 
 
startServer();
