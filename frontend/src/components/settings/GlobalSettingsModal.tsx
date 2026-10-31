'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  X,
  Laptop,
  Sliders,
  Plus,
  RefreshCw,
  Trash2,
  Terminal,
  Copy,
  Check,
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  ShieldAlert,
} from 'lucide-react';
import { useDeviceStore } from '@/stores/useDeviceStore';
import { useLayoutStore } from '@/stores/useLayoutStore';
import { useTranslation } from '@/hooks/useTranslation';
import type { Locale } from '@/i18n';
import { AgentDeviceDto } from '@/lib/deviceApi';
import { APP_VERSION, formatDisplayVersion } from '@/lib/version';

export type SettingsTab = 'agents' | 'general';

export interface GlobalSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTab?: SettingsTab;
}

export function GlobalSettingsModal({
  isOpen,
  onClose,
  defaultTab = 'general',
}: GlobalSettingsModalProps) {
  const { t, locale, setLocale } = useTranslation();
  const [activeTab, setActiveTab] = useState<SettingsTab>(defaultTab);

  // Sub-modal states
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newDeviceName, setNewDeviceName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [oneTimeTokenData, setOneTimeTokenData] = useState<{
    rawToken: string;
    tokenPrefix: string;
    deviceName: string;
    isRegenerated?: boolean;
  } | null>(null);
  const [isTokenMasked, setIsTokenMasked] = useState(false);
  const [tokenCopied, setTokenCopied] = useState(false);
  const [commandCopied, setCommandCopied] = useState(false);

  const [instructionsDevice, setInstructionsDevice] = useState<AgentDeviceDto | null>(null);

  const [actionInProgressId, setActionInProgressId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Device Store
  const devices = useDeviceStore((s) => s.devices);
  const activeDeviceId = useDeviceStore((s) => s.activeDeviceId);
  const isLoading = useDeviceStore((s) => s.isLoading);
  const storeError = useDeviceStore((s) => s.error);
  const fetchDevices = useDeviceStore((s) => s.fetchDevices);
  const createDevice = useDeviceStore((s) => s.createDevice);
  const revokeDevice = useDeviceStore((s) => s.revokeDevice);
  const regenerateToken = useDeviceStore((s) => s.regenerateToken);
  const setActiveDeviceId = useDeviceStore((s) => s.setActiveDeviceId);
  const startPolling = useDeviceStore((s) => s.startPolling);
  const stopPolling = useDeviceStore((s) => s.stopPolling);

  // Layout Store
  const sidebarWidth = useLayoutStore((s) => s.sidebarWidth);
  const resetSidebarWidth = useLayoutStore((s) => s.resetSidebarWidth);
  const requestResponseRatio = useLayoutStore((s) => s.requestResponseRatio);
  const resetRequestResponseRatio = useLayoutStore((s) => s.resetRequestResponseRatio);

  // Refs for accessibility & focus trapping
  const modalContentRef = useRef<HTMLDivElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);
  const createInputRef = useRef<HTMLInputElement>(null);

  // Polling lifecycle: start when open, stop when closed
  useEffect(() => {
    if (!isOpen) return;

    startPolling(3000);
    return () => {
      stopPolling();
    };
  }, [isOpen, startPolling, stopPolling]);

  // Focus management on open/close
  useEffect(() => {
    if (isOpen) {
      previousActiveElementRef.current = (document.activeElement as HTMLElement) || null;
      if (defaultTab) {
        setActiveTab(defaultTab);
      }
    } else {
      setIsCreateDialogOpen(false);
      setOneTimeTokenData(null);
      setInstructionsDevice(null);
      setCreateError(null);
      setActionError(null);
      if (previousActiveElementRef.current && typeof previousActiveElementRef.current.focus === 'function') {
        previousActiveElementRef.current.focus();
        previousActiveElementRef.current = null;
      }
    }
  }, [isOpen, defaultTab]);

  // Auto-focus input when create dialog opens
  useEffect(() => {
    if (isCreateDialogOpen) {
      const timer = setTimeout(() => {
        createInputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isCreateDialogOpen]);

  // Keyboard navigation: Escape key & Tab trapping
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (oneTimeTokenData) {
          setOneTimeTokenData(null);
          return;
        }
        if (instructionsDevice) {
          setInstructionsDevice(null);
          return;
        }
        if (isCreateDialogOpen) {
          setIsCreateDialogOpen(false);
          setCreateError(null);
          return;
        }
        onClose();
        return;
      }

      if (e.key === 'Tab') {
        if (oneTimeTokenData || instructionsDevice || isCreateDialogOpen) {
          return;
        }

        if (!modalContentRef.current) return;
        const focusableElements = Array.from(
          modalContentRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        ).filter((el) => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true');

        if (focusableElements.length === 0) return;

        const first = focusableElements[0];
        const last = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first || !modalContentRef.current.contains(document.activeElement)) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last || !modalContentRef.current.contains(document.activeElement)) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, isCreateDialogOpen, oneTimeTokenData, instructionsDevice]);

  const onlineAgentsCount = useMemo(() => {
    return devices.filter((d) => d.isOnline && !d.isRevoked).length;
  }, [devices]);

  const originUrl = useMemo(() => {
    if (typeof window !== 'undefined' && window.location?.origin) {
      return window.location.origin;
    }
    return 'http://localhost:5000';
  }, []);

  const copyToClipboard = async (text: string, onSuccess: () => void) => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        onSuccess();
      }
    } catch {
      // Fallback
    }
  };

  const handleOpenCreateDialog = () => {
    setNewDeviceName('');
    setCreateError(null);
    setIsCreateDialogOpen(true);
  };

  const handleCreateSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = newDeviceName.trim();
    if (!trimmed) {
      setCreateError(t('settings.deviceNameRequired'));
      return;
    }

    setIsCreating(true);
    setCreateError(null);

    try {
      const response = await createDevice(trimmed);
      setIsCreateDialogOpen(false);
      setNewDeviceName('');
      setOneTimeTokenData({
        rawToken: response.rawToken,
        tokenPrefix: response.tokenPrefix,
        deviceName: response.name,
        isRegenerated: false,
      });
      setIsTokenMasked(false);
      setTokenCopied(false);
      setCommandCopied(false);
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : t('settings.failedToCreateDevice');
      setCreateError(message);
    } finally {
      setIsCreating(false);
    }
  };

  const handleRegenerate = async (device: AgentDeviceDto) => {
    setActionInProgressId(device.id);
    setActionError(null);
    try {
      const response = await regenerateToken(device.id);
      setOneTimeTokenData({
        rawToken: response.rawToken,
        tokenPrefix: response.tokenPrefix,
        deviceName: device.name,
        isRegenerated: true,
      });
      setIsTokenMasked(false);
      setTokenCopied(false);
      setCommandCopied(false);
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : t('settings.failedToRegenerateToken');
      setActionError(message);
    } finally {
      setActionInProgressId(null);
    }
  };

  const handleRevoke = async (device: AgentDeviceDto) => {
    setActionInProgressId(device.id);
    setActionError(null);
    try {
      await revokeDevice(device.id);
      if (activeDeviceId === device.id) {
        setActiveDeviceId(null);
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : t('settings.failedToRevokeDevice');
      setActionError(message);
    } finally {
      setActionInProgressId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="global-settings-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={modalContentRef}
        className="w-full max-w-4xl bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl overflow-hidden flex flex-col h-[640px] max-h-[90vh] text-neutral-100"
      >
        {/* Modal Top Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800 bg-neutral-950/70 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <Sliders className="w-4 h-4" aria-hidden="true" />
            </div>
            <div>
              <h2 id="global-settings-modal-title" className="text-sm font-semibold text-white">
                {t('settings.title')}
              </h2>
              <p className="text-xs text-neutral-400">
                {t('settings.subtitle')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('settings.closeSettingsAria')}
            className="text-neutral-400 hover:text-white p-1 rounded-md hover:bg-neutral-800 transition-colors focus:outline-none focus:ring-2 focus:ring-neutral-400"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Modal Body: Left Sidebar Tabs + Right Content Panel */}
        <div className="flex flex-1 overflow-hidden flex-col md:flex-row">
          {/* Sidebar Tabs */}
          <nav
            role="tablist"
            aria-label={t('settings.title')}
            className="w-full md:w-56 border-b md:border-b-0 md:border-r border-neutral-800 bg-neutral-950/40 p-2 md:p-3 flex flex-row md:flex-col gap-1.5 shrink-0 select-none overflow-x-auto md:overflow-visible"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'general'}
              aria-controls="tabpanel-general"
              id="tab-general"
              onClick={() => setActiveTab('general')}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all text-left ${
                activeTab === 'general'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-neutral-400 hover:text-white hover:bg-neutral-800/60'
              }`}
            >
              <Sliders className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{t('settings.generalTab')}</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'agents'}
              aria-controls="tabpanel-agents"
              id="tab-agents"
              onClick={() => setActiveTab('agents')}
              className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all text-left ${
                activeTab === 'agents'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-neutral-400 hover:text-white hover:bg-neutral-800/60'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Laptop className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>{t('settings.agentsTab')}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span
                  title={t('settings.agentsOnlineCount', { count: onlineAgentsCount })}
                  className={`w-2 h-2 rounded-full ${
                    onlineAgentsCount > 0 ? 'bg-emerald-400 animate-pulse' : 'bg-neutral-600'
                  }`}
                />
                <span className="text-[11px] font-semibold opacity-90">{onlineAgentsCount}</span>
              </div>
            </button>
          </nav>

          {/* Right Content Area */}
          <main className="flex-1 overflow-y-auto p-4 sm:p-6 bg-neutral-900/60 flex flex-col">
            {/* Global Errors Banner */}
            {(storeError || actionError) && (
              <div
                role="alert"
                className="mb-4 flex items-start gap-2.5 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs shrink-0"
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                <span className="flex-1">{actionError || storeError}</span>
                <button
                  type="button"
                  onClick={() => setActionError(null)}
                  className="text-rose-400 hover:text-rose-200"
                  aria-label="Dispensar erro"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* TAB 1: GERAL & INTERFACE */}
            {activeTab === 'general' && (
              <div
                role="tabpanel"
                id="tabpanel-general"
                aria-labelledby="tab-general"
                className="flex flex-col gap-6"
              >
                <div>
                  <h3 className="text-sm font-semibold text-white">{t('settings.generalTab')}</h3>
                  <p className="text-xs text-neutral-400">
                    {t('settings.generalDesc')}
                  </p>
                </div>

                <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 divide-y divide-neutral-800/60 overflow-hidden text-xs">
                  {/* Idioma / Language */}
                  <div className="flex items-center justify-between p-3.5 sm:p-4">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-semibold text-white">{t('settings.language')}</span>
                      <span className="text-neutral-400">{t('settings.languageDesc')}</span>
                    </div>
                    <select
                      id="language-select"
                      aria-label={t('settings.language')}
                      value={locale}
                      onChange={(e) => void setLocale(e.target.value as Locale)}
                      className="bg-neutral-900 border border-neutral-800 text-xs text-neutral-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer hover:border-neutral-700 transition-colors"
                    >
                      <option value="en-US">{t('settings.english')}</option>
                      <option value="pt-BR">{t('settings.portuguese')}</option>
                    </select>
                  </div>

                  {/* Versão da Aplicação */}
                  <div className="flex items-center justify-between p-3.5 sm:p-4">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-semibold text-white">
                        {t('settings.appVersion')}
                      </span>
                      <span className="text-neutral-400">
                        {t('settings.appVersionDesc')}
                      </span>
                    </div>
                    <span className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-neutral-900 border border-neutral-800 text-blue-400">
                      ApiDot {formatDisplayVersion(APP_VERSION)} • {t('settings.stable')}
                    </span>
                  </div>

                  {/* Tema Visual */}
                  <div className="flex items-center justify-between p-3.5 sm:p-4">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-semibold text-white">
                        {t('settings.visualTheme')}
                      </span>
                      <span className="text-neutral-400">
                        {t('settings.visualThemeDesc')}
                      </span>
                    </div>
                    <span className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-neutral-900 border border-neutral-800 text-neutral-200">
                      {t('settings.darkDefault')}
                    </span>
                  </div>

                  {/* Largura da Barra Lateral */}
                  <div className="flex items-center justify-between p-3.5 sm:p-4">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-semibold text-white">{t('settings.sidebarWidth')}</span>
                      <span className="text-neutral-400">
                        {t('settings.sidebarWidthDesc')}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-1 rounded bg-neutral-900 border border-neutral-800 font-mono text-[11px] text-blue-400">
                        {sidebarWidth} px
                      </span>
                      <button
                        type="button"
                        onClick={resetSidebarWidth}
                        className="h-7 px-2.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white transition-colors text-[11px] inline-flex items-center cursor-pointer"
                      >
                        {t('common.restoreDefault')}
                      </button>
                    </div>
                  </div>

                  {/* Divisão Requisição / Resposta */}
                  <div className="flex items-center justify-between p-3.5 sm:p-4">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-semibold text-white">{t('settings.requestResponseRatio')}</span>
                      <span className="text-neutral-400">
                        {t('settings.splitRatioDesc')}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-1 rounded bg-neutral-900 border border-neutral-800 font-mono text-[11px] text-blue-400">
                        {requestResponseRatio}% / {100 - requestResponseRatio}%
                      </span>
                      <button
                        type="button"
                        onClick={resetRequestResponseRatio}
                        className="h-7 px-2.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white transition-colors text-[11px] inline-flex items-center cursor-pointer"
                      >
                        {t('common.restoreDefault')}
                      </button>
                    </div>
                  </div>

                  {/* Timeout de Execução */}
                  <div className="flex items-center justify-between p-3.5 sm:p-4">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-semibold text-white">{t('settings.executionTimeout')}</span>
                      <span className="text-neutral-400">
                        {t('settings.timeoutDesc')}
                      </span>
                    </div>
                    <span className="text-neutral-300 font-mono text-[11px]">
                      30.000 ms (30s)
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: LOCAL AGENTS */}
            {activeTab === 'agents' && (
              <div
                role="tabpanel"
                id="tabpanel-agents"
                aria-labelledby="tab-agents"
                className="flex flex-col gap-6"
              >
                {/* Header section with register button */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-white">
                      {t('settings.devicesAndAgents')}
                    </h3>
                    <p className="text-xs text-neutral-400">
                      {t('settings.devicesSubtitle')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void fetchDevices()}
                      disabled={isLoading}
                      aria-label={t('common.refresh')}
                      title={t('common.refresh')}
                      className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-neutral-800 bg-neutral-950/60 hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors disabled:opacity-50 cursor-pointer shrink-0"
                    >
                      <RefreshCw
                        className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`}
                        aria-hidden="true"
                      />
                    </button>
                    <button
                      type="button"
                      onClick={handleOpenCreateDialog}
                      className="h-8 inline-flex items-center gap-1.5 px-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 cursor-pointer shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>{t('settings.registerDevice')}</span>
                    </button>
                  </div>
                </div>

                {/* Registered Devices List */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between text-xs text-neutral-400 px-1">
                    <span>{t('settings.devicesCount', { count: devices.length })}</span>
                  </div>

                  {devices.length === 0 ? (
                    <div className="p-8 rounded-xl border border-dashed border-neutral-800 text-center flex flex-col items-center justify-center gap-2 text-neutral-400">
                      <Laptop className="w-8 h-8 text-neutral-600 mb-1" />
                      <p className="text-xs font-medium text-neutral-300">
                        {t('settings.noAgents')}
                      </p>
                      <p className="text-xs max-w-sm">
                        {t('settings.noAgentsDesc')}
                      </p>
                      <button
                        type="button"
                        onClick={handleOpenCreateDialog}
                        className="mt-2 h-8 inline-flex items-center gap-1.5 px-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>{t('settings.registerDevice')}</span>
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {devices.map((device) => {
                        const isThisActive = activeDeviceId === device.id;
                        const isBusy = actionInProgressId === device.id;

                        return (
                          <div
                            key={device.id}
                            data-testid={`device-card-${device.id}`}
                            className={`p-3.5 sm:p-4 rounded-xl border transition-colors flex flex-col gap-3 text-xs ${
                              device.isRevoked
                                ? 'border-rose-900/30 bg-rose-950/10 opacity-75'
                                : 'border-neutral-800 bg-neutral-950/40 hover:border-neutral-700'
                            }`}
                          >
                            {/* Device Details */}
                            <div className="flex items-start gap-3 min-w-0">
                              <div
                                className={`p-2 rounded-lg shrink-0 mt-0.5 ${
                                  device.isRevoked
                                    ? 'bg-rose-500/10 text-rose-400'
                                    : device.isOnline
                                    ? 'bg-emerald-500/10 text-emerald-400'
                                    : 'bg-neutral-800 text-neutral-400'
                                }`}
                              >
                                <Laptop className="w-4 h-4" aria-hidden="true" />
                              </div>

                              <div className="flex flex-col gap-1 min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-semibold text-white text-xs">
                                    {device.name}
                                  </span>

                                  {/* Status indicator */}
                                  {device.isRevoked ? (
                                    <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-rose-500/20 text-rose-400 border border-rose-500/30">
                                      {t('settings.statusRevoked')}
                                    </span>
                                  ) : device.isOnline ? (
                                    <span className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                      {t('settings.statusOnline')}
                                    </span>
                                  ) : (
                                    <span className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium bg-neutral-800 text-neutral-400 border border-neutral-700">
                                      <span className="w-1.5 h-1.5 rounded-full bg-neutral-500" />
                                      {t('settings.statusOffline')}
                                    </span>
                                  )}
                                </div>

                                <div className="flex items-center gap-2 sm:gap-3 text-neutral-400 text-[11px] flex-wrap">
                                  <span>
                                    {device.lastConnectedHostname
                                      ? `Host: ${device.lastConnectedHostname} (${device.lastConnectedOs || 'OS'})`
                                      : t('settings.neverConnected')}
                                  </span>
                                  {device.agentVersion && (
                                    <>
                                      <span>•</span>
                                      <span>v{device.agentVersion}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Actions Toolbar */}
                            <div className="flex items-center justify-between sm:justify-end gap-1.5 pt-2.5 border-t border-neutral-800/60 flex-wrap">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <button
                                  type="button"
                                  onClick={() => setInstructionsDevice(device)}
                                  className="h-7 px-2.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 hover:text-white transition-colors text-[11px] inline-flex items-center cursor-pointer"
                                >
                                  {t('common.instructions')}
                                </button>

                                {!device.isRevoked && (
                                  <button
                                    type="button"
                                    onClick={() => handleRegenerate(device)}
                                    disabled={isBusy}
                                    title={t('settings.regenerateToken')}
                                    className="h-7 px-2.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 hover:text-white transition-colors disabled:opacity-50 inline-flex items-center gap-1 text-[11px] cursor-pointer"
                                  >
                                    {isBusy ? (
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : (
                                      <RefreshCw className="w-3 h-3" />
                                    )}
                                    <span>{t('settings.regenerateToken')}</span>
                                  </button>
                                )}
                              </div>

                              <button
                                type="button"
                                onClick={() => handleRevoke(device)}
                                disabled={device.isRevoked || isBusy}
                                title={t('settings.revokeDevice')}
                                className="h-7 px-2.5 rounded-lg text-neutral-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors disabled:opacity-40 disabled:hover:text-neutral-400 disabled:hover:bg-transparent text-[11px] inline-flex items-center gap-1 ml-auto sm:ml-0 cursor-pointer"
                              >
                                <Trash2 className="w-3 h-3" />
                                <span>
                                  {device.isRevoked
                                    ? t('settings.statusRevoked')
                                    : t('settings.revoke')}
                                </span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </main>
        </div>
      </div>

      {/* SUB-MODAL 1: CADASTRAR DISPOSITIVO */}
      {isCreateDialogOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-device-modal-title"
          className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in zoom-in-95 duration-150"
        >
          <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-800 bg-neutral-950/70">
              <div className="flex items-center gap-2">
                <Laptop className="w-4 h-4 text-blue-400" />
                <h3 id="create-device-modal-title" className="text-sm font-semibold text-white">
                  {t('settings.registerNewDevice')}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateDialogOpen(false)}
                aria-label={t('settings.closeRegistrationAria')}
                className="text-neutral-400 hover:text-white p-1 rounded hover:bg-neutral-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="p-5 flex flex-col gap-4 text-xs">
              {createError && (
                <div
                  role="alert"
                  className="flex items-start gap-2 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400"
                >
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{createError}</span>
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <label htmlFor="device-name-input" className="font-medium text-neutral-300">
                  {t('settings.deviceName')}
                </label>
                <input
                  ref={createInputRef}
                  id="device-name-input"
                  type="text"
                  value={newDeviceName}
                  onChange={(e) => {
                    setNewDeviceName(e.target.value);
                    if (createError) setCreateError(null);
                  }}
                  disabled={isCreating}
                  maxLength={100}
                  placeholder={t('settings.deviceNamePlaceholder')}
                  className="px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                />
                <span className="text-[11px] text-neutral-500">
                  {t('settings.deviceNameHint')}
                </span>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-800">
                <button
                  type="button"
                  onClick={() => setIsCreateDialogOpen(false)}
                  disabled={isCreating}
                  className="px-3 py-2 rounded-lg text-neutral-300 hover:text-white hover:bg-neutral-800 transition-colors"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isCreating || !newDeviceName.trim()}
                  className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isCreating ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>{t('settings.registering')}</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-3.5 h-3.5" />
                      <span>{t('settings.register')}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SUB-MODAL 2: ONE-TIME PAT TOKEN DIALOG */}
      {oneTimeTokenData && (
        <div
          data-testid="one-time-token-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="one-time-token-title"
          className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in zoom-in-95 duration-150"
        >
          <div className="w-full max-w-lg bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl overflow-hidden flex flex-col text-xs">
            <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-800 bg-neutral-950/70">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <h3 id="one-time-token-title" className="text-sm font-semibold text-white">
                  {oneTimeTokenData.isRegenerated
                    ? t('settings.tokenRegeneratedSuccess')
                    : t('settings.deviceRegisteredSuccess')}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setOneTimeTokenData(null)}
                aria-label={t('settings.closeTokenDialogAria')}
                className="text-neutral-400 hover:text-white p-1 rounded hover:bg-neutral-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 flex flex-col gap-4">
              {/* Warning Callout */}
              <div
                role="alert"
                className="flex items-start gap-2.5 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300"
              >
                <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div className="flex flex-col gap-0.5">
                  <span className="font-semibold text-amber-200">
                    {t('settings.attentionSaveToken')}
                  </span>
                  <span>
                    {t('settings.tokenWarningDesc')}
                  </span>
                </div>
              </div>

              {/* Raw Token Box */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-neutral-300">
                  <span className="font-medium">
                    {t('settings.accessTokenPat')}
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsTokenMasked(!isTokenMasked)}
                    className="flex items-center gap-1 text-[11px] text-neutral-400 hover:text-white"
                  >
                    {isTokenMasked ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                    <span>
                      {isTokenMasked
                        ? t('settings.show')
                        : t('settings.hide')}
                    </span>
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg font-mono text-neutral-200 truncate select-all">
                    {isTokenMasked
                      ? '•'.repeat(Math.min(oneTimeTokenData.rawToken.length, 36))
                      : oneTimeTokenData.rawToken}
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      copyToClipboard(oneTimeTokenData.rawToken, () => setTokenCopied(true))
                    }
                    className="flex items-center gap-1.5 px-3 py-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg transition-colors font-medium shrink-0"
                  >
                    {tokenCopied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span>{t('common.copied')}</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>{t('common.copy')}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Setup Commands Box */}
              <div className="flex flex-col gap-1.5">
                <span className="font-medium text-neutral-300">
                  {t('settings.quickStartCommands')}
                </span>
                <div className="relative group bg-neutral-950 border border-neutral-800 rounded-lg p-3 font-mono text-[11px] text-neutral-300 flex flex-col gap-2">
                  <div className="text-neutral-400">
                    {t('settings.installScriptComment')}
                  </div>
                  <div className="text-emerald-400 select-all">
                    curl -fsSL {originUrl}/install.sh | bash
                  </div>

                  <div className="text-neutral-400 pt-1">
                    {t('settings.registerServiceComment')}
                  </div>
                  <div className="text-blue-400 select-all break-all">
                    apidot-agent service install --server {originUrl} --token {oneTimeTokenData.rawToken}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      const fullCommand = `curl -fsSL ${originUrl}/install.sh | bash && apidot-agent service install --server ${originUrl} --token ${oneTimeTokenData.rawToken}`;
                      copyToClipboard(fullCommand, () => setCommandCopied(true));
                    }}
                    className="self-end mt-1 flex items-center gap-1.5 px-2.5 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-white transition-colors text-[11px]"
                  >
                    {commandCopied ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-400" />
                        <span>{t('settings.commandsCopied')}</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>{t('settings.copyCommands')}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-end pt-2 border-t border-neutral-800">
                <button
                  type="button"
                  onClick={() => setOneTimeTokenData(null)}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg transition-colors"
                >
                  {t('settings.finishClose')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUB-MODAL 3: INSTRUÇÕES DE INSTALAÇÃO */}
      {instructionsDevice && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="instructions-modal-title"
          className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in zoom-in-95 duration-150"
        >
          <div className="w-full max-w-lg bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl overflow-hidden flex flex-col text-xs">
            <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-800 bg-neutral-950/70">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-blue-400" />
                <h3 id="instructions-modal-title" className="text-sm font-semibold text-white">
                  {t('settings.instructionsForDevice', { name: instructionsDevice.name })}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setInstructionsDevice(null)}
                aria-label={t('settings.closeInstructionsAria')}
                className="text-neutral-400 hover:text-white p-1 rounded hover:bg-neutral-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 flex flex-col gap-4">
              <p className="text-neutral-400">
                {t('settings.instructionsSubtitle')}
              </p>

              <div className="flex flex-col gap-2">
                <span className="font-semibold text-white">
                  {t('settings.step1Title')}
                </span>
                <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-3 font-mono text-[11px] text-emerald-400">
                  <div className="text-neutral-500 mb-1"># macOS / Linux:</div>
                  <div>curl -fsSL {originUrl}/install.sh | bash</div>
                  <div className="text-neutral-500 mt-2 mb-1"># Windows PowerShell:</div>
                  <div className="text-neutral-300">powershell -c &quot;irm {originUrl}/install.ps1 | iex&quot;</div>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <span className="font-semibold text-white">
                  {t('settings.step2Title')}
                </span>
                <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-3 font-mono text-[11px] text-blue-400">
                  <div>apidot-agent service install --server {originUrl} --token &lt;SEU_TOKEN&gt;</div>
                </div>
                <span className="text-[11px] text-neutral-500">
                  {t('settings.step2Desc')}
                </span>
              </div>

              <div className="flex flex-col gap-2">
                <span className="font-semibold text-white">
                  {t('settings.step3Title')}
                </span>
                <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-3 font-mono text-[11px] text-neutral-300">
                  <div>apidot-agent connect --server {originUrl} --token &lt;SEU_TOKEN&gt;</div>
                </div>
              </div>

              <div className="flex items-center justify-end pt-2 border-t border-neutral-800">
                <button
                  type="button"
                  onClick={() => setInstructionsDevice(null)}
                  className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white font-medium rounded-lg transition-colors"
                >
                  {t('settings.gotIt')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
