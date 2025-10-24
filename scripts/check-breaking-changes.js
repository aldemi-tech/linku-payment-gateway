#!/usr/bin/env node

/**
 * Checks for breaking changes in the API
 */

const { execSync } = require('child_process');

function checkBreakingChanges() {
  console.log('🔍 Checking for breaking changes...');

  try {
    // Get the diff between current commit and main
    const diff = execSync('git diff main..HEAD --name-only', { encoding: 'utf8' });
    const changedFiles = diff.trim().split('\n').filter(Boolean);

    const criticalFiles = [
      'src/types/index.ts',
      'src/index.ts',
      'src/providers/base.ts',
      'src/providers/factory.ts'
    ];

    const modifiedCriticalFiles = changedFiles.filter(file => 
      criticalFiles.some(critical => file.includes(critical))
    );

    if (modifiedCriticalFiles.length > 0) {
      console.warn('⚠️ Critical files modified - potential breaking changes:');
      modifiedCriticalFiles.forEach(file => {
        console.warn(`   - ${file}`);
      });

      // Get the actual diff content for critical files
      for (const file of modifiedCriticalFiles) {
        try {
          const fileDiff = execSync(`git diff main..HEAD -- ${file}`, { encoding: 'utf8' });
          
          // Check for specific breaking change patterns
          if (fileDiff.includes('interface ') && fileDiff.includes('-')) {
            console.error(`❌ Potential interface breaking change detected in ${file}`);
          }
          
          if (fileDiff.includes('export ') && fileDiff.includes('-')) {
            console.warn(`⚠️ Export signature change detected in ${file}`);
          }
        } catch (error) {
          // File might be new
        }
      }

      console.log('\n📋 Please ensure:');
      console.log('   1. API backward compatibility is maintained');
      console.log('   2. Client applications can handle the changes');
      console.log('   3. Database migrations are included if needed');
      console.log('   4. Documentation is updated');
    }

    console.log('✅ Breaking changes check completed');
  } catch (error) {
    console.error('❌ Error checking for breaking changes:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  checkBreakingChanges();
}

module.exports = { checkBreakingChanges };