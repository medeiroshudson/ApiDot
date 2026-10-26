import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import {
  CollectionSettingsModal,
  CollectionItem,
  SyncReport,
} from './CollectionSettingsModal';

describe('CollectionSettingsModal', () => {
  const mockCollection: CollectionItem = {
    id: 'coll-123',
    name: 'Minha Coleção API',
    openApiSpecUrl: 'https://api.example.com/openapi.json',
    openApiSpecContent: '{"openapi": "3.0.0", "info": {"title": "Test", "version": "1.0.0"}}',
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

    it('renders dialog with role="dialog", aria-modal="true" when isOpen is true', () => {
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
      expect(title?.textContent).toMatch(/configurações da coleção|sincronização/i);
    });
  });

  describe('Form Inputs', () => {
    it('displays inputs for OpenAPI Spec URL and Spec Content (JSON/YAML)', () => {
      render(
        <CollectionSettingsModal
          isOpen={true}
          onClose={() => {}}
          collection={mockCollection}
        />
      );

      const urlInput = screen.getByLabelText(/url da especificação|url da spec/i);
      expect(urlInput).toBeInTheDocument();
      expect(urlInput).toHaveValue(mockCollection.openApiSpecUrl);

      const contentInput = screen.getByLabelText(/conteúdo da especificação|conteúdo da spec/i);
      expect(contentInput).toBeInTheDocument();
      expect(contentInput).toHaveValue(mockCollection.openApiSpecContent);
    });

    it('allows updating input values', () => {
      render(
        <CollectionSettingsModal
          isOpen={true}
          onClose={() => {}}
          collection={mockCollection}
        />
      );

      const urlInput = screen.getByLabelText(/url da especificação|url da spec/i);
      fireEvent.change(urlInput, { target: { value: 'https://new.spec.url/swagger.json' } });
      expect(urlInput).toHaveValue('https://new.spec.url/swagger.json');

      const contentInput = screen.getByLabelText(/conteúdo da especificação|conteúdo da spec/i);
      fireEvent.change(contentInput, { target: { value: '{"openapi": "3.1.0"}' } });
      expect(contentInput).toHaveValue('{"openapi": "3.1.0"}');
    });
  });

  describe('Synchronization & Loading State', () => {
    it('shows "Sincronizar Coleção" button', () => {
      render(
        <CollectionSettingsModal
          isOpen={true}
          onClose={() => {}}
          collection={mockCollection}
        />
      );

      const syncBtn = screen.getByRole('button', { name: /sincronizar coleção/i });
      expect(syncBtn).toBeInTheDocument();
    });

    it('invokes sync callback with updated spec url and content', async () => {
      const handleSync = vi.fn().mockResolvedValue(mockReport);
      render(
        <CollectionSettingsModal
          isOpen={true}
          onClose={() => {}}
          collection={mockCollection}
          onSync={handleSync}
        />
      );

      const urlInput = screen.getByLabelText(/url da especificação|url da spec/i);
      fireEvent.change(urlInput, { target: { value: 'https://api.v2.com/openapi.json' } });

      const syncBtn = screen.getByRole('button', { name: /sincronizar coleção/i });
      fireEvent.click(syncBtn);

      await waitFor(() => {
        expect(handleSync).toHaveBeenCalledTimes(1);
        expect(handleSync).toHaveBeenCalledWith({
          specUrl: 'https://api.v2.com/openapi.json',
          specContent: mockCollection.openApiSpecContent,
        });
      });
    });

    it('displays loading spinner and disables buttons during synchronization', async () => {
      let resolveSync!: (value: SyncReport) => void;
      const syncPromise = new Promise<SyncReport>((resolve) => {
        resolveSync = resolve;
      });
      const handleSync = vi.fn().mockReturnValue(syncPromise);

      render(
        <CollectionSettingsModal
          isOpen={true}
          onClose={() => {}}
          collection={mockCollection}
          onSync={handleSync}
        />
      );

      const syncBtn = screen.getByRole('button', { name: /sincronizar coleção/i });
      fireEvent.click(syncBtn);

      // In loading state: sync button should be disabled and show loading indicator
      expect(syncBtn).toBeDisabled();
      expect(screen.getByTestId('sync-loading-spinner')).toBeInTheDocument();

      // Resolve sync
      resolveSync(mockReport);

      await waitFor(() => {
        expect(syncBtn).not.toBeDisabled();
        expect(screen.queryByTestId('sync-loading-spinner')).toBeNull();
      });
    });
  });

  describe('Audit Report (SyncReport) Rendering', () => {
    it('renders audit report displaying counts for requests added, updated, fields added, removed and preserved', async () => {
      const handleSync = vi.fn().mockResolvedValue(mockReport);
      const handleSyncSuccess = vi.fn();

      render(
        <CollectionSettingsModal
          isOpen={true}
          onClose={() => {}}
          collection={mockCollection}
          onSync={handleSync}
          onSyncSuccess={handleSyncSuccess}
        />
      );

      const syncBtn = screen.getByRole('button', { name: /sincronizar coleção/i });
      fireEvent.click(syncBtn);

      await waitFor(() => {
        const auditReport = screen.getByTestId('sync-report-card');
        expect(auditReport).toBeInTheDocument();
      });

      // Verify stats rendered
      expect(screen.getByText('3')).toBeInTheDocument(); // addedRequests
      expect(screen.getByText(/requisições adicionadas/i)).toBeInTheDocument();

      expect(screen.getByText('2')).toBeInTheDocument(); // updatedRequests
      expect(screen.getByText(/requisições atualizadas/i)).toBeInTheDocument();

      expect(screen.getByText('5')).toBeInTheDocument(); // fieldsAdded
      expect(screen.getByText(/campos adicionados/i)).toBeInTheDocument();

      expect(screen.getByText('1')).toBeInTheDocument(); // fieldsRemoved
      expect(screen.getByText(/campos removidos/i)).toBeInTheDocument();

      expect(screen.getByText('7')).toBeInTheDocument(); // fieldsPreserved
      expect(screen.getByText(/campos preservados/i)).toBeInTheDocument();

      expect(handleSyncSuccess).toHaveBeenCalledWith(mockReport);
    });

    it('displays error feedback when synchronization fails', async () => {
      const handleSync = vi.fn().mockRejectedValue(new Error('Falha ao conectar com o servidor da spec'));

      render(
        <CollectionSettingsModal
          isOpen={true}
          onClose={() => {}}
          collection={mockCollection}
          onSync={handleSync}
        />
      );

      const syncBtn = screen.getByRole('button', { name: /sincronizar coleção/i });
      fireEvent.click(syncBtn);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.getByText(/falha ao conectar com o servidor da spec/i)).toBeInTheDocument();
      });
    });
  });

  describe('Modal Dismissal', () => {
    it('closes on cancel button click', () => {
      const handleClose = vi.fn();
      render(
        <CollectionSettingsModal
          isOpen={true}
          onClose={handleClose}
          collection={mockCollection}
        />
      );

      const cancelBtn = screen.getByRole('button', { name: /cancelar/i });
      fireEvent.click(cancelBtn);
      expect(handleClose).toHaveBeenCalledTimes(1);
    });

    it('closes on close (X) button click', () => {
      const handleClose = vi.fn();
      render(
        <CollectionSettingsModal
          isOpen={true}
          onClose={handleClose}
          collection={mockCollection}
        />
      );

      const closeBtn = screen.getByRole('button', { name: /fechar modal|fechar/i });
      fireEvent.click(closeBtn);
      expect(handleClose).toHaveBeenCalledTimes(1);
    });

    it('closes on Escape key press', () => {
      const handleClose = vi.fn();
      render(
        <CollectionSettingsModal
          isOpen={true}
          onClose={handleClose}
          collection={mockCollection}
        />
      );

      fireEvent.keyDown(window, { key: 'Escape' });
      expect(handleClose).toHaveBeenCalledTimes(1);
    });

    it('closes when backdrop is clicked', () => {
      const handleClose = vi.fn();
      render(
        <CollectionSettingsModal
          isOpen={true}
          onClose={handleClose}
          collection={mockCollection}
        />
      );

      const backdrop = screen.getByTestId('collection-settings-backdrop');
      fireEvent.click(backdrop);
      expect(handleClose).toHaveBeenCalledTimes(1);
    });
  });
});
