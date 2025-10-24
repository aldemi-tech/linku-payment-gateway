#!/usr/bin/env node

/**
 * Monitors deployment health after production deployment
 */

const https = require('https');

async function makeRequest(url, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Request timeout'));
    }, timeout);

    https.get(url, (res) => {
      clearTimeout(timer);
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          data: data
        });
      });
    }).on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

async function checkHealth(baseUrl) {
  const checks = [
    { name: 'Health Check', path: '/healthCheck' },
    { name: 'Stripe Status', path: '/status/stripe' },
    { name: 'Transbank Status', path: '/status/transbank' },
    { name: 'MercadoPago Status', path: '/status/mercadopago' }
  ];

  const results = [];

  for (const check of checks) {
    try {
      console.log(`🔍 Checking ${check.name}...`);
      const response = await makeRequest(`${baseUrl}${check.path}`);
      
      const success = response.statusCode >= 200 && response.statusCode < 300;
      results.push({
        name: check.name,
        success,
        statusCode: response.statusCode,
        responseTime: Date.now() // Simplified
      });

      console.log(success ? `✅ ${check.name} - OK` : `❌ ${check.name} - FAILED`);
    } catch (error) {
      console.error(`❌ ${check.name} - ERROR: ${error.message}`);
      results.push({
        name: check.name,
        success: false,
        error: error.message
      });
    }
  }

  return results;
}

async function monitorHealth() {
  console.log('🏥 Starting deployment health monitoring...');

  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) {
    console.error('❌ FIREBASE_PROJECT_ID environment variable is required');
    process.exit(1);
  }

  const baseUrl = `https://us-central1-${projectId}.cloudfunctions.net`;
  
  let attempts = 0;
  const maxAttempts = 5;
  const delayBetweenAttempts = 30000; // 30 seconds

  while (attempts < maxAttempts) {
    attempts++;
    console.log(`\n📊 Health check attempt ${attempts}/${maxAttempts}`);

    const results = await checkHealth(baseUrl);
    const successfulChecks = results.filter(r => r.success).length;
    const totalChecks = results.length;

    console.log(`\n📈 Health Check Summary (Attempt ${attempts}):`);
    console.log(`   Successful: ${successfulChecks}/${totalChecks}`);
    console.log(`   Success Rate: ${Math.round((successfulChecks / totalChecks) * 100)}%`);

    if (successfulChecks === totalChecks) {
      console.log('\n✅ All health checks passed! Deployment is healthy.');
      process.exit(0);
    } else if (successfulChecks === 0) {
      console.error('\n🚨 All health checks failed! Deployment may have critical issues.');
      if (attempts === maxAttempts) {
        process.exit(1);
      }
    } else {
      console.warn(`\n⚠️ Partial health check failure (${successfulChecks}/${totalChecks})`);
    }

    if (attempts < maxAttempts) {
      console.log(`⏳ Waiting ${delayBetweenAttempts/1000} seconds before next check...`);
      await new Promise(resolve => setTimeout(resolve, delayBetweenAttempts));
    }
  }

  console.error(`\n❌ Health monitoring failed after ${maxAttempts} attempts`);
  process.exit(1);
}

if (require.main === module) {
  monitorHealth().catch(error => {
    console.error('❌ Health monitoring error:', error);
    process.exit(1);
  });
}

module.exports = { monitorHealth, checkHealth };