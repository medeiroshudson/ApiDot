'use client';

import React, { useState } from 'react';
import { AppHeader } from '@/components/layout/AppHeader';
import { MobileDrawer } from '@/components/layout/MobileDrawer';
import { Folder, Layers, Send } from 'lucide-react';

export default function Home() {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isAgentOnline, setIsAgentOnline] = useState(false);

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-neutral-950 text-neutral-100">
      <AppHeader
        title="ApiDot"
        isAgentOnline={isAgentOnline}
        onToggleDrawer={() => setIsDrawerOpen(true)}
      />

      {/* Mobile Drawer */}
      <MobileDrawer isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)}>
        <nav className="space-y-2 text-sm">
          <div className="flex items-center gap-2 p-2 rounded hover:bg-neutral-800 text-neutral-300 cursor-pointer">
            <Layers className="w-4 h-4 text-neutral-400" />
            <span>Coleção Padrão</span>
          </div>
          <div className="flex items-center gap-2 p-2 rounded hover:bg-neutral-800 text-neutral-300 cursor-pointer pl-6">
            <Folder className="w-4 h-4 text-neutral-400" />
            <span>Autenticação</span>
          </div>
        </nav>
      </MobileDrawer>

      <div className="flex flex-1 overflow-hidden">
        {/* Desktop Sidebar (hidden on mobile, visible on md+) */}
        <aside className="hidden md:flex flex-col w-64 border-r border-neutral-800 bg-neutral-900/50 p-4">
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-neutral-800">
            <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
              Coleções & Pastas
            </span>
          </div>
          <nav className="flex-1 overflow-y-auto space-y-1 text-sm">
            <div className="flex items-center gap-2 p-2 rounded hover:bg-neutral-800 text-neutral-300 cursor-pointer">
              <Layers className="w-4 h-4 text-neutral-400" />
              <span>Coleção Padrão</span>
            </div>
            <div className="flex items-center gap-2 p-2 rounded hover:bg-neutral-800 text-neutral-300 cursor-pointer pl-6">
              <Folder className="w-4 h-4 text-neutral-400" />
              <span>Autenticação</span>
            </div>
          </nav>
        </aside>

        {/* Main Workspace Area (Request & Response panels) */}
        <main className="flex-1 flex flex-col md:flex-row overflow-hidden bg-neutral-950">
          <section
            data-testid="request-pane-placeholder"
            className="flex-1 border-b md:border-b-0 md:border-r border-neutral-800 p-4 flex flex-col justify-center items-center text-center text-neutral-500"
          >
            <Send className="w-8 h-8 mb-2 opacity-50" />
            <p className="text-sm">Painel de Requisição</p>
            <p className="text-xs text-neutral-600 mt-1">Configure o método, URL, headers e body</p>
          </section>

          <section
            data-testid="response-pane-placeholder"
            className="flex-1 p-4 flex flex-col justify-center items-center text-center text-neutral-500"
          >
            <div className="w-8 h-8 rounded-full border border-neutral-700 flex items-center justify-center mb-2 opacity-50">
              <span className="text-xs font-mono">200</span>
            </div>
            <p className="text-sm">Painel de Resposta</p>
            <p className="text-xs text-neutral-600 mt-1">Status HTTP, métricas de tempo e payload</p>
          </section>
        </main>
      </div>
    </div>
  );
}
