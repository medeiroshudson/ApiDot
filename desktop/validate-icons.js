const fs = require('fs');
const path = require('path');
const assert = require('assert');

const desktopDir = path.resolve(__dirname);
const appIconSvgPath = path.join(desktopDir, 'app-icon.svg');
const iconsDir = path.join(desktopDir, 'src-tauri', 'icons');

assert(fs.existsSync(appIconSvgPath), 'desktop/app-icon.svg must exist');
const svgContent = fs.readFileSync(appIconSvgPath, 'utf8');

// macOS HIG assertions
assert(svgContent.includes('viewBox="0 0 1024 1024"'), 'app-icon.svg must have 1024x1024 viewBox');
assert(svgContent.includes('width="824"') && svgContent.includes('height="824"'), 'app-icon.svg must contain 824x824 squircle body');
assert(svgContent.includes('rx="185"'), 'app-icon.svg must use rx=185 squircle corner radius');
assert(svgContent.includes('x="100"') && svgContent.includes('y="100"'), 'squircle must be centered at (100, 100) with 100px margins');

// Visual brand assertions
assert(!svgContent.includes('#3b82f6'), 'app-icon.svg must NOT contain old blue #3b82f6');
assert(!svgContent.includes('#10b981'), 'app-icon.svg must NOT contain old green #10b981');
assert(svgContent.includes('#86BC25'), 'app-icon.svg must use official green #86BC25');
assert(svgContent.includes('#1c1d21') || svgContent.includes('#0b0c0e'), 'app-icon.svg must use Dark Obsidian palette');

console.log('✓ Master icon SVG structure validation passed.');
