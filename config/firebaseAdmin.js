const admin = require('firebase-admin');

let serviceAccount;

try {
  console.log('🔍 Debugging Firebase configuration...');

  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    console.log('✅ FIREBASE_SERVICE_ACCOUNT is set');
    console.log('📏 Length of FIREBASE_SERVICE_ACCOUNT:', process.env.FIREBASE_SERVICE_ACCOUNT.length);
    console.log('🔍 First 200 characters:', process.env.FIREBASE_SERVICE_ACCOUNT.substring(0, 200));
    console.log('🔍 Last 200 characters:', process.env.FIREBASE_SERVICE_ACCOUNT.substring(process.env.FIREBASE_SERVICE_ACCOUNT.length - 200));

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

  } else {
    console.log('❌ FIREBASE_SERVICE_ACCOUNT is not set');
    throw new Error('FIREBASE_SERVICE_ACCOUNT environment variable is not set!');
  }
} catch (err) {
  console.error('❌ Failed to load Firebase credentials:', err.message);
  console.error('💡 Make sure FIREBASE_SERVICE_ACCOUNT contains valid JSON with proper private_key formatting');
  throw err;
}
