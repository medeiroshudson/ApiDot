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
  Link,
  Unlink,
  Loader2,
  ShieldAlert,
} from 'lucide-react';
import { useDeviceStore } from '@/stores/useDeviceStore';
import { useLayoutStore } from '@/stores/useLayoutStore';
import { AgentDeviceDto } from '@/lib/deviceApi';

export type SettingsTab = 'agents' | 'general';

export interface GlobalSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTab?: SettingsTab;
}

export function GlobalSettingsModal({
  isOpen,
  onClose,
  defaultTab = 'agents',
}: GlobalSettingsModalProps) {
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
  const [instructionsCopied, setInstructionsCopied] = useState(false);

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

  const activeDevice = useMemo(() => {
    if (!activeDeviceId) return null;
    return devices.find((d) => d.id === activeDeviceId) || null;
  }, [activeDeviceId, devices]);

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
      setCreateError('O nome do dispositivo é obrigatório.');
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
      const message = err instanceof Error ? err.message : 'Falha ao cadastrar dispositivo.';
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
      const message = err instanceof Error ? err.message : 'Falha ao regenerar token.';
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
      const message = err instanceof Error ? err.message : 'Falha ao revogar dispositivo.';
      setActionError(message);
    } finally {
      setActionInProgressId(null);
    }
  };

  const handleToggleLinkDevice = (device: AgentDeviceDto) => {
    if (activeDeviceId === device.id) {
      setActiveDeviceId(null);
    } else {
      setActiveDeviceId(device.id);
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
                Configurações Globais
              </h2>
              <p className="text-xs text-neutral-400">
                Gerencie os agentes de execução local, preferências de interface e ambiente
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar configurações globais"
            className="text-neutral-400 hover:text-white p-1 rounded-md hover:bg-neutral-800 transition-colors focus:outline-none focus:ring-2 focus:ring-neutral-400"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Modal Body: Left Sidebar Tabs + Right Content Panel */}
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar Tabs */}
          <nav
            role="tablist"
            aria-label="Abas de configurações globais"
            className="w-56 border-r border-neutral-800 bg-neutral-950/40 p-3 flex flex-col gap-1.5 shrink-0 select-none"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'agents'}
              aria-controls="tabpanel-agents"
              id="tab-agents"
              onClick={() => setActiveTab('agents')}
              className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium transition-all text-left ${
                activeTab === 'agents'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-neutral-300 hover:bg-neutral-800 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Laptop className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>Local Agents</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span
                  title={`${onlineAgentsCount} agente(s) online`}
                  className={`w-2 h-2 rounded-full ${
                    onlineAgentsCount > 0 ? 'bg-emerald-400 animate-pulse' : 'bg-neutral-600'
                  }`}
                />
                <span className="text-[11px] font-semibold opacity-90">{onlineAgentsCount}</span>
              </div>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'general'}
              aria-controls="tabpanel-general"
              id="tab-general"
              onClick={() => setActiveTab('general')}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-medium transition-all text-left ${
                activeTab === 'general'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-neutral-300 hover:bg-neutral-800 hover:text-white'
              }`}
            >
              <Sliders className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>Geral & Interface</span>
            </button>
          </nav>

          {/* Right Content Area */}
          <main className="flex-1 overflow-y-auto p-6 bg-neutral-900/60 flex flex-col">
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

            {/* TAB 1: LOCAL AGENTS */}
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
                    <h3 className="text-sm font-semibold text-white">Dispositivos & Local Agents</h3>
                    <p className="text-xs text-neutral-400">
                      Instale o agent no seu computador para executar requisições locais e acessar redes privadas.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => fetchDevices()}
                      disabled={isLoading}
                      aria-label="Atualizar lista de dispositivos"
                      title="Atualizar lista de dispositivos"
                      className="p-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white transition-colors disabled:opacity-50"
                    >
                      <RefreshCw
                        className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`}
                        aria-hidden="true"
                      />
                    </button>
                    <button
                      type="button"
                      onClick={handleOpenCreateDialog}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>+ Cadastrar Dispositivo</span>
                    </button>
                  </div>
                </div>

                {/* Banner: Active Device Linked to this Browser */}
                {activeDeviceId ? (
                  <div
                    data-testid="active-device-banner"
                    className="p-4 rounded-xl border border-blue-500/30 bg-blue-500/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-lg bg-blue-500/20 text-blue-400 shrink-0">
                        <Link className="w-4 h-4" aria-hidden="true" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-white">
                            Dispositivo vinculado a este navegador:
                          </span>
                          <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 font-medium">
                            {activeDevice?.name || activeDeviceId}
                          </span>
                          {activeDevice && (
                            <span
                              className={`flex items-center gap-1 font-medium ${
                                activeDevice.isRevoked
                                  ? 'text-rose-400'
                                  : activeDevice.isOnline
                                  ? 'text-emerald-400'
                                  : 'text-neutral-400'
                              }`}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  activeDevice.isRevoked
                                    ? 'bg-rose-500'
                                    : activeDevice.isOnline
                                    ? 'bg-emerald-400 animate-pulse'
                                    : 'bg-neutral-500'
                                }`}
                              />
                              {activeDevice.isRevoked
                                ? 'Revogado'
                                : activeDevice.isOnline
                                ? 'Online'
                                : 'Offline'}
                            </span>
                          )}
                        </div>
                        <p className="text-neutral-400 mt-1">
                          {activeDevice?.lastConnectedHostname
                            ? `Host: ${activeDevice.lastConnectedHostname} (${activeDevice.lastConnectedOs || 'OS'})`
                            : 'Aguardando primeira conexão do agente local'}
                          {activeDevice?.tokenPrefix && ` • Prefixo: ${activeDevice.tokenPrefix}`}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveDeviceId(null)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 hover:text-white border border-neutral-700 transition-colors shrink-0"
                    >
                      <Unlink className="w-3.5 h-3.5 text-neutral-400" aria-hidden="true" />
                      <span>Desvincular</span>
                    </button>
                  </div>
                ) : (
                  <div
                    data-testid="no-active-device-banner"
                    className="p-4 rounded-xl border border-neutral-800 bg-neutral-950/40 flex items-center justify-between text-xs text-neutral-400"
                  >
                    <div className="flex items-center gap-2.5">
                      <Laptop className="w-4 h-4 text-neutral-500" aria-hidden="true" />
                      <span>
                        Nenhum agente vinculado a este navegador. Vincule um dispositivo abaixo para executar requisições locais.
                      </span>
                    </div>
                  </div>
                )}

                {/* Registered Devices List */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between text-xs text-neutral-400 px-1">
                    <span>Dispositivos Registrados ({devices.length})</span>
                  </div>

                  {devices.length === 0 ? (
                    <div className="p-8 rounded-xl border border-dashed border-neutral-800 text-center flex flex-col items-center justify-center gap-2 text-neutral-400">
                      <Laptop className="w-8 h-8 text-neutral-600 mb-1" />
                      <p className="text-xs font-medium text-neutral-300">
                        Nenhum agente local cadastrado.
                      </p>
                      <p className="text-xs max-w-sm">
                        Cadastre seu computador ou servidor para executar chamadas de APIs em redes internas (localhost, VPN, Tailscale).
                      </p>
                      <button
                        type="button"
                        onClick={handleOpenCreateDialog}
                        className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Cadastrar Dispositivo</span>
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
                            className={`p-4 rounded-xl border transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs ${
                              device.isRevoked
                                ? 'border-rose-900/30 bg-rose-950/10 opacity-75'
                                : isThisActive
                                ? 'border-blue-500/40 bg-neutral-950/70 shadow-sm'
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

                              <div className="flex flex-col gap-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-semibold text-white text-xs truncate max-w-[200px] sm:max-w-none">
                                    {device.name}
                                  </span>

                                  {/* Status indicator */}
                                  {device.isRevoked ? (
                                    <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-rose-500/20 text-rose-400 border border-rose-500/30">
                                      Revogado
                                    </span>
                                  ) : device.isOnline ? (
                                    <span className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                      Online
                                    </span>
                                  ) : (
                                    <span className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium bg-neutral-800 text-neutral-400 border border-neutral-700">
                                      <span className="w-1.5 h-1.5 rounded-full bg-neutral-500" />
                                      Offline
                                    </span>
                                  )}

                                  {isThisActive && (
                                    <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-blue-500/20 text-blue-300 border border-blue-500/30">
                                      Vinculado
                                    </span>
                                  )}
                                </div>

                                <div className="flex items-center gap-3 text-neutral-400 flex-wrap">
                                  <span className="font-mono text-[11px] text-neutral-300">
                                    {device.tokenPrefix}
                                  </span>
                                  <span>•</span>
                                  <span>
                                    {device.lastConnectedHostname
                                      ? `${device.lastConnectedHostname} (${device.lastConnectedOs || 'OS'})`
                                      : 'Nunca conectado'}
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

                            {/* Actions Buttons */}
                            <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                              <button
                                type="button"
                                onClick={() => setInstructionsDevice(device)}
                                className="px-2.5 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 hover:text-white transition-colors"
                              >
                                Instruções
                              </button>

                              {!device.isRevoked && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleRegenerate(device)}
                                    disabled={isBusy}
                                    title="Regenerar Token"
                                    className="px-2.5 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 hover:text-white transition-colors disabled:opacity-50 flex items-center gap-1"
                                  >
                                    {isBusy ? (
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : (
                                      <RefreshCw className="w-3 h-3" />
                                    )}
                                    <span>Regenerar Token</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleToggleLinkDevice(device)}
                                    className={`px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1 font-medium ${
                                      isThisActive
                                        ? 'bg-blue-600/20 text-blue-300 border border-blue-500/30 hover:bg-blue-600/30'
                                        : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-200 hover:text-white'
                                    }`}
                                  >
                                    {isThisActive ? (
                                      <>
                                        <Unlink className="w-3 h-3 text-blue-400" />
                                        <span>Desvincular</span>
                                      </>
                                    ) : (
                                      <>
                                        <Link className="w-3 h-3 text-neutral-400" />
                                        <span>Vincular a este Navegador</span>
                                      </>
                                    )}
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleRevoke(device)}
                                    disabled={isBusy}
                                    title="Revogar Dispositivo"
                                    className="px-2.5 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 transition-colors disabled:opacity-50 flex items-center gap-1"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                    <span>Revogar</span>
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 2: GERAL & INTERFACE */}
            {activeTab === 'general' && (
              <div
                role="tabpanel"
                id="tabpanel-general"
                aria-labelledby="tab-general"
                className="flex flex-col gap-6"
              >
                <div>
                  <h3 className="text-sm font-semibold text-white">Configurações Gerais & Interface</h3>
                  <p className="text-xs text-neutral-400">
                    Preferências do sistema, versões e layout dos painéis de edição.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* System Version */}
                  <div className="p-4 rounded-xl border border-neutral-800 bg-neutral-950/40 flex flex-col gap-1.5">
                    <span className="text-xs text-neutral-400">Versão da Plataforma</span>
                    <div className="flex items-center gap-2">
                      <span className="text-base font-semibold text-white">ApiDot v0.4.0</span>
                      <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        Estável
                      </span>
                    </div>
                    <span className="text-[11px] text-neutral-500">
                      Motor de execução híbrido .NET 9 + Next.js 15
                    </span>
                  </div>

                  {/* Theme */}
                  <div className="p-4 rounded-xl border border-neutral-800 bg-neutral-950/40 flex flex-col gap-1.5">
                    <span className="text-xs text-neutral-400">Tema da Interface</span>
                    <span className="text-sm font-semibold text-white">Escuro (Padrão ApiDot)</span>
                    <span className="text-[11px] text-neutral-500">
                      Otimizado para alto contraste e inspeção de payloads
                    </span>
                  </div>

                  {/* Request Timeout */}
                  <div className="p-4 rounded-xl border border-neutral-800 bg-neutral-950/40 flex flex-col gap-1.5">
                    <span className="text-xs text-neutral-400">Timeout Padrão de Execução</span>
                    <span className="text-sm font-semibold text-white">30.000 ms (30s)</span>
                    <span className="text-[11px] text-neutral-500">
                      Limite de tempo máximo para requisições Cloud e Agent
                    </span>
                  </div>

                  {/* Layout Reset Controls */}
                  <div className="p-4 rounded-xl border border-neutral-800 bg-neutral-950/40 flex flex-col gap-2.5">
                    <span className="text-xs text-neutral-400">Painéis & Layout</span>
                    <div className="flex items-center justify-between text-xs text-neutral-300">
                      <span>Barra Lateral: {sidebarWidth}px</span>
                      <button
                        type="button"
                        onClick={resetSidebarWidth}
                        className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white transition-colors"
                      >
                        Restaurar Padrão
                      </button>
                    </div>
                    <div className="flex items-center justify-between text-xs text-neutral-300">
                      <span>Divisão Requisição: {requestResponseRatio}%</span>
                      <button
                        type="button"
                        onClick={resetRequestResponseRatio}
                        className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white transition-colors"
                      >
                        Restaurar Padrão
                      </button>
                    </div>
                  </div>
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
                  Cadastrar Novo Dispositivo
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateDialogOpen(false)}
                aria-label="Fechar cadastro de dispositivo"
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
                  Nome do Dispositivo
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
                  placeholder="Ex: MacBook Pro Hudson"
                  className="px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                />
                <span className="text-[11px] text-neutral-500">
                  Um nome amigável para identificar este nó de execução.
                </span>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-800">
                <button
                  type="button"
                  onClick={() => setIsCreateDialogOpen(false)}
                  disabled={isCreating}
                  className="px-3 py-2 rounded-lg text-neutral-300 hover:text-white hover:bg-neutral-800 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isCreating || !newDeviceName.trim()}
                  className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isCreating ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Cadastrando...</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-3.5 h-3.5" />
                      <span>Cadastrar</span>
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
                    ? 'Token Regenerado com Sucesso'
                    : 'Dispositivo Cadastrado com Sucesso'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setOneTimeTokenData(null)}
                aria-label="Fechar diálogo de token"
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
                  <span className="font-semibold text-amber-200">Atenção: Guarde este token agora</span>
                  <span>
                    Este token de acesso pessoal (PAT) não será exibido novamente. Caso perca, será necessário regenerá-lo.
                  </span>
                </div>
              </div>

              {/* Raw Token Box */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-neutral-300">
                  <span className="font-medium">Token de Acesso (PAT):</span>
                  <button
                    type="button"
                    onClick={() => setIsTokenMasked(!isTokenMasked)}
                    className="flex items-center gap-1 text-[11px] text-neutral-400 hover:text-white"
                  >
                    {isTokenMasked ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                    <span>{isTokenMasked ? 'Mostrar' : 'Ocultar'}</span>
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
                        <span>Copiado!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copiar</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Setup Commands Box */}
              <div className="flex flex-col gap-1.5">
                <span className="font-medium text-neutral-300">Comandos de Inicialização Rápida:</span>
                <div className="relative group bg-neutral-950 border border-neutral-800 rounded-lg p-3 font-mono text-[11px] text-neutral-300 flex flex-col gap-2">
                  <div className="text-neutral-400"># 1. Instalar o agent via script:</div>
                  <div className="text-emerald-400 select-all">
                    curl -fsSL {originUrl}/install.sh | bash
                  </div>

                  <div className="text-neutral-400 pt-1"># 2. Registrar como serviço do sistema:</div>
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
                        <span>Comando copiado!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>Copiar Comandos</span>
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
                  Concluir & Fechar
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
                  Instruções para &ldquo;{instructionsDevice.name}&rdquo;
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setInstructionsDevice(null)}
                aria-label="Fechar instruções"
                className="text-neutral-400 hover:text-white p-1 rounded hover:bg-neutral-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 flex flex-col gap-4">
              <p className="text-neutral-400">
                O agent do ApiDot roda como um daemon leve na máquina onde você deseja executar chamadas de rede local.
              </p>

              <div className="flex flex-col gap-2">
                <span className="font-semibold text-white">1. Instalação do Binário</span>
                <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-3 font-mono text-[11px] text-emerald-400">
                  <div className="text-neutral-500 mb-1"># macOS / Linux:</div>
                  <div>curl -fsSL {originUrl}/install.sh | bash</div>
                  <div className="text-neutral-500 mt-2 mb-1"># Windows PowerShell:</div>
                  <div className="text-neutral-300">powershell -c &quot;irm {originUrl}/install.ps1 | iex&quot;</div>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <span className="font-semibold text-white">2. Inicialização como Serviço de Fundo (Recomendado)</span>
                <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-3 font-mono text-[11px] text-blue-400">
                  <div>apidot-agent service install --server {originUrl} --token &lt;SEU_TOKEN&gt;</div>
                </div>
                <span className="text-[11px] text-neutral-500">
                  Instala e inicia via launchd (macOS), systemd --user (Linux) ou schtasks (Windows).
                </span>
              </div>

              <div className="flex flex-col gap-2">
                <span className="font-semibold text-white">3. Execução em Primeiro Plano (Para testes rápidos)</span>
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
                  Entendi
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
