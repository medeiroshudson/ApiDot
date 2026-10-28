export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || 'dev';

export function formatDisplayVersion(version: string = APP_VERSION): string {
  if (version.toLowerCase() === 'dev') return 'dev';
  return version.startsWith('v') ? version : `v${version}`;
}
