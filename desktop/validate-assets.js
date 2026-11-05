const fs = require('fs');
const path = require('path');
const assert = require('assert');

const rootDir = path.resolve(__dirname, '..');
const assetsDir = path.join(rootDir, 'assets');

const whiteSvgPath = path.join(assetsDir, 'api-dot-white.svg');
const blackSvgPath = path.join(assetsDir, 'api-dot-black.svg');

assert(fs.existsSync(whiteSvgPath), 'assets/api-dot-white.svg must exist');
assert(fs.existsSync(blackSvgPath), 'assets/api-dot-black.svg must exist');

const whiteContent = fs.readFileSync(whiteSvgPath, 'utf8');
const blackContent = fs.readFileSync(blackSvgPath, 'utf8');

[whiteContent, blackContent].forEach((content, idx) => {
  const name = idx === 0 ? 'api-dot-white.svg' : 'api-dot-black.svg';
  assert(content.includes('viewBox="0 0 356 160"'), `${name} must have viewBox 0 0 356 160`);
  assert(content.includes('r="22"'), `${name} must have dot radius 22`);
  assert(content.includes('r="26"'), `${name} must have knockout mask radius 26`);
  assert(content.includes('cx="312"'), `${name} must have dot cx 312`);
  assert(content.includes('cy="138"'), `${name} must have dot cy 138`);
  assert(content.includes('#86BC25'), `${name} must use official green #86BC25`);
  assert(content.includes('mask="url(#cutout-mask)"'), `${name} must apply cutout-mask to letters`);
});

console.log('✓ Official logo SVGs validation passed successfully.');
