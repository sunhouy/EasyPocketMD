const fs = require('fs');
const path = require('path');

const versionPath = path.join(__dirname, 'version.json');

function getCurrentVersion() {
  try {
    if (fs.existsSync(versionPath)) {
      const data = JSON.parse(fs.readFileSync(versionPath, 'utf8'));
      return data.version || 'v1';
    }
  } catch (e) {
    console.warn('Error reading version file:', e);
  }
  return 'v1';
}

function incrementVersion(currentVersion) {
  const match = currentVersion.match(/v(\d+)/);
  if (match) {
    const num = parseInt(match[1], 10);
    return `v${num + 1}`;
  }
  return 'v1';
}

function updateVersion() {
  const currentVersion = getCurrentVersion();
  const newVersion = incrementVersion(currentVersion);
  
  fs.writeFileSync(versionPath, JSON.stringify({ version: newVersion, updatedAt: new Date().toISOString() }, null, 2));
  
  return newVersion;
}

if (require.main === module) {
  updateVersion();
}

module.exports = { getCurrentVersion, incrementVersion, updateVersion };
