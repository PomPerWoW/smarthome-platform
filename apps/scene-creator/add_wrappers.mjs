import fs from 'fs';
import path from 'path';

const uiDir = './ui';
const files = fs.readdirSync(uiDir).filter(f => f.endsWith('.uikitml'));

let totalReplacements = 0;

for (const file of files) {
  const filePath = path.join(uiDir, file);
  let content = fs.readFileSync(filePath, 'utf8');

  // We want to replace:
  // <button class="card-toggle" id="card-toggle-X">
  //   <PowerIcon class="toggle-icon" />
  // </button>
  // With:
  // <div class="toggle-wrapper" id="toggle-wrap-X" style="pointer-events: auto; cursor: pointer; border-radius: 1.1; width: 2.2; height: 2.2; display: flex; align-items: center; justify-content: center;">
  //   <button class="card-toggle" id="card-toggle-X" style="pointer-events: none;">
  //     <PowerIcon class="toggle-icon" />
  //   </button>
  // </div>

  // Regex to match the button and its internals
  const regex = /<button class="card-toggle" id="card-toggle-(\d+)">([\s\S]*?)<\/button>/g;
  
  if (regex.test(content)) {
    content = content.replace(regex, (match, id, internals) => {
      totalReplacements++;
      return `<div class="toggle-wrapper" id="toggle-wrap-${id}" style="pointer-events: auto; cursor: pointer; border-radius: 1.1; width: 2.2; height: 2.2; display: flex; align-items: center; justify-content: center;">\n            <button class="card-toggle" id="card-toggle-${id}" style="pointer-events: none;">${internals}</button>\n          </div>`;
    });
    fs.writeFileSync(filePath, content);
    console.log(`Updated ${file}`);
  }
}

console.log(`Done. Total replacements: ${totalReplacements}`);
