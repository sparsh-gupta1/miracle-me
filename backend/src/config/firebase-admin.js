const admin = require("firebase-admin");

let firebaseApp;

const initializeFirebase = () => {
  if (firebaseApp) return firebaseApp;

  const serviceAccountJSON = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (!serviceAccountJSON) {
    throw new Error("Missing FIREBASE_SERVICE_ACCOUNT_JSON in environment");
  }

  const serviceAccount = JSON.parse(serviceAccountJSON);

  firebaseApp = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  return firebaseApp;
};

module.exports = {
  admin,
  initializeFirebase,
};
