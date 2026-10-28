import React from 'react';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GlobalSettingsModal } from './GlobalSettingsModal';
import { useDeviceStore } from '@/stores/useDeviceStore';
import { useLayoutStore, INITIAL_LAYOUT_STATE } from '@/stores/useLayoutStore';
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

    render(<GlobalSettingsModal isOpen={true} onClose={vi.fn()} />);

    // 1. Valida abas laterais "Local Agents" e "Geral & Interface"
    expect(screen.getByRole('tab', { name: /local agents/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /geral & interface/i })).toBeInTheDocument();

    // 2. Valida listagem de dispositivos
    expect(screen.getAllByText('MacBook Pro Hudson').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Home Server Linux')).toBeInTheDocument();
    expect(screen.getByText('Old Workstation')).toBeInTheDocument();
    expect(screen.getByText('apidot_dev_12345678')).toBeInTheDocument();

    // 3. Cadastra novo dispositivo
    const registerBtn = screen.getByRole('button', { name: /\+? ?cadastrar dispositivo/i });
    fireEvent.click(registerBtn);

    const nameInput = screen.getByLabelText(/nome do dispositivo/i);
    fireEvent.change(nameInput, { target: { value: 'Novo Mini PC' } });

    const submitBtn = screen.getByRole('button', { name: 'Cadastrar' });
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
      screen.getByText(/este token de acesso pessoal \(pat\) não será exibido novamente/i)
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
    expect(screen.getByText('Configurações Globais')).toBeInTheDocument();

    // Press Escape
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(handleClose).toHaveBeenCalledTimes(1);

    // Click close button
    const closeBtn = screen.getByRole('button', { name: /fechar configurações globais/i });
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

  it('switches between Local Agents and Geral & Interface tabs', () => {
    render(<GlobalSettingsModal isOpen={true} onClose={vi.fn()} />);

    const agentsTab = screen.getByRole('tab', { name: /local agents/i });
    const generalTab = screen.getByRole('tab', { name: /geral & interface/i });

    expect(agentsTab).toHaveAttribute('aria-selected', 'true');
    expect(generalTab).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByText(/dispositivos & local agents/i)).toBeInTheDocument();

    // Switch to General tab
    fireEvent.click(generalTab);
    expect(generalTab).toHaveAttribute('aria-selected', 'true');
    expect(agentsTab).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByText(`ApiDot ${formatDisplayVersion(APP_VERSION)}`)).toBeInTheDocument();
    expect(screen.getByText('Escuro (Padrão ApiDot)')).toBeInTheDocument();
    expect(screen.getByText(/30\.000 ms/i)).toBeInTheDocument();
  });

  it('displays active device banner and allows unlinking', () => {
    useDeviceStore.setState({
      devices: mockDevices,
      activeDeviceId: 'device-1',
    });

    render(<GlobalSettingsModal isOpen={true} onClose={vi.fn()} />);

    const banner = screen.getByTestId('active-device-banner');
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveTextContent(/dispositivo vinculado a este navegador:/i);
    expect(banner).toHaveTextContent('MacBook Pro Hudson');
    expect(banner).toHaveTextContent('macbook.local');

    const unlinkBtn = within(banner).getByRole('button', { name: /desvincular/i });
    fireEvent.click(unlinkBtn);

    expect(useDeviceStore.getState().activeDeviceId).toBeNull();
  });

  it('displays empty banner when no device is active', () => {
    useDeviceStore.setState({
      devices: mockDevices,
      activeDeviceId: null,
    });

    render(<GlobalSettingsModal isOpen={true} onClose={vi.fn()} />);

    expect(screen.getByTestId('no-active-device-banner')).toBeInTheDocument();
    expect(
      screen.getByText(/nenhum agente vinculado a este navegador/i)
    ).toBeInTheDocument();
  });

  it('allows linking a device to this browser by clicking "Vincular a este Navegador"', () => {
    useDeviceStore.setState({
      devices: mockDevices,
      activeDeviceId: null,
    });

    render(<GlobalSettingsModal isOpen={true} onClose={vi.fn()} />);

    const linkButtons = screen.getAllByRole('button', { name: /vincular a este navegador/i });
    expect(linkButtons.length).toBeGreaterThan(0);

    fireEvent.click(linkButtons[0]);
    expect(useDeviceStore.getState().activeDeviceId).toBe('device-1');
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

    render(<GlobalSettingsModal isOpen={true} onClose={vi.fn()} />);

    const revokeButtons = screen.getAllByRole('button', { name: /revogar/i });
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

    render(<GlobalSettingsModal isOpen={true} onClose={vi.fn()} />);

    const regenButtons = screen.getAllByRole('button', { name: /regenerar token/i });
    await act(async () => {
      fireEvent.click(regenButtons[0]);
    });

    expect(regenSpy).toHaveBeenCalledWith('device-1');

    await waitFor(() => {
      expect(screen.getByTestId('one-time-token-dialog')).toBeInTheDocument();
    });

    expect(screen.getByText('Token Regenerado com Sucesso')).toBeInTheDocument();
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

    render(<GlobalSettingsModal isOpen={true} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /\+? ?cadastrar dispositivo/i }));
    fireEvent.change(screen.getByLabelText(/nome do dispositivo/i), {
      target: { value: 'Agent Test' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Cadastrar' }));
    });

    await waitFor(() => {
      expect(screen.getByTestId('one-time-token-dialog')).toBeInTheDocument();
    });

    // Copy raw token
    const copyTokenBtn = screen.getByRole('button', { name: /^copiar$/i });
    await act(async () => {
      fireEvent.click(copyTokenBtn);
    });
    expect(mockWriteText).toHaveBeenCalledWith('apidot_dev_sec_copy_test_token');
    expect(screen.getByText('Copiado!')).toBeInTheDocument();

    // Copy setup commands
    const copyCommandsBtn = screen.getByRole('button', { name: /copiar comandos/i });
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

    render(<GlobalSettingsModal isOpen={true} onClose={vi.fn()} />);

    const instructionButtons = screen.getAllByRole('button', { name: /instruções/i });
    fireEvent.click(instructionButtons[0]);

    expect(screen.getByText(/instruções para “macbook pro hudson”/i)).toBeInTheDocument();
    expect(screen.getByText(/instalação do binário/i)).toBeInTheDocument();
    expect(screen.getByText(/inicialização como serviço de fundo/i)).toBeInTheDocument();

    // Close instructions
    const closeInstructionsBtn = screen.getByRole('button', { name: /entendi/i });
    fireEvent.click(closeInstructionsBtn);
    expect(screen.queryByText(/instruções para “macbook pro hudson”/i)).toBeNull();
  });

  it('allows resetting sidebar width and ratio in Geral & Interface tab', () => {
    useLayoutStore.setState({
      sidebarWidth: 380,
      requestResponseRatio: 70,
    });

    render(<GlobalSettingsModal isOpen={true} onClose={vi.fn()} defaultTab="general" />);

    expect(screen.getByText('Barra Lateral: 380px')).toBeInTheDocument();
    expect(screen.getByText('Divisão Requisição: 70%')).toBeInTheDocument();

    const resetButtons = screen.getAllByRole('button', { name: /restaurar padrão/i });
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

    render(<GlobalSettingsModal isOpen={true} onClose={vi.fn()} />);

    expect(screen.getByText('Nenhum agente local cadastrado.')).toBeInTheDocument();
  });
});
