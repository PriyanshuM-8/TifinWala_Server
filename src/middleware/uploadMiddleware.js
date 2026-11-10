import multer from "multer";

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    const error = new Error("Invalid file format. Only JPEG, PNG, and WebP images are allowed.");
    error.statusCode = 400;
    cb(error, false);
  }
};

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE,
  },
  fileFilter,
});

export const handleSingleUpload = (fieldName = "image") => {
  const multerSingle = upload.single(fieldName);

  return (req, res, next) => {
    multerSingle(req, res, (err) => {
      if (err) {
        if (err instanceof multer.MulterError) {
          if (err.code === "LIMIT_FILE_SIZE") {
            return res.status(400).json({
              success: false,
              message: "File size exceeds maximum allowed limit of 5 MB.",
            });
          }
          return res.status(400).json({
            success: false,
            message: `Upload error: ${err.message}`,
          });
        }
        return res.status(err.statusCode || 400).json({
          success: false,
          message: err.message || "File upload failed.",
        });
      }
      next();
    });
  };
};

export default upload;