/**
 * DataMorph Extension Packaging Script
 *
 * This script helps prepare and package the DataMorph extension for distribution.
 * It ensures all necessary files are included and properly formatted.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('DataMorph Extension Packaging Tool');
console.log('=================================');

// Check for required files
const requiredFiles = [
  'package.json',
  'README.md',
  'CHANGELOG.md',
  'media/datamorph-icon.png',
];

console.log('\nChecking required files...');
const missingFiles = [];

requiredFiles.forEach(file => {
  if (!fs.existsSync(path.join(__dirname, file))) {
    missingFiles.push(file);
    console.log(`❌ Missing: ${file}`);
  } else {
    console.log(`✅ Found: ${file}`);
  }
});

if (missingFiles.length > 0) {
  console.log(
    `\n⚠️  Warning: ${missingFiles.length} required files are missing.`
  );

  if (missingFiles.includes('media/datamorph-icon.png')) {
    console.log('\n🎨 Please create an icon for your extension:');
    console.log('   See media/icon-instructions.txt for details');
  }

  console.log('\nPlease address these issues before packaging the extension.');
} else {
  console.log('\n✅ All required files are present.');
}

// Check package.json
const packageJson = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8')
);

console.log('\nValidating package.json...');
const packageIssues = [];

if (packageJson.publisher === 'datamorph') {
  console.log(
    '⚠️  The default publisher name is set. Please update it with your publisher ID.'
  );
  packageIssues.push('publisher');
}

if (packageJson.repository.url.includes('username')) {
  console.log(
    '⚠️  The repository URL contains a placeholder. Please update it with your actual repository.'
  );
  packageIssues.push('repository');
}

if (packageIssues.length === 0) {
  console.log('✅ package.json looks good.');
}

// Compile TypeScript
console.log('\nCompiling TypeScript...');
try {
  execSync('npm run compile', { stdio: 'inherit' });
  console.log('✅ TypeScript compilation successful.');
} catch (error) {
  console.log('❌ TypeScript compilation failed. Please fix any type errors.');
  process.exit(1);
}

console.log('\nPackaging Instructions:');
console.log('1. Ensure you have the vsce tool installed:');
console.log('   npm install -g @vscode/vsce');
console.log('2. Run the packaging command:');
console.log('   vsce package');
console.log(
  '\nThis will create a .vsix file that you can install directly or publish to the marketplace.'
);

console.log('\nTo publish to the VS Code Marketplace:');
console.log('1. Create a publisher on https://marketplace.visualstudio.com/');
console.log('2. Get a Personal Access Token');
console.log('3. Run:');
console.log('   vsce publish');

console.log(
  '\nFor more information, see: https://code.visualstudio.com/api/working-with-extensions/publishing-extension'
);
