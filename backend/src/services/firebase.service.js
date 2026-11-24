const { admin, initializeFirebase } = require("../config/firebase-admin");
const logger = require("../utils/logger");

/**
 * Verify a Firebase ID token and return the decoded phone number.
 *
 * The mobile app (iOS / Android) uses the Firebase SDK to send the SMS and
 * handle OTP verification entirely on-device.  Once the user enters the
 * correct OTP, Firebase hands the app a short-lived `idToken`.  The backend
 * only needs to call `admin.auth().verifyIdToken(idToken)` to confirm that
 * Firebase signed it and to extract the verified phone number.
 *
 * @param {string} idToken  Firebase ID token received from the mobile client
 * @returns {Promise<{ phoneNumber: string }>}  Verified E.164 phone number, e.g. "+919876543210"
 */
exports.verifyFirebaseIdToken = async (idToken) => {
  // initializeFirebase is idempotent – safe to call multiple times
  initializeFirebase();

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);

    if (!decodedToken.phone_number) {
      const err = new Error(
        "Firebase token does not contain a verified phone number. " +
          "Make sure Phone Authentication is enabled in your Firebase project."
      );
      err.name = "ValidationError";
      throw err;
    }

    logger.info(
      `Firebase token verified for phone: ${decodedToken.phone_number.slice(0, -4)}****`
    );

    return { phoneNumber: decodedToken.phone_number };
  } catch (error) {
    // Re-throw validation errors as-is; wrap Firebase-specific errors
    if (error.name === "ValidationError") throw error;

    logger.error("Firebase token verification failed:", error.message);

    const err = new Error("Invalid or expired Firebase ID token");
    err.name = "UnauthorizedError";
    throw err;
  }
};
