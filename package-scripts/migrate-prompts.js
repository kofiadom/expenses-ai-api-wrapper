#!/usr/bin/env node

/**
 * Simple script to run the prompt migration
 */

const { execSync } = require('child_process');
const path = require('path');

console.log('🚀 Starting prompt migration to Langfuse...');

try {
  // Run the TypeScript migration script
  const scriptPath = path.join(__dirname, '..', 'scripts', 'migrate-prompts-to-langfuse.ts');
  execSync(`npx ts-node ${scriptPath}`, { 
    stdio: 'inherit',
    cwd: path.join(__dirname, '..')
  });
  
  console.log('✅ Prompt migration completed successfully!');
} catch (error) {
  console.error('❌ Prompt migration failed:', error.message);
  process.exit(1);
}
