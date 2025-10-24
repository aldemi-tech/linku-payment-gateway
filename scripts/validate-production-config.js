#!/usr/bin/env node

/**
 * Validates production configuration before deployment
 */

const fs = require('fs');
const path = require('path');

function validateConfig() {
  console.log('🔍 Validating production configuration...');

  const requiredEnvVars = [
    'STRIPE_SECRET_KEY_PROD',
    'STRIPE_WEBHOOK_SECRET_PROD',
    'TRANSBANK_COMMERCE_CODE_PROD',
    'TRANSBANK_API_KEY_PROD',
    'MERCADOPAGO_ACCESS_TOKEN_PROD',
    'FIREBASE_PROJECT_ID_PROD'
  ];

  const missingVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

  if (missingVars.length > 0) {
    console.error('❌ Missing required environment variables:');
    missingVars.forEach(envVar => {
      console.error(`   - ${envVar}`);
    });
    process.exit(1);
  }

  // Validate package.json
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  
  if (!packageJson.engines || !packageJson.engines.node) {
    console.error('❌ Node.js version not specified in package.json');
    process.exit(1);
  }

  // Validate TypeScript configuration
  if (!fs.existsSync('tsconfig.json')) {
    console.error('❌ tsconfig.json not found');
    process.exit(1);
  }

  // Validate Firebase configuration
  if (!fs.existsSync('firebase.json')) {
    console.error('❌ firebase.json not found');
    process.exit(1);
  }

  const firebaseConfig = JSON.parse(fs.readFileSync('firebase.json', 'utf8'));
  
  if (!firebaseConfig.functions) {
    console.error('❌ Firebase Functions configuration not found');
    process.exit(1);
  }

  console.log('✅ Production configuration validation passed');
}

if (require.main === module) {
  validateConfig();
}

module.exports = { validateConfig };