import React from 'react';
import { render, screen, fireEvent, waitFor, act, within, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GlobalSettingsModal } from './GlobalSettingsModal';
import { useDeviceStore } from '@/stores/useDeviceStore';
import { useLayoutStore, INITIAL_LAYOUT_STATE } from '@/stores/useLayoutStore';
import { useI18nStore } from '@/stores/useI18nStore';
import { useUpdateStore } from '@/stores/useUpdateStore';
import { AgentDeviceDto } from '@/lib/deviceApi';
import { APP_VERSION, formatDisplayVersion } from '@/lib/version';
import {
  API_BASE_STORAGE_KEY,
  apiUrl,
  getApiBase,
  setApiBase,
} from '@/lib/api/base';
import { clearSessionMemory, getSession, setSession } from '@/lib/api/session';
import { saveDesktopSession } from '@/lib/desktop/session';

vi.mock('@/lib/desktop/session', () => ({
  loadDesktopSession: vi.fn().mockResolvedValue(null),
  saveDesktopSession: vi.fn().mockResolvedValue(undefined),
  clearDesktopSession: vi.fn().mockResolvedValue(undefined),
}));

const mockDevices: AgentDeviceDto[] = [
  {
    id: 'device-1',
    name: 'MacBook Pro Hudson',
    tokenPrefix: 'apidot_dev_12345678',
    createdAtUtc: '2026-10-27T10:00:00Z',
    lastConnectedAtUtc: '2026-10-27T10:05:00Z',
    lastConnectedHostname: 'macbook.local',
    lastConnectedOs: 'macOS',
    agentVersion: '0.4.0',
    isRevoked: false,
    isOnline: true,
  },
  {
    id: 'device-2',
    name: 'Home Server Linux',
    tokenPrefix: 'apidot_dev_87654321',
    createdAtUtc: '2026-10-27T09:00:00Z',
    lastConnectedAtUtc: null,
    lastConnectedHostname: null,
    lastConnectedOs: null,
    agentVersion: null,
    isRevoked: false,
    isOnline: false,
  },
  {
    id: 'device-3',
    name: 'Old Workstation',
    tokenPrefix: 'apidot_dev_00000000',
    createdAtUtc: '2026-10-20T08:00:00Z',
    lastConnectedAtUtc: '2026-10-21T08:00:00Z',
    lastConnectedHostname: 'old-pc.local',
    lastConnectedOs: 'Windows',
    agentVersion: '0.3.0',
    isRevoked: true,
    isOnline: false,
  },
];

const mockWriteText = vi.fn().mockResolvedValue(undefined);

describe('GlobalSettingsModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useDeviceStore.getState().reset();
    vi.spyOn(useDeviceStore.getState(), 'fetchDevices').mockResolvedValue([]);
    useLayoutStore.setState(INITIAL_LAYOUT_STATE);
    useI18nStore.setState({ locale: 'en-US' });
    useUpdateStore.getState().reset();
    delete (window as any).__TAURI__;
    delete (window as any).__TAURI_INTERNALS__;
    localStorage.clear();
    clearSessionMemory();

    Object.assign(navigator, {
      clipboard: {
        writeText: mockWriteText,
      },
    });
  });

  afterEach(() => {
    cleanup();
    delete (window as any).__TAURI__;
    delete (window as any).__TAURI_INTERNALS__;
    useUpdateStore.getState().reset();
    vi.restoreAllMocks();
  });

  it('GlobalSettingsModal renders sidebar tabs, lists devices and displays one-time token dialog on create', async () => {
    useDeviceStore.setState({
      devices: mockDevices,
      activeDeviceId: 'device-1',
    });

    const createDeviceSpy = vi.spyOn(useDeviceStore.getState(), 'createDevice').mockResolvedValueOnce({
      id: 'device-new',
      name: 'Novo Mini PC',
      rawToken: 'apidot_dev_sec_abcdef1234567890abcdef1234567890',
      tokenPrefix: 'apidot_dev_abcdef12',
      createdAtUtc: '2026-10-27T12:00:00Z',
    });

    render(<GlobalSettingsModal isOpen={true} onClose={vi.fn()} defaultTab="agents" />);

    // Verify sidebar tabs
    expect(screen.getByRole('tab', { name: /devices|dispositivos/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /general & interface/i })).toBeInTheDocument();

    // Verify device listing without token disclosure
    expect(screen.getByText('MacBook Pro Hudson')).toBeInTheDocument();
    expect(screen.getByText('Home Server Linux')).toBeInTheDocument();
    expect(screen.getByText('Old Workstation')).toBeInTheDocument();
    expect(screen.queryByText('apidot_dev_12345678')).toBeNull();

    // Register new device
    const registerBtn = screen.getByRole('button', { name: /register device|cadastrar dispositivo/i });
    fireEvent.click(registerBtn);

    const nameInput = screen.getByLabelText(/device name|nome do dispositivo/i);
    fireEvent.change(nameInput, { target: { value: 'Novo Mini PC' } });

    const submitBtn = screen.getByRole('button', { name: /^register$|^cadastrar$/i });
    await act(async () => {
      fireEvent.click(submitBtn);
    });

    expect(createDeviceSpy).toHaveBeenCalledWith('Novo Mini PC');

    // Verify one-time raw token dialog and curl install command
    await waitFor(() => {
      expect(screen.getByTestId('one-time-token-dialog')).toBeInTheDocument();
    });

    expect(
      screen.getByText('apidot_dev_sec_abcdef1234567890abcdef1234567890')
    ).toBeInTheDocument();
    expect(screen.getByText(/curl -fsSL .*\/install\.sh \| bash/i)).toBeInTheDocument();
    expect(screen.getByText(/apidot-agent service install/i)).toBeInTheDocument();
    expect(
      screen.getByText(
        /this personal access token \(pat\) will not be shown again|este token de acesso pessoal \(pat\) não será exibido novamente/i
      )
    ).toBeInTheDocument();
  });

  it('does not render when isOpen is false', () => {
    const { container } = render(<GlobalSettingsModal isOpen={false} onClose={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders accessible dialog attributes and closes when clicking close button or pressing Escape', () => {
    const handleClose = vi.fn();
    render(<GlobalSettingsModal isOpen={true} onClose={handleClose} />);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-labelledby', 'global-settings-modal-title');
    expect(screen.getByText('Global Settings')).toBeInTheDocument();

    // Press Escape
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(handleClose).toHaveBeenCalledTimes(1);

    // Click close button
    const closeBtn = screen.getByRole('button', { name: /close|fechar/i });
    fireEvent.click(closeBtn);
    expect(handleClose).toHaveBeenCalledTimes(2);
  });

  it('starts polling on open and stops polling on close/unmount', () => {
    const startPollingSpy = vi.spyOn(useDeviceStore.getState(), 'startPolling');
    const stopPollingSpy = vi.spyOn(useDeviceStore.getState(), 'stopPolling');

    const { rerender, unmount } = render(
      <GlobalSettingsModal isOpen={true} onClose={vi.fn()} />
    );
    expect(startPollingSpy).toHaveBeenCalledWith(3000);

    rerender(<GlobalSettingsModal isOpen={false} onClose={vi.fn()} />);
    expect(stopPollingSpy).toHaveBeenCalledTimes(1);

    // Also verify unmounting while open triggers stopPolling
    const { unmount: unmountOpen } = render(
      <GlobalSettingsModal isOpen={true} onClose={vi.fn()} />
    );
    expect(startPollingSpy).toHaveBeenCalledTimes(2);
    unmountOpen();
    expect(stopPollingSpy).toHaveBeenCalledTimes(2);
  });

  it('switches between General & Interface and Devices tabs with General as default', () => {
    render(<GlobalSettingsModal isOpen={true} onClose={vi.fn()} />);

    const generalTab = screen.getByRole('tab', { name: /general & interface/i });
    const agentsTab = screen.getByRole('tab', { name: /devices|dispositivos/i });

    // General & Interface is the default 1st tab
    expect(generalTab).toHaveAttribute('aria-selected', 'true');
    expect(agentsTab).toHaveAttribute('aria-selected', 'false');
    expect(
      screen.getByText(new RegExp(`ApiDot ${formatDisplayVersion(APP_VERSION)} • (Stable|Estável)`, 'i'))
    ).toBeInTheDocument();
    expect(screen.getByText(/dark \(default\)|escuro \(padrão\)/i)).toBeInTheDocument();
    expect(screen.getByText(/30\.000 ms/i)).toBeInTheDocument();

    // Switch to Local Agents tab
    fireEvent.click(agentsTab);
    expect(agentsTab).toHaveAttribute('aria-selected', 'true');
    expect(generalTab).toHaveAttribute('aria-selected', 'false');
    expect(
      screen.getByRole('heading', { name: /devices|dispositivos/i })
    ).toBeInTheDocument();
  });

  it('allows revoking a device and clears activeDeviceId if revoked device was active', async () => {
    useDeviceStore.setState({
      devices: mockDevices,
      activeDeviceId: 'device-1',
    });

    const revokeSpy = vi.spyOn(useDeviceStore.getState(), 'revokeDevice').mockResolvedValueOnce({
      ...mockDevices[0],
      isRevoked: true,
      isOnline: false,
    });

    render(<GlobalSettingsModal isOpen={true} onClose={vi.fn()} defaultTab="agents" />);

    const revokeButtons = screen.getAllByRole('button', { name: /revoke|revogar/i });
    await act(async () => {
      fireEvent.click(revokeButtons[0]);
    });

    expect(revokeSpy).toHaveBeenCalledWith('device-1');
    expect(useDeviceStore.getState().activeDeviceId).toBeNull();
  });

  it('renders active badge for active device and allows toggling active device', async () => {
    useDeviceStore.setState({
      devices: mockDevices,
      activeDeviceId: 'device-1',
    });

    render(<GlobalSettingsModal isOpen={true} onClose={vi.fn()} defaultTab="agents" />);

    // Device 1 should have active badge
    expect(screen.getByTestId('active-badge-device-1')).toBeInTheDocument();
    expect(screen.queryByTestId('active-badge-device-2')).not.toBeInTheDocument();

    // Toggle active on device 2
    const toggleBtn2 = screen.getByTestId('toggle-active-device-2');
    await act(async () => {
      fireEvent.click(toggleBtn2);
    });

    expect(useDeviceStore.getState().activeDeviceId).toBe('device-2');

    // Toggle again to deactivate
    await act(async () => {
      fireEvent.click(toggleBtn2);
    });
    expect(useDeviceStore.getState().activeDeviceId).toBeNull();
  });

  it('allows regenerating token and displays one-time token dialog with new token', async () => {
    useDeviceStore.setState({
      devices: mockDevices,
      activeDeviceId: 'device-1',
    });

    const regenSpy = vi.spyOn(useDeviceStore.getState(), 'regenerateToken').mockResolvedValueOnce({
      id: 'device-1',
      rawToken: 'apidot_dev_sec_regenerated_token_99999',
      tokenPrefix: 'apidot_dev_regen999',
    });

    render(<GlobalSettingsModal isOpen={true} onClose={vi.fn()} defaultTab="agents" />);

    const regenButtons = screen.getAllByRole('button', { name: /regenerate token|regenerar token/i });
    await act(async () => {
      fireEvent.click(regenButtons[0]);
    });

    expect(regenSpy).toHaveBeenCalledWith('device-1');

    await waitFor(() => {
      expect(screen.getByTestId('one-time-token-dialog')).toBeInTheDocument();
    });

    expect(screen.getByText(/token successfully regenerated|token regenerado com sucesso/i)).toBeInTheDocument();
    expect(screen.getByText('apidot_dev_sec_regenerated_token_99999')).toBeInTheDocument();
  });

  it('copies token and setup commands to clipboard in one-time token dialog', async () => {
    useDeviceStore.setState({
      devices: mockDevices,
    });

    vi.spyOn(useDeviceStore.getState(), 'createDevice').mockResolvedValueOnce({
      id: 'device-new',
      name: 'Agent Test',
      rawToken: 'apidot_dev_sec_copy_test_token',
      tokenPrefix: 'apidot_dev_copytest',
      createdAtUtc: '2026-10-27T12:00:00Z',
    });

    render(<GlobalSettingsModal isOpen={true} onClose={vi.fn()} defaultTab="agents" />);

    fireEvent.click(screen.getByRole('button', { name: /register device|cadastrar dispositivo/i }));
    fireEvent.change(screen.getByLabelText(/device name|nome do dispositivo/i), {
      target: { value: 'Agent Test' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^register$|^cadastrar$/i }));
    });

    await waitFor(() => {
      expect(screen.getByTestId('one-time-token-dialog')).toBeInTheDocument();
    });

    // Copy raw token
    const copyTokenBtn = screen.getByRole('button', { name: /^copy$|^copiar$/i });
    await act(async () => {
      fireEvent.click(copyTokenBtn);
    });
    expect(mockWriteText).toHaveBeenCalledWith('apidot_dev_sec_copy_test_token');
    expect(screen.getByText(/copied!|copiado!/i)).toBeInTheDocument();

    // Copy setup commands
    const copyCommandsBtn = screen.getByRole('button', { name: /copy commands|copiar comandos/i });
    await act(async () => {
      fireEvent.click(copyCommandsBtn);
    });
    expect(mockWriteText).toHaveBeenCalledWith(
      expect.stringContaining('curl -fsSL')
    );
    expect(mockWriteText).toHaveBeenCalledWith(
      expect.stringContaining('apidot-agent service install')
    );
  });

  it('opens instructions modal when clicking "Instruções"', () => {
    useDeviceStore.setState({
      devices: mockDevices,
    });

    render(<GlobalSettingsModal isOpen={true} onClose={vi.fn()} defaultTab="agents" />);

    const instructionButtons = screen.getAllByRole('button', { name: /instructions|instruções/i });
    fireEvent.click(instructionButtons[0]);

    expect(screen.getByText(/instructions for "macbook pro hudson"|instruções para “macbook pro hudson”/i)).toBeInTheDocument();
    expect(screen.getByText(/binary installation|instalação do binário/i)).toBeInTheDocument();
    expect(screen.getByText(/background service|inicialização como serviço de fundo/i)).toBeInTheDocument();

    // Close instructions
    const closeInstructionsBtn = screen.getByRole('button', { name: /^got it$|^entendi$/i });
    fireEvent.click(closeInstructionsBtn);
    expect(screen.queryByText(/instructions for "macbook pro hudson"|instruções para “macbook pro hudson”/i)).toBeNull();
  });

  it('allows resetting sidebar width and ratio in General & Interface tab', () => {
    useLayoutStore.setState({
      sidebarWidth: 380,
      requestResponseRatio: 70,
    });

    render(<GlobalSettingsModal isOpen={true} onClose={vi.fn()} defaultTab="general" />);

    expect(screen.getByText('380 px')).toBeInTheDocument();
    expect(screen.getByText('70% / 30%')).toBeInTheDocument();

    const resetButtons = screen.getAllByRole('button', { name: /restore default|restaurar padrão/i });
    expect(resetButtons.length).toBe(2);

    fireEvent.click(resetButtons[0]);
    expect(useLayoutStore.getState().sidebarWidth).toBe(256);

    fireEvent.click(resetButtons[1]);
    expect(useLayoutStore.getState().requestResponseRatio).toBe(50);
  });

  it('displays empty state when no devices are registered', () => {
    useDeviceStore.setState({
      devices: [],
      activeDeviceId: null,
    });

    render(<GlobalSettingsModal isOpen={true} onClose={vi.fn()} defaultTab="agents" />);

    expect(
      screen.getByText(/no (devices|local agents) registered|nenhum (dispositivo|agente local) cadastrado/i)
    ).toBeInTheDocument();
  });

  it('renders language selector in General tab and allows switching locale', async () => {
    render(<GlobalSettingsModal isOpen={true} onClose={vi.fn()} defaultTab="general" />);

    expect(screen.getByText('Language')).toBeInTheDocument();
    expect(screen.getByText('Select application display language')).toBeInTheDocument();

    const langSelect = screen.getByRole('combobox', { name: /language/i });
    expect(langSelect).toHaveValue('en-US');

    // Switch to pt-BR
    await act(async () => {
      fireEvent.change(langSelect, { target: { value: 'pt-BR' } });
    });

    expect(useI18nStore.getState().locale).toBe('pt-BR');
    expect(screen.getByText('Configurações Globais')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /geral & interface/i })).toBeInTheDocument();
    expect(screen.getByText('Idioma')).toBeInTheDocument();

    // Switch back to en-US
    await act(async () => {
      fireEvent.change(langSelect, { target: { value: 'en-US' } });
    });

    expect(useI18nStore.getState().locale).toBe('en-US');
    expect(screen.getByText('Global Settings')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /general & interface/i })).toBeInTheDocument();
  });

  it('renders global execution target selector and allows updating global target', async () => {
    useDeviceStore.setState({
      devices: mockDevices,
      activeDeviceId: 'device-1',
    });

    render(<GlobalSettingsModal isOpen={true} onClose={vi.fn()} defaultTab="general" />);

    expect(screen.getByText('Default Execution Target')).toBeInTheDocument();
    const targetSelect = screen.getByRole('combobox', { name: /default execution target/i });
    expect(targetSelect).toBeInTheDocument();

    // Default option is active_device
    expect(targetSelect).toHaveValue('active_device');

    // Switch to Cloud / Server
    await act(async () => {
      fireEvent.change(targetSelect, { target: { value: 'server' } });
    });

    expect(useDeviceStore.getState().globalDefaultTarget).toBe('Server');
    expect(useDeviceStore.getState().globalDefaultDeviceId).toBeNull();
    expect(localStorage.getItem('apidot_global_target')).toBe('Server');

    // Switch to specific device
    await act(async () => {
      fireEvent.change(targetSelect, { target: { value: 'device:device-2' } });
    });

    expect(useDeviceStore.getState().globalDefaultTarget).toBe('Agent');
    expect(useDeviceStore.getState().globalDefaultDeviceId).toBe('device-2');
    expect(localStorage.getItem('apidot_global_target')).toBe('Agent');
    expect(localStorage.getItem('apidot_global_device_id')).toBe('device-2');

    // Switch back to active_device
    await act(async () => {
      fireEvent.change(targetSelect, { target: { value: 'active_device' } });
    });

    expect(useDeviceStore.getState().globalDefaultTarget).toBe('Agent');
    expect(useDeviceStore.getState().globalDefaultDeviceId).toBeNull();
    expect(localStorage.getItem('apidot_global_device_id')).toBeNull();
  });

  describe('Desktop Auto-Update Section in General Tab', () => {
    it('renders simple static version row without auto-update controls in web environment (isDesktop === false)', () => {
      delete (window as any).__TAURI__;
      delete (window as any).__TAURI_INTERNALS__;
      useUpdateStore.setState({ status: 'available', availableVersion: '0.6.0' });

      render(<GlobalSettingsModal isOpen={true} onClose={vi.fn()} defaultTab="general" />);

      expect(
        screen.getByText(new RegExp(`ApiDot ${formatDisplayVersion(APP_VERSION)} • (Stable|Estável)`, 'i'))
      ).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /check for updates|verificar agora/i })).toBeNull();
      expect(screen.queryByRole('button', { name: /download & update|baixar e atualizar/i })).toBeNull();
      expect(screen.queryByRole('button', { name: /restart now|reiniciar agora/i })).toBeNull();
      expect(screen.queryByRole('progressbar')).toBeNull();
    });

    it('renders State A with current version badge and "Check now" button invoking checkForUpdates(true)', async () => {
      (window as any).__TAURI__ = {};
      const checkSpy = vi.fn().mockResolvedValue(undefined);
      useUpdateStore.setState({
        status: 'idle',
        checkForUpdates: checkSpy,
      });

      render(<GlobalSettingsModal isOpen={true} onClose={vi.fn()} defaultTab="general" />);

      // Current version badge
      expect(
        screen.getByText(new RegExp(`ApiDot ${formatDisplayVersion(APP_VERSION)} • (Stable|Estável)`, 'i'))
      ).toBeInTheDocument();

      // Check now button
      const checkBtn = screen.getByRole('button', { name: /check for updates|verificar agora/i });
      expect(checkBtn).toBeInTheDocument();
      expect(checkBtn).toBeEnabled();

      await act(async () => {
        fireEvent.click(checkBtn);
      });

      expect(checkSpy).toHaveBeenCalledWith(true);
    });

    it('renders State A up-to-date indicator and checking loading state', () => {
      (window as any).__TAURI__ = {};
      useUpdateStore.setState({ status: 'up-to-date' });

      const { rerender } = render(<GlobalSettingsModal isOpen={true} onClose={vi.fn()} defaultTab="general" />);

      expect(screen.getByText(/you are on the latest version of apidot|você está utilizando a versão mais recente/i)).toBeInTheDocument();
      expect(screen.getByText(/^up to date$|^atualizado$/i)).toBeInTheDocument();

      // Checking state
      act(() => {
        useUpdateStore.setState({ status: 'checking' });
      });

      rerender(<GlobalSettingsModal isOpen={true} onClose={vi.fn()} defaultTab="general" />);
      const checkingButtons = screen.getAllByRole('button', { name: /checking for updates\.\.\.|verificando atualizações\.\.\./i });
      expect(checkingButtons.length).toBeGreaterThan(0);
      expect(checkingButtons[0]).toBeDisabled();
    });

    it('renders State B with available version badge, summary and "Download & Update" button invoking downloadAndInstall', async () => {
      (window as any).__TAURI__ = {};
      const downloadSpy = vi.fn().mockResolvedValue(undefined);
      useUpdateStore.setState({
        status: 'available',
        availableVersion: '0.6.0',
        releaseNotes: 'Performance improvements and bug fixes',
        downloadAndInstall: downloadSpy,
      });

      render(<GlobalSettingsModal isOpen={true} onClose={vi.fn()} defaultTab="general" />);

      expect(screen.getByText(/new version available|nova versão disponível/i)).toBeInTheDocument();
      expect(screen.getByText('v0.6.0')).toBeInTheDocument();
      expect(screen.getByText('Performance improvements and bug fixes')).toBeInTheDocument();

      const downloadBtn = screen.getByRole('button', { name: /download & update|baixar e atualizar/i });
      expect(downloadBtn).toBeInTheDocument();

      await act(async () => {
        fireEvent.click(downloadBtn);
      });

      expect(downloadSpy).toHaveBeenCalledTimes(1);
    });

    it('renders State C with animated progress bar, percentage and cancel button', async () => {
      (window as any).__TAURI__ = {};
      useUpdateStore.setState({
        status: 'downloading',
        availableVersion: '0.6.0',
        progressPercent: 45,
        downloadedBytes: 45 * 1024 * 1024,
        totalBytes: 100 * 1024 * 1024,
      });

      render(<GlobalSettingsModal isOpen={true} onClose={vi.fn()} defaultTab="general" />);

      expect(screen.getByText(/downloading update \(v0\.6\.0\)\.\.\.|baixando atualização \(v0\.6\.0\)\.\.\./i)).toBeInTheDocument();
      expect(screen.getByTestId('download-progress-percent')).toHaveTextContent('45%');

      const progressBar = screen.getByRole('progressbar');
      expect(progressBar).toHaveAttribute('aria-valuenow', '45');

      const cancelBtn = screen.getByRole('button', { name: /cancel|cancelar/i });
      expect(cancelBtn).toBeInTheDocument();

      await act(async () => {
        fireEvent.click(cancelBtn);
      });

      expect(useUpdateStore.getState().status).toBe('idle');
    });

    it('renders State D with download complete, description and highlighted "Restart Now" button invoking restartAndApply', async () => {
      (window as any).__TAURI__ = {};
      const restartSpy = vi.fn().mockResolvedValue(undefined);
      useUpdateStore.setState({
        status: 'ready-to-restart',
        availableVersion: '0.6.0',
        restartAndApply: restartSpy,
      });

      render(<GlobalSettingsModal isOpen={true} onClose={vi.fn()} defaultTab="general" />);

      expect(screen.getByText(/download complete|download concluído/i)).toBeInTheDocument();
      expect(screen.getByText(/restart the application to complete the update|reinicie a aplicação para finalizar a instalação/i)).toBeInTheDocument();

      const restartBtn = screen.getByRole('button', { name: /restart now|reiniciar agora/i });
      expect(restartBtn).toBeInTheDocument();

      await act(async () => {
        fireEvent.click(restartBtn);
      });

      expect(restartSpy).toHaveBeenCalledTimes(1);
    });

    it('renders Error state with message and retry button that triggers checkForUpdates', async () => {
      (window as any).__TAURI__ = {};
      const checkSpy = vi.fn().mockResolvedValue(undefined);
      useUpdateStore.setState({
        status: 'error',
        errorMessage: 'Network timeout connecting to server',
        checkForUpdates: checkSpy,
      });

      render(<GlobalSettingsModal isOpen={true} onClose={vi.fn()} defaultTab="general" />);

      expect(screen.getByText(/failed to update|falha ao atualizar/i)).toBeInTheDocument();
      expect(screen.getByText('Network timeout connecting to server')).toBeInTheDocument();

      const retryBtn = screen.getByRole('button', { name: /retry|tentar novamente/i });
      expect(retryBtn).toBeInTheDocument();

      await act(async () => {
        fireEvent.click(retryBtn);
      });

      expect(checkSpy).toHaveBeenCalledWith(true);
    });

    it('renders localized updater elements in pt-BR', () => {
      (window as any).__TAURI__ = {};
      useI18nStore.setState({ locale: 'pt-BR' });
      useUpdateStore.setState({
        status: 'available',
        availableVersion: '0.6.0',
      });

      render(<GlobalSettingsModal isOpen={true} onClose={vi.fn()} defaultTab="general" />);

      expect(screen.getByText('Nova versão disponível')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Baixar e Atualizar' })).toBeInTheDocument();
    });
  });

  describe('Desktop Server URL', () => {
    beforeEach(() => {
      setApiBase(null);
    });

    it('hides the server URL field on the web', () => {
      render(<GlobalSettingsModal isOpen={true} onClose={vi.fn()} defaultTab="general" />);

      expect(screen.queryByLabelText(/server url/i)).toBeNull();
    });

    it('shows the stored base in the desktop field', () => {
      (window as any).__TAURI__ = {};
      setApiBase('https://stored.example.com');

      render(<GlobalSettingsModal isOpen={true} onClose={vi.fn()} defaultTab="general" />);

      expect(screen.getByLabelText(/server url/i)).toHaveValue('https://stored.example.com');
    });

    it('normalizes, persists and applies a valid server URL', () => {
      (window as any).__TAURI__ = {};

      render(<GlobalSettingsModal isOpen={true} onClose={vi.fn()} defaultTab="general" />);

      fireEvent.change(screen.getByLabelText(/server url/i), {
        target: { value: ' https://apidot.example.com/ ' },
      });
      fireEvent.click(screen.getByRole('button', { name: /save|salvar/i }));

      expect(getApiBase()).toBe('https://apidot.example.com');
      expect(localStorage.getItem(API_BASE_STORAGE_KEY)).toBe('https://apidot.example.com');
      expect(apiUrl('/api/workspaces')).toBe('https://apidot.example.com/api/workspaces');
      expect(screen.getByLabelText(/server url/i)).toHaveValue('https://apidot.example.com');
    });

    it('shows an inline error and keeps the previous base for an invalid value', () => {
      (window as any).__TAURI__ = {};
      setApiBase('https://stored.example.com');

      render(<GlobalSettingsModal isOpen={true} onClose={vi.fn()} defaultTab="general" />);

      fireEvent.change(screen.getByLabelText(/server url/i), {
        target: { value: 'not-a-url' },
      });
      fireEvent.click(screen.getByRole('button', { name: /save|salvar/i }));

      expect(screen.getByRole('alert')).toHaveTextContent(/valid http\(s\) url/i);
      expect(getApiBase()).toBe('https://stored.example.com');
      expect(localStorage.getItem(API_BASE_STORAGE_KEY)).toBe('https://stored.example.com');
    });

    it('persists the new server URL into the desktop session', async () => {
      (window as any).__TAURI__ = {};
      setSession({
        deviceId: 'device-1',
        deviceKey: 'key-1',
        accessToken: 'tok-1',
        serverUrl: 'https://old.example.com',
      });

      render(<GlobalSettingsModal isOpen={true} onClose={vi.fn()} defaultTab="general" />);

      fireEvent.change(screen.getByLabelText(/server url/i), {
        target: { value: ' https://new.example.com/ ' },
      });
      fireEvent.click(screen.getByRole('button', { name: /save|salvar/i }));

      await waitFor(() => {
        expect(saveDesktopSession).toHaveBeenCalled();
      });

      expect(getSession()?.serverUrl).toBe('https://new.example.com');
      expect(vi.mocked(saveDesktopSession).mock.calls.at(-1)?.[0]).toMatchObject({
        deviceKey: 'key-1',
        accessToken: 'tok-1',
        serverUrl: 'https://new.example.com',
      });
    });
  });

});
