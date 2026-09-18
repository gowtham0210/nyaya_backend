const { cert, getApp, getApps, initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { firebase } = require('./env');

let app = null;

class FirebaseAdminNotConfiguredError extends Error {
  constructor() {
    super(
      'Firebase Admin credentials are not configured. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY.'
    );
    this.name = 'FirebaseAdminNotConfiguredError';
  }
}

function getFirebaseApp() {
  if (app) {
    return app;
  }

  if (!firebase.projectId || !firebase.clientEmail || !firebase.privateKey) {
    throw new FirebaseAdminNotConfiguredError();
  }

  app = getApps().length
    ? getApp()
    : initializeApp({
        credential: cert({
          projectId: firebase.projectId,
          clientEmail: firebase.clientEmail,
          privateKey: firebase.privateKey,
        }),
      });

  return app;
}

async function verifyFirebaseIdToken(idToken) {
  return getAuth(getFirebaseApp()).verifyIdToken(idToken);
}

module.exports = {
  getFirebaseApp,
  verifyFirebaseIdToken,
  FirebaseAdminNotConfiguredError,
};
