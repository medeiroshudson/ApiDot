'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Menu, Settings, Sliders, ChevronDown, LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { APP_VERSION, formatDisplayVersion } from '@/lib/version';
import { useAuthStore } from '@/stores/useAuthStore';
import { useWorkspaceStore } from '@/stores/useWorkspaceStore';
import { useRequestStore } from '@/stores/useRequestStore';
import { Select } from '@/components/common/Select';

export interface AppHeaderProps {
  title?: string;
  isAgentOnline?: boolean;
  isDrawerOpen?: boolean;
  onToggleDrawer?: () => void;
  environments?: string[];
  activeEnvironment?: string | null;
  onSelectEnvironment?: (env: string | null) => void;
  onOpenEnvironmentSettings?: () => void;
  onOpenSettings?: () => void;
  activeWorkspaceId?: string | null;
}

export function getUserInitials(displayName?: string, email?: string): string {
  if (displayName && displayName.trim()) {
    const parts = displayName.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return parts[0].slice(0, 2).toUpperCase();
  }
  if (email && email.trim()) {
    return email.trim().slice(0, 2).toUpperCase();
  }
  return 'U';
}

export function getRoleBadgeClasses(roleName?: string | null): string {
  switch (roleName?.toLowerCase()) {
    case 'owner':
      return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    case 'admin':
      return 'bg-purple-500/10 text-purple-400 border-purple-500/20';
    case 'member':
    default:
      return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
  }
}

export function AppHeader({
  title = 'ApiDot',
  isAgentOnline = false,
  isDrawerOpen = false,
  onToggleDrawer,
  environments = [],
  activeEnvironment = null,
  onSelectEnvironment,
  onOpenEnvironmentSettings,
  onOpenSettings,
  activeWorkspaceId = null,
}: AppHeaderProps) {
  const router = useRouter();
  const { user, isAuthenticated, isLoading, logout } = useAuthStore();
  const storeActiveWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const currentWorkspaceId = activeWorkspaceId ?? storeActiveWorkspaceId;

  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const activeMembership = user?.workspaces?.find((w) => w.id === currentWorkspaceId);
  const role =
    activeMembership?.role ??
    (user?.workspaces?.length === 1 ? user.workspaces[0].role : user?.isRoot ? 'Owner' : null);

  const initials = getUserInitials(user?.displayName, user?.email);

  // Close user menu on click outside and on Escape key
  useEffect(() => {
    if (!isUserMenuOpen) return;

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsUserMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isUserMenuOpen]);

  const handleLogout = async () => {
    setIsUserMenuOpen(false);
    try {
      await logout();
    } catch {
      // fallback
    } finally {
      useWorkspaceStore.getState().reset();
      useRequestStore.getState().reset();
      router.replace('/login');
    }
  };

  return (
    <header className="h-14 border-b border-neutral-800 bg-neutral-950 px-4 flex items-center justify-between select-none">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onToggleDrawer}
          aria-label="Alternar menu de navegação"
          aria-expanded={isDrawerOpen}
          aria-controls="collections-drawer"
          className="md:hidden p-2 rounded-md text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors focus:outline-none focus:ring-2 focus:ring-neutral-400 cursor-pointer"
        >
          <Menu className="w-5 h-5" aria-hidden="true" />
        </button>
        <div className="flex items-center gap-2">
          <span className="font-bold text-base tracking-tight text-white">{title}</span>
          <span className="hidden sm:inline-block text-xs px-2 py-0.5 rounded bg-neutral-800 text-neutral-400">
            {formatDisplayVersion(APP_VERSION)}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <div className="flex items-center gap-1.5">
          <Select
            sizeVariant="sm"
            value={activeEnvironment ?? ''}
            onChange={(e) => onSelectEnvironment?.(e.target.value === '' ? null : e.target.value)}
            aria-label="Selecionar ambiente ativo"
            className="max-w-[120px] sm:max-w-[200px] truncate hover:border-neutral-700"
          >
            <option value="">Sem Ambiente</option>
            {(environments ?? []).map((env, idx) => (
              <option key={`${env}-${idx}`} value={env}>
                {env}
              </option>
            ))}
          </Select>
          <button
            type="button"
            onClick={onOpenEnvironmentSettings}
            aria-label="Configurar ambientes e variáveis"
            aria-haspopup="dialog"
            title="Configurar ambientes e variáveis"
            className="p-2 rounded-md text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors focus:outline-none focus:ring-2 focus:ring-neutral-400 cursor-pointer"
          >
            <Sliders className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <button
          type="button"
          onClick={onOpenSettings}
          aria-label="Configurações Globais"
          aria-haspopup="dialog"
          title="Configurações Globais"
          className="p-2 rounded-md text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors focus:outline-none focus:ring-2 focus:ring-neutral-400 cursor-pointer"
        >
          <Settings className="w-4 h-4" aria-hidden="true" />
        </button>

        {/* User Profile Menu */}
        {isAuthenticated && user && !isLoading && (
          <div className="relative" ref={userMenuRef}>
            <button
              type="button"
              onClick={() => setIsUserMenuOpen((prev) => !prev)}
              aria-label={`Menu do usuário: ${user.displayName || user.email}`}
              aria-expanded={isUserMenuOpen}
              aria-haspopup="menu"
              className="flex items-center gap-2 p-1 pl-1.5 pr-2 rounded-full hover:bg-neutral-800 transition-colors focus:outline-none focus:ring-2 focus:ring-neutral-400 cursor-pointer"
            >
              <div
                data-testid="user-avatar"
                className="w-7 h-7 rounded-full bg-blue-600 text-white font-semibold text-xs flex items-center justify-center shrink-0 shadow-sm"
              >
                {initials}
              </div>

              <div className="hidden md:flex flex-col text-left leading-tight max-w-[130px]">
                <span className="text-xs font-medium text-neutral-200 truncate">
                  {user.displayName || user.email}
                </span>
                <span className="text-[10px] text-neutral-400 truncate">
                  {user.email}
                </span>
              </div>

              <ChevronDown
                className={`w-3.5 h-3.5 text-neutral-400 transition-transform duration-150 ${
                  isUserMenuOpen ? 'rotate-180' : ''
                }`}
                aria-hidden="true"
              />
            </button>

            {/* Dropdown Menu */}
            {isUserMenuOpen && (
              <div
                role="menu"
                aria-label="Opções do usuário"
                data-testid="user-dropdown-menu"
                className="absolute right-0 top-full mt-1.5 w-64 bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl py-2 z-50 flex flex-col"
              >
                {/* User info header */}
                <div className="px-3.5 py-2 border-b border-neutral-800 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-blue-600 text-white font-semibold text-sm flex items-center justify-center shrink-0">
                    {initials}
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-semibold text-neutral-100 truncate">
                      {user.displayName || user.email}
                    </span>
                    <span className="text-[11px] text-neutral-400 truncate">
                      {user.email}
                    </span>
                  </div>
                </div>

                {/* Logout Action */}
                <div className="pt-1">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleLogout}
                    aria-label="Sair da conta"
                    className="w-full flex items-center gap-2 px-3.5 py-2 text-xs text-rose-400 hover:text-rose-300 hover:bg-neutral-800/80 transition-colors text-left cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    <span>Sair</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
