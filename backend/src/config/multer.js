const multer = require("multer");
const path = require("path");

// Define storage location
const storage = multer.memoryStorage();

// File filter to accept only specific file types
const fileFilter = (req, file, cb) => {
  // Allowed file extensions
  const allowedMimes = [
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/plain",
    "application/json",
    // audio
    "audio/mpeg",
    "audio/ogg",
    "audio/wav",
    "audio/m4a",
    "audio/mp4",
  ];

  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        `File type ${file.mimetype} not allowed. Allowed types: images, PDFs, Word, Excel, Text`
      ),
      false
    );
  }
};

// Multer configuration
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

// Single file upload middleware
const uploadSingleFile = upload.single("file");

// Multiple files upload middleware
const uploadMultipleFiles = upload.array("files", 5); // Max 5 files

// Field-based upload (for forms with multiple fields)
const uploadMixed = upload.fields([
  { name: "avatar", maxCount: 1 },
  { name: "documents", maxCount: 5 },
]);

module.exports = {
  uploadSingleFile,
  uploadMultipleFiles,
  uploadMixed,
  upload,
};
