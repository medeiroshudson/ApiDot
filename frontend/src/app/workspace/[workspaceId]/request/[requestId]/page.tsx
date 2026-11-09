import React from 'react';
import RequestPageClient from './RequestPageClient';

export interface RequestPageRouteProps {
  params?: Promise<{ workspaceId: string; requestId: string }>;
}

export function generateStaticParams() {
  if (process.env.NEXT_DESKTOP_EXPORT === '1') {
    // Static export requires at least one generated path per dynamic route. The
    // desktop shell never loads these HTML files (it renders from the URL hash),
    // so one placeholder path keeps the export valid.
    return [{ workspaceId: '_', requestId: '_' }];
  }

  // The web build resolves params at runtime.
  return [];
}

export default function RequestPage({ params }: RequestPageRouteProps): React.JSX.Element {
  return <RequestPageClient params={params} />;
}
