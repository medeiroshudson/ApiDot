import React from 'react';
import RequestPageClient from './RequestPageClient';

export interface RequestPageRouteProps {
  params?: Promise<{ workspaceId: string; requestId: string }>;
}

export function generateStaticParams() {
  // The desktop build exports only the static routes and renders the shell from
  // the hash; the web build resolves params at runtime.
  return [];
}

export default function RequestPage({ params }: RequestPageRouteProps): React.JSX.Element {
  return <RequestPageClient params={params} />;
}
