const admin = require('firebase-admin');

let serviceAccount;
let bucket;

try {
  console.log('🔍 Debugging Firebase configuration...');

  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    console.log('✅ FIREBASE_SERVICE_ACCOUNT is set');
    
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

    // Validate required fields
    if (!serviceAccount.private_key || !serviceAccount.client_email || !serviceAccount.project_id) {
      throw new Error('Missing required Firebase service account fields');
    }

    // Ensure private key is properly formatted
    if (!serviceAccount.private_key.includes('-----BEGIN PRIVATE KEY-----')) {
      console.warn('⚠️  Private key may not be properly formatted. Expected PEM format.');
    }

    // Convert escaped newlines to real newlines (handle both \n and \\n)
    serviceAccount.private_key = serviceAccount.private_key
      .replace(/\\\\n/g, '\n')  // Handle double-escaped newlines
      .replace(/\\n/g, '\n');   // Handle single-escaped newlines

    console.log('✅ Firebase service account parsed successfully');

    // Initialize Firebase Admin
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    });

    console.log('✅ Firebase admin initialized');

    // Initialize the storage bucket
    bucket = admin.storage().bucket();
    console.log('✅ Firebase storage bucket initialized');

  } else {
    console.log('❌ FIREBASE_SERVICE_ACCOUNT is not set');
    throw new Error('FIREBASE_SERVICE_ACCOUNT environment variable is not set!');
  }
} catch (error) {
  console.error('❌ Firebase initialization error:', error.message);
  console.error('💡 Make sure FIREBASE_SERVICE_ACCOUNT contains valid JSON with proper private_key formatting');
  throw error;
}

module.exports = { admin, bucket };