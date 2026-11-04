import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  CollectionSettingsModal,
  SyncReport,
} from './CollectionSettingsModal';
import { CollectionNodeDto } from '@/lib/treeApi';
import { useI18nStore } from '@/stores/useI18nStore';
import { useEnvironmentStore } from '@/stores/useEnvironmentStore';
import { useDeviceStore } from '@/stores/useDeviceStore';
import { AgentDeviceDto } from '@/lib/deviceApi';
import { VariableItem } from '../environment/VariableGrid';

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
];

describe('CollectionSettingsModal', () => {
  beforeEach(() => {
    useI18nStore.setState({ locale: 'en-US' });
    useEnvironmentStore.getState().reset();
    useDeviceStore.getState().reset();
  });

  afterEach(() => {
    useI18nStore.setState({ locale: 'en-US' });
    useEnvironmentStore.getState().reset();
    useDeviceStore.getState().reset();
  });
  const mockCollection: CollectionNodeDto = {
    id: 'coll-123',
    name: 'Minha Coleção API',
    defaultTarget: 'Inherit',
    openApiSpecUrl: 'https://api.example.com/openapi.json',
    folders: [],
    requests: [
      {
        id: 'req-1',
        name: 'Get User Profile',
        method: 'GET',
        url: 'https://api.test/user/{{$request["login-req"].response.body.userId}}',
        target: 'Inherit',
        bodyType: 'None',
        headersJson: '{"Authorization": "Bearer {{$request[\"login-req\"].response.body.token}}"}',
        bodyContent: null,
      },
    ],
  };

  const mockReport: SyncReport = {
    addedRequests: 3,
    updatedRequests: 2,
    fieldsAdded: 5,
    fieldsRemoved: 1,
    fieldsPreserved: 7,
  };

  describe('Modal Visibility & Accessibility', () => {
    it('does not render when isOpen is false', () => {
      render(
        <CollectionSettingsModal
          isOpen={false}
          onClose={() => {}}
          collection={mockCollection}
        />
      );
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('renders dialog with role="dialog", aria-modal="true" and title', () => {
      render(
        <CollectionSettingsModal
          isOpen={true}
          onClose={() => {}}
          collection={mockCollection}
        />
      );

      const dialog = screen.getByRole('dialog');
      expect(dialog).toBeInTheDocument();
      expect(dialog).toHaveAttribute('aria-modal', 'true');
      expect(dialog).toHaveAttribute('aria-labelledby');

      const titleId = dialog.getAttribute('aria-labelledby');
      const title = document.getElementById(titleId!);
      expect(title).toBeInTheDocument();
      expect(title?.textContent).toMatch(/Collection Settings/i);
    });
  });

  describe('Tabs Navigation', () => {
    it('renders 5 dedicated tabs and allows switching between them', () => {
      render(
        <CollectionSettingsModal
          isOpen={true}
          onClose={() => {}}
          collection={mockCollection}
        />
      );

      const tabGeneral = screen.getByRole('tab', { name: /General & Target/i });
      const tabVars = screen.getByRole('tab', { name: /Variables/i });
      const tabAuth = screen.getByRole('tab', { name: /Authentication/i });
      const tabOpenApi = screen.getByRole('tab', { name: /OpenAPI \/ Sync/i });
      const tabDeps = screen.getByRole('tab', { name: /Links & Dependencies/i });

      expect(tabGeneral).toBeInTheDocument();
      expect(tabVars).toBeInTheDocument();
      expect(tabAuth).toBeInTheDocument();
      expect(tabOpenApi).toBeInTheDocument();
      expect(tabDeps).toBeInTheDocument();

      // Tab 1 (General) is active by default
      expect(screen.getByLabelText(/Collection Name/i)).toBeInTheDocument();
      expect(screen.getByRole('combobox', { name: /Execution Target/i })).toBeInTheDocument();

      // Switch to Variables tab
      fireEvent.click(tabVars);
      expect(screen.getByText(/Collection Variables/i)).toBeInTheDocument();

      // Switch to Auth tab
      fireEvent.click(tabAuth);
      expect(screen.getByRole('combobox', { name: /Collection Authentication Type/i })).toBeInTheDocument();

      // Switch to OpenAPI tab
      fireEvent.click(tabOpenApi);
      expect(screen.getByLabelText(/OpenAPI Specification URL/i)).toBeInTheDocument();
      expect(screen.getByTestId('openapi-code-editor')).toBeInTheDocument();

      // Switch to Dependencies tab
      fireEvent.click(tabDeps);
      expect(screen.getAllByText(/get user profile/i).length).toBeGreaterThan(0);
      expect(screen.getAllByRole('button', { name: /Copy/i }).length).toBeGreaterThan(0);
    });
  });

  describe('Tab: Variáveis da Coleção', () => {
    it('renders Variables tab and allows adding collection-scoped variables', () => {
      useI18nStore.setState({ locale: 'pt-BR' });
      const collection = {
        id: 'col-123',
        name: 'Billing API',
        defaultTarget: 'Inherit' as const,
        folders: [],
        requests: [],
      };
      render(
        <CollectionSettingsModal
          isOpen={true}
          onClose={vi.fn()}
          collection={collection}
        />
      );
      const varsTab = screen.getByRole('tab', { name: /variáveis/i });
      expect(varsTab).toBeInTheDocument();

      fireEvent.click(varsTab);
      expect(screen.getByText(/variáveis da coleção/i)).toBeInTheDocument();
    });

    it('loads and displays collection variables from useEnvironmentStore', () => {
      const collectionId = 'coll-123';
      const initialVars: VariableItem[] = [
        { key: 'API_BASE_URL', value: 'https://api.billing.com', isActive: true, isSecret: false },
        { key: 'API_KEY', value: 'secret-token-123', isActive: true, isSecret: true },
      ];
      useEnvironmentStore.getState().setCollectionVariablesForId(collectionId, initialVars);

      render(
        <CollectionSettingsModal
          isOpen={true}
          onClose={vi.fn()}
          collection={mockCollection}
        />
      );

      const varsTab = screen.getByRole('tab', { name: /Variables/i });
      fireEvent.click(varsTab);

      expect(screen.getByDisplayValue('API_BASE_URL')).toBeInTheDocument();
      expect(screen.getByDisplayValue('https://api.billing.com')).toBeInTheDocument();
      expect(screen.getByDisplayValue('API_KEY')).toBeInTheDocument();
    });

    it('updates useEnvironmentStore and passes variables to onSave upon saving', async () => {
      const onSave = vi.fn();
      render(
        <CollectionSettingsModal
          isOpen={true}
          onClose={vi.fn()}
          collection={mockCollection}
          onSave={onSave}
        />
      );

      // Switch to variables tab
      const varsTab = screen.getByRole('tab', { name: /Variables/i });
      fireEvent.click(varsTab);

      // Add a variable
      const addBtn = screen.getByRole('button', { name: /Add Variable/i });
      fireEvent.click(addBtn);

      const keyInput = screen.getByPlaceholderText('Key');
      const valueInput = screen.getByPlaceholderText('Value');

      fireEvent.change(keyInput, { target: { value: 'NEW_VAR' } });
      fireEvent.change(valueInput, { target: { value: 'NEW_VALUE' } });

      // Verify useEnvironmentStore received the updated variables
      const storeVars = useEnvironmentStore.getState().getCollectionVariablesForId(mockCollection.id);
      expect(storeVars).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ key: 'NEW_VAR', value: 'NEW_VALUE' }),
        ])
      );

      // Click save button
      const saveBtn = screen.getByRole('button', { name: /Save Changes/i });
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(onSave).toHaveBeenCalledWith(
          expect.objectContaining({
            variables: expect.arrayContaining([
              expect.objectContaining({ key: 'NEW_VAR', value: 'NEW_VALUE' }),
            ]),
          })
        );
      });
    });
  });

  describe('Tab 2: Autenticação', () => {
    it('allows configuring collection-level auth and saves it', async () => {
      const onSave = vi.fn();
      render(
        <CollectionSettingsModal
          isOpen={true}
          onClose={() => {}}
          collection={mockCollection}
          onSave={onSave}
        />
      );

      const tabAuth = screen.getByRole('tab', { name: /Authentication/i });
      fireEvent.click(tabAuth);

      const authSelect = screen.getByRole('combobox', { name: /Collection Authentication Type/i });
      fireEvent.change(authSelect, { target: { value: 'bearer' } });

      const tokenInput = screen.getByLabelText(/Token:/i);
      fireEvent.change(tokenInput, { target: { value: 'my-coll-token-123' } });

      const saveBtn = screen.getByRole('button', { name: /Save Changes/i });
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(onSave).toHaveBeenCalledWith(
          expect.objectContaining({
            auth: expect.objectContaining({
              type: 'bearer',
              token: 'my-coll-token-123',
            }),
          })
        );
      });
    });
  });

  describe('Tab 1: Geral & Alvo', () => {
    it('updates collection name and default target', async () => {
      const onSave = vi.fn();
      render(
        <CollectionSettingsModal
          isOpen={true}
          onClose={() => {}}
          collection={mockCollection}
          onSave={onSave}
        />
      );

      const nameInput = screen.getByLabelText(/Collection Name/i);
      fireEvent.change(nameInput, { target: { value: 'Nova Coleção Renomeada' } });

      const targetSelect = screen.getByRole('combobox', { name: /Execution Target/i });
      fireEvent.change(targetSelect, { target: { value: 'active_device' } });

      const saveBtn = screen.getByRole('button', { name: /Save Changes/i });
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(onSave).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'Nova Coleção Renomeada',
            defaultTarget: 'Agent',
          })
        );
      });
    });

    it('allows selecting inherit from global settings', async () => {
      const onSave = vi.fn();
      render(
        <CollectionSettingsModal
          isOpen={true}
          onClose={() => {}}
          collection={{ ...mockCollection, defaultTarget: 'Server' }}
          onSave={onSave}
        />
      );

      const targetSelect = screen.getByRole('combobox', { name: /Execution Target/i });
      fireEvent.change(targetSelect, { target: { value: 'inherit' } });

      const saveBtn = screen.getByRole('button', { name: /Save Changes/i });
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(onSave).toHaveBeenCalledWith(
          expect.objectContaining({
            defaultTarget: 'Inherit',
            targetDeviceId: null,
          })
        );
      });
    });

    it('allows selecting cloud / server', async () => {
      const onSave = vi.fn();
      render(
        <CollectionSettingsModal
          isOpen={true}
          onClose={() => {}}
          collection={mockCollection}
          onSave={onSave}
        />
      );

      const targetSelect = screen.getByRole('combobox', { name: /Execution Target/i });
      fireEvent.change(targetSelect, { target: { value: 'server' } });

      const saveBtn = screen.getByRole('button', { name: /Save Changes/i });
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(onSave).toHaveBeenCalledWith(
          expect.objectContaining({
            defaultTarget: 'Server',
            targetDeviceId: null,
          })
        );
      });
    });

    it('allows selecting active local device', async () => {
      const onSave = vi.fn();
      render(
        <CollectionSettingsModal
          isOpen={true}
          onClose={() => {}}
          collection={mockCollection}
          onSave={onSave}
        />
      );

      const targetSelect = screen.getByRole('combobox', { name: /Execution Target/i });
      fireEvent.change(targetSelect, { target: { value: 'active_device' } });

      const saveBtn = screen.getByRole('button', { name: /Save Changes/i });
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(onSave).toHaveBeenCalledWith(
          expect.objectContaining({
            defaultTarget: 'Agent',
            targetDeviceId: null,
          })
        );
      });
    });

    it('allows selecting a specific registered device and saving targetDeviceId', async () => {
      useDeviceStore.setState({ devices: mockDevices });
      const onSave = vi.fn();
      render(
        <CollectionSettingsModal
          isOpen={true}
          onClose={() => {}}
          collection={mockCollection}
          onSave={onSave}
        />
      );

      const targetSelect = screen.getByRole('combobox', { name: /Execution Target/i });
      expect(screen.getByText(/Home Server Linux/i)).toBeInTheDocument();

      fireEvent.change(targetSelect, { target: { value: 'device:device-2' } });

      const saveBtn = screen.getByRole('button', { name: /Save Changes/i });
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(onSave).toHaveBeenCalledWith(
          expect.objectContaining({
            defaultTarget: 'Agent',
            targetDeviceId: 'device-2',
          })
        );
      });
    });

    it('prepopulates specific device target when collection has targetDeviceId', () => {
      useDeviceStore.setState({ devices: mockDevices });
      render(
        <CollectionSettingsModal
          isOpen={true}
          onClose={() => {}}
          collection={{
            ...mockCollection,
            defaultTarget: 'Agent',
            targetDeviceId: 'device-2',
          }}
        />
      );

      const targetSelect = screen.getByRole('combobox', { name: /Execution Target/i });
      expect(targetSelect).toHaveValue('device:device-2');
    });
  });

  describe('Tab 2: OpenAPI & Sync', () => {
    it('triggers synchronization and displays audit report', async () => {
      const onSync = vi.fn().mockResolvedValue(mockReport);
      render(
        <CollectionSettingsModal
          isOpen={true}
          onClose={() => {}}
          collection={mockCollection}
          onSync={onSync}
        />
      );

      const tabOpenApi = screen.getByRole('tab', { name: /OpenAPI \/ Sync/i });
      fireEvent.click(tabOpenApi);

      const syncBtn = screen.getByRole('button', { name: /Sync Collection/i });
      fireEvent.click(syncBtn);

      await waitFor(() => {
        expect(onSync).toHaveBeenCalled();
        expect(screen.getByTestId('sync-report-section')).toBeInTheDocument();
      });

      const reportSection = screen.getByTestId('sync-report-section');
      expect(within(reportSection).getByText('3')).toBeInTheDocument(); // added
      expect(within(reportSection).getByText('2')).toBeInTheDocument(); // updated
    });
  });

  describe('Tab 3: Vínculos & Dependências', () => {
    it('copies dependency token to clipboard on click', async () => {
      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, {
        clipboard: {
          writeText: writeTextMock,
        },
      });

      render(
        <CollectionSettingsModal
          isOpen={true}
          onClose={() => {}}
          collection={mockCollection}
        />
      );

      const tabDeps = screen.getByRole('tab', { name: /Links & Dependencies/i });
      fireEvent.click(tabDeps);

      const copyBtns = screen.getAllByRole('button', { name: /Copy/i });
      fireEvent.click(copyBtns[0]);

      await waitFor(() => {
        expect(writeTextMock).toHaveBeenCalledWith(
          expect.stringContaining('{{$request["login-req"]')
        );
      });
    });
  });
});
