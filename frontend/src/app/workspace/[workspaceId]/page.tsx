import React from 'react';
import WorkspacePageClient from './WorkspacePageClient';

export interface WorkspacePageRouteProps {
  params?: Promise<{ workspaceId: string }>;
}

export function generateStaticParams() {
  if (process.env.NEXT_DESKTOP_EXPORT === '1') {
    // Static export requires at least one generated path per dynamic route. The
    // desktop shell never loads these HTML files (it renders from the URL hash),
    // so one placeholder path keeps the export valid.
    return [{ workspaceId: '_' }];
  }

  // The web build resolves params at runtime.
  return [];
}

export default function WorkspacePage({ params }: WorkspacePageRouteProps): React.JSX.Element {
  return <WorkspacePageClient params={params} />;
}
