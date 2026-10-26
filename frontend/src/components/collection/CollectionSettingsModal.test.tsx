import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import {
  CollectionSettingsModal,
  SyncReport,
} from './CollectionSettingsModal';
import { CollectionNodeDto } from '@/lib/treeApi';

describe('CollectionSettingsModal', () => {
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
      expect(title?.textContent).toMatch(/configurações da coleção/i);
    });
  });

  describe('Tabs Navigation', () => {
    it('renders 3 dedicated tabs and allows switching between them', () => {
      render(
        <CollectionSettingsModal
          isOpen={true}
          onClose={() => {}}
          collection={mockCollection}
        />
      );

      const tabGeneral = screen.getByRole('tab', { name: /geral & alvo/i });
      const tabOpenApi = screen.getByRole('tab', { name: /openapi \/ sync/i });
      const tabDeps = screen.getByRole('tab', { name: /vínculos & dependências/i });

      expect(tabGeneral).toBeInTheDocument();
      expect(tabOpenApi).toBeInTheDocument();
      expect(tabDeps).toBeInTheDocument();

      // Tab 1 (General) is active by default
      expect(screen.getByLabelText(/nome da coleção/i)).toBeInTheDocument();
      expect(screen.getByRole('combobox', { name: /target de execução/i })).toBeInTheDocument();

      // Switch to OpenAPI tab
      fireEvent.click(tabOpenApi);
      expect(screen.getByLabelText(/url da especificação openapi/i)).toBeInTheDocument();
      expect(screen.getByTestId('openapi-code-editor')).toBeInTheDocument();

      // Switch to Dependencies tab
      fireEvent.click(tabDeps);
      expect(screen.getAllByText(/get user profile/i).length).toBeGreaterThan(0);
      expect(screen.getAllByRole('button', { name: /copiar/i }).length).toBeGreaterThan(0);
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

      const nameInput = screen.getByLabelText(/nome da coleção/i);
      fireEvent.change(nameInput, { target: { value: 'Nova Coleção Renomeada' } });

      const targetSelect = screen.getByRole('combobox', { name: /target de execução/i });
      fireEvent.change(targetSelect, { target: { value: 'Agent' } });

      const saveBtn = screen.getByRole('button', { name: /salvar alterações/i });
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

      const tabOpenApi = screen.getByRole('tab', { name: /openapi \/ sync/i });
      fireEvent.click(tabOpenApi);

      const syncBtn = screen.getByRole('button', { name: /sincronizar coleção/i });
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

      const tabDeps = screen.getByRole('tab', { name: /vínculos & dependências/i });
      fireEvent.click(tabDeps);

      const copyBtns = screen.getAllByRole('button', { name: /copiar/i });
      fireEvent.click(copyBtns[0]);

      await waitFor(() => {
        expect(writeTextMock).toHaveBeenCalledWith(
          expect.stringContaining('{{$request["login-req"]')
        );
      });
    });
  });
});
