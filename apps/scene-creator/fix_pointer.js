const fs = require('fs');

const files = fs.readdirSync('./ui').filter(f => f.endsWith('.uikitml'));
files.forEach(file => {
    let content = fs.readFileSync(`./ui/${file}`, 'utf8');
    
    // Replace the first occurrence of '.<something>-container {'
    let updated = false;
    content = content.replace(/(\.[a-zA-Z0-9_-]+-container\s*\{[^}]*?)(?=\})/, (match, p1) => {
        if (!match.includes('pointer-events: auto;')) {
            updated = true;
            return p1 + '\n    pointer-events: auto;\n  ';
        }
        return match;
    });
    
    if (updated) {
        fs.writeFileSync(`./ui/${file}`, content);
        console.log(`Fixed ${file}`);
    } else {
        console.log(`Skipped ${file}`);
    }
});
