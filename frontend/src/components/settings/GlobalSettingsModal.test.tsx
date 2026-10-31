import React from 'react';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GlobalSettingsModal } from './GlobalSettingsModal';
import { useDeviceStore } from '@/stores/useDeviceStore';
import { useLayoutStore, INITIAL_LAYOUT_STATE } from '@/stores/useLayoutStore';
import { useI18nStore } from '@/stores/useI18nStore';
import { AgentDeviceDto } from '@/lib/deviceApi';
import { APP_VERSION, formatDisplayVersion } from '@/lib/version';

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
    useLayoutStore.setState(INITIAL_LAYOUT_STATE);
    useI18nStore.setState({ locale: 'en-US' });
    localStorage.clear();

    Object.assign(navigator, {
      clipboard: {
        writeText: mockWriteText,
      },
    });
  });

  afterEach(() => {
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

    // 1. Valida abas laterais "Local Agents" e "General & Interface"
    expect(screen.getByRole('tab', { name: /local agents/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /general & interface/i })).toBeInTheDocument();

    // 2. Valida listagem de dispositivos (sem exibição de token)
    expect(screen.getByText('MacBook Pro Hudson')).toBeInTheDocument();
    expect(screen.getByText('Home Server Linux')).toBeInTheDocument();
    expect(screen.getByText('Old Workstation')).toBeInTheDocument();
    expect(screen.queryByText('apidot_dev_12345678')).toBeNull();

    // 3. Cadastra novo dispositivo
    const registerBtn = screen.getByRole('button', { name: /register device|cadastrar dispositivo/i });
    fireEvent.click(registerBtn);

    const nameInput = screen.getByLabelText(/device name|nome do dispositivo/i);
    fireEvent.change(nameInput, { target: { value: 'Novo Mini PC' } });

    const submitBtn = screen.getByRole('button', { name: /^register$|^cadastrar$/i });
    await act(async () => {
      fireEvent.click(submitBtn);
    });

    expect(createDeviceSpy).toHaveBeenCalledWith('Novo Mini PC');

    // 4. Valida exibição do diálogo de RawToken único e comando curl
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

  it('switches between General & Interface and Local Agents tabs with General as default', () => {
    render(<GlobalSettingsModal isOpen={true} onClose={vi.fn()} />);

    const generalTab = screen.getByRole('tab', { name: /general & interface/i });
    const agentsTab = screen.getByRole('tab', { name: /local agents/i });

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
      screen.getByRole('heading', { name: /devices & local agents|dispositivos & local agents/i })
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
      screen.getByText(/no local agents registered|nenhum agente local cadastrado/i)
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
});
