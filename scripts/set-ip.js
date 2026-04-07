const fs = require('fs');
const path = require('path');

const newIp = process.argv[2];

if (!newIp) {
  console.error('❌ Error: Please provide an IP address.');
  console.error('Usage: npm run set-ip <new-ip-address>');
  console.error('Example: npm run set-ip 192.168.1.100');
  process.exit(1);
}

const appsDir = path.join(__dirname, '..', 'apps');

// Find all targeted env files
function findEnvFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      // Don't go into node_modules or other deep directories to save time
      if (file !== 'node_modules' && file !== 'dist' && file !== '.git') {
         findEnvFiles(filePath, fileList);
      }
    } else {
      // Catch only .env.network files
      if (file === '.env.network') {
         fileList.push(filePath);
      }
    }
  }
  return fileList;
}

const targetFiles = findEnvFiles(appsDir);

let updatedFilesCount = 0;

targetFiles.forEach((filePath) => {
  let content = fs.readFileSync(filePath, 'utf8');
  let originalContent = content;

  content = content.replace(/^(VITE_HOST_IP|HOST_IP)=.*/gm, `$1=${newIp}`);

  // Replace URLs while preserving port, path, and protocol (avoid regex that only
  // matched up to the first ":" — that could leave a second ":port" and break new URL()).
  const urlKeys =
    /^(VITE_BACKEND_URL|VITE_SCENE_CREATOR_URL|VITE_HOST_SCENE_CREATOR_URL|VITE_FRONTEND_URL|VITE_LANDING_PAGE_URL|VITE_DASHBOARD_URL)=(.*)$/gm;
  content = content.replace(urlKeys, (line, key, value) => {
    const trimmed = String(value).trim();
    try {
      const u = new URL(trimmed);
      u.hostname = newIp;
      return `${key}=${u.toString()}`;
    } catch {
      return line;
    }
  });

  if (content !== originalContent) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`✅ Updated: ${path.relative(path.join(__dirname, '..'), filePath)}`);
    updatedFilesCount++;
  }
});

console.log(`\n🎉 Successfully updated ${updatedFilesCount} .env file(s) with new IP: ${newIp}`);
