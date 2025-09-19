// config/firebaseAdmin.js
const admin = require('firebase-admin');

const serviceAccount = require('./shree-sai-engineering-firebase-adminsdk-fbsvc-2a17d65c0a.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
});

const bucket = admin.storage().bucket();

module.exports = { admin, bucket };