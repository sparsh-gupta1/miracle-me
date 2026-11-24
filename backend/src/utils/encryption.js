const crypto = require("crypto");
const logger = require("./logger");

const algorithm = "aes-256-cbc";
const ivLength = 16;

/**
 * Encrypt a plain text string
 * @param {string} text - Plain text to encrypt
 * @returns {string|null} - Encrypted string in format "ivHex:cipherHex" or null if text is empty/error
 */
exports.encrypt = (text) => {
    if (!text) return null;

    const keyHex = process.env.BANK_ENCRYPTION_KEY;
    if (!keyHex || keyHex.length !== 64) {
        logger.error("BANK_ENCRYPTION_KEY is missing or invalid. Must be a 32-byte hex string (64 characters).");
        throw new Error("Encryption key not configured properly");
    }

    try {
        const key = Buffer.from(keyHex, "hex");
        const iv = crypto.randomBytes(ivLength);
        const cipher = crypto.createCipheriv(algorithm, key, iv);
        let encrypted = cipher.update(text, "utf8", "hex");
        encrypted += cipher.final("hex");
        return `${iv.toString("hex")}:${encrypted}`;
    } catch (error) {
        logger.error("Encryption failed:", error);
        throw new Error("Encryption failed");
    }
};

/**
 * Decrypt a cipher text string
 * @param {string} encryptedText - Encrypted string in format "ivHex:cipherHex"
 * @returns {string|null} - Decrypted plain text or null if input is empty/invalid
 */
exports.decrypt = (encryptedText) => {
    if (!encryptedText) return null;

    const parts = encryptedText.split(":");
    if (parts.length !== 2) return encryptedText; // Probably not encrypted

    const keyHex = process.env.BANK_ENCRYPTION_KEY;
    if (!keyHex || keyHex.length !== 64) {
        logger.error("BANK_ENCRYPTION_KEY is missing or invalid.");
        throw new Error("Encryption key not configured properly");
    }

    try {
        const key = Buffer.from(keyHex, "hex");
        const iv = Buffer.from(parts[0], "hex");
        const encrypted = parts[1];
        
        const decipher = crypto.createDecipheriv(algorithm, key, iv);
        let decrypted = decipher.update(encrypted, "hex", "utf8");
        decrypted += decipher.final("utf8");
        return decrypted;
    } catch (error) {
        logger.error("Decryption failed:", error);
        // Fallback or throw based on preference. 
        // Returning a placeholder prevents total API failure if a key rotates incorrectly, 
        // but throwing is safer for data integrity.
        throw new Error("Decryption failed");
    }
};
