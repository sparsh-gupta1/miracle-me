const crypto = require("crypto");

/**
 * Convert string to Base64
 * @param {string} str - String to encode
 * @returns {string} Base64 encoded string
 */
const encodeBase64 = (str) => {
  try {
    return Buffer.from(str, "utf-8").toString("base64");
  } catch (error) {
    throw new Error(`Failed to encode Base64: ${error.message}`);
  }
};

/**
 * Convert Base64 to string
 * @param {string} base64Str - Base64 encoded string
 * @returns {string} Decoded string
 */
const decodeBase64 = (base64Str) => {
  try {
    return Buffer.from(base64Str, "base64").toString("utf-8");
  } catch (error) {
    throw new Error(`Failed to decode Base64: ${error.message}`);
  }
};

/**
 * Encrypt data using AES-256-GCM
 * @param {string} data - Data to encrypt
 * @param {string} key - Encryption key (should be 32 bytes for AES-256)
 * @returns {Object} Encrypted data with iv and authTag
 */
const encryptData = (data, key) => {
  try {
    // Generate a random IV
    const iv = crypto.randomBytes(16);

    // Create cipher
    const cipher = crypto.createCipheriv(
      "aes-256-gcm",
      Buffer.from(key, "hex"),
      iv
    );

    // Encrypt data
    let encrypted = cipher.update(data, "utf-8", "hex");
    encrypted += cipher.final("hex");

    // Get authentication tag
    const authTag = cipher.getAuthTag();

    return {
      encrypted,
      iv: iv.toString("hex"),
      authTag: authTag.toString("hex"),
    };
  } catch (error) {
    throw new Error(`Failed to encrypt data: ${error.message}`);
  }
};

/**
 * Decrypt data using AES-256-GCM
 * @param {string} encrypted - Encrypted data
 * @param {string} key - Decryption key (should be 32 bytes for AES-256)
 * @param {string} iv - Initialization vector (hex string)
 * @param {string} authTag - Authentication tag (hex string)
 * @returns {string} Decrypted data
 */
const decryptData = (encrypted, key, iv, authTag) => {
  try {
    // Create decipher
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      Buffer.from(key, "hex"),
      Buffer.from(iv, "hex")
    );

    // Set authentication tag
    decipher.setAuthTag(Buffer.from(authTag, "hex"));

    // Decrypt data
    let decrypted = decipher.update(encrypted, "hex", "utf-8");
    decrypted += decipher.final("utf-8");

    return decrypted;
  } catch (error) {
    throw new Error(`Failed to decrypt data: ${error.message}`);
  }
};

/**
 * Generate a 32-byte encryption key from a password
 * @param {string} password - Password to derive key from
 * @param {string} salt - Salt for key derivation (optional)
 * @returns {string} Hex encoded 32-byte key
 */
const generateEncryptionKey = (password, salt = "default-salt") => {
  try {
    return crypto
      .pbkdf2Sync(password, salt, 100000, 32, "sha256")
      .toString("hex");
  } catch (error) {
    throw new Error(`Failed to generate encryption key: ${error.message}`);
  }
};

/**
 * Hash data using SHA-256
 * @param {string} data - Data to hash
 * @returns {string} Hex encoded hash
 */
const hashData = (data) => {
  try {
    return crypto.createHash("sha256").update(data).digest("hex");
  } catch (error) {
    throw new Error(`Failed to hash data: ${error.message}`);
  }
};

/**
 * Generate a random token
 * @param {number} length - Token length in bytes (default: 32)
 * @returns {string} Random token in hex
 */
const generateRandomToken = (length = 32) => {
  try {
    return crypto.randomBytes(length).toString("hex");
  } catch (error) {
    throw new Error(`Failed to generate random token: ${error.message}`);
  }
};

module.exports = {
  encodeBase64,
  decodeBase64,
  encryptData,
  decryptData,
  generateEncryptionKey,
  hashData,
  generateRandomToken,
};
