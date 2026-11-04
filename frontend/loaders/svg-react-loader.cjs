module.exports = function (content) {
  this.cacheable?.();
  const cleaned = content
    .replace(/<\?xml.*?\?>/g, '')
    .replace(/<!DOCTYPE.*?>/g, '')
    .trim();

  const viewBoxMatch = cleaned.match(/viewBox="([^"]+)"/);
  const viewBox = viewBoxMatch ? viewBoxMatch[1] : '0 0 356 160';
  const inner = cleaned
    .replace(/<svg[^>]*>/, '')
    .replace(/<\/svg>$/, '')
    .trim()
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\${/g, '\\${');

  return `
import React from 'react';

export default function SvgComponent({ className = 'h-6 w-auto', fill = 'currentColor', style, ...props }) {
  return React.createElement('svg', {
    viewBox: '${viewBox}',
    className,
    fill,
    role: 'img',
    'aria-label': props['aria-label'] || 'ApiDot',
    style: { display: 'inline-block', verticalAlign: 'middle', height: '1.5rem', width: 'auto', ...style },
    ...props,
    dangerouslySetInnerHTML: { __html: \`${inner}\` }
  });
}
`;
};
