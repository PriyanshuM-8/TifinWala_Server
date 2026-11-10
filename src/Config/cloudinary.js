import { v2 as cloudinary } from "cloudinary";

const getCloudinary = () => {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME || "",
    api_key: process.env.CLOUDINARY_API_KEY || "",
    api_secret: process.env.CLOUDINARY_API_SECRET || "",
  });
  return cloudinary;
};
 
const uploadBuffer = (buffer, options) =>
  new Promise((resolve, reject) => {
    getCloudinary().uploader.upload_stream(options, (error, result) => {
      if (error) return reject(error);
      resolve(result);
    }).end(buffer);
  });

export const uploadImage = async (fileInput, folder = "gharkaswad/foods", mimeType = "image/jpeg") => {
  if (!fileInput) return null;

  if (typeof fileInput === "string" && (fileInput.startsWith("http://") || fileInput.startsWith("https://"))) {
    return { secure_url: fileInput, public_id: "" };
  }

  const isConfigured =
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET;

  if (!isConfigured) {
    console.warn("[Cloudinary] Credentials not configured. Using fallback.");
    return {
      secure_url: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&auto=format&fit=crop",
      public_id: `fallback_${Date.now()}`,
    };
  }

  try {
    let result;
    if (Buffer.isBuffer(fileInput)) {
      result = await uploadBuffer(fileInput, { folder, resource_type: "auto" });
    } else {
      result = await getCloudinary().uploader.upload(fileInput, { folder, resource_type: "auto" });
    }
    return { secure_url: result.secure_url, public_id: result.public_id };
  } catch (error) {
    console.error("[Cloudinary] Upload failed:", error.message);
    const err = new Error(`Image upload failed: ${error.message}`);
    err.statusCode = 502;
    throw err;
  }
};

export const deleteImage = async (publicId) => {
  if (!publicId || publicId.startsWith("fallback_")) return;

  const isConfigured =
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET;

  if (!isConfigured) return;

  try {
    await getCloudinary().uploader.destroy(publicId);
  } catch (error) {
    console.error("[Cloudinary] Delete failed:", error.message);
  }
};

export default cloudinary;