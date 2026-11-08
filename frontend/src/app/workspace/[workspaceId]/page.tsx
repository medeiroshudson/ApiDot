import React from 'react';
import WorkspacePageClient from './WorkspacePageClient';

export interface WorkspacePageRouteProps {
  params?: Promise<{ workspaceId: string }>;
}

export function generateStaticParams() {
  // The desktop build exports only the static routes and renders the shell from
  // the hash; the web build resolves params at runtime.
  return [];
}

export default function WorkspacePage({ params }: WorkspacePageRouteProps): React.JSX.Element {
  return <WorkspacePageClient params={params} />;
}
