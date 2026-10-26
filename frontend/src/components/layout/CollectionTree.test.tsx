import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { CollectionTree } from './CollectionTree';
import { WorkspaceTreeDto } from '@/lib/treeApi';

const mockTree: WorkspaceTreeDto = {
  workspaceId: '00000000-0000-0000-0000-000000000001',
  workspaceName: 'Default Workspace',
  collections: [
    {
      id: 'coll-1',
      name: 'Auth API',
      defaultTarget: 'Inherit' as const,
      openApiSpecUrl: 'https://api.test/swagger.json',
      folders: [
        {
          id: 'fold-1',
          name: 'V1',
          collectionId: 'coll-1',
          parentFolderId: null,
          defaultTarget: 'Inherit' as const,
          subFolders: [
            {
              id: 'fold-sub-1',
              name: 'Nested Subfolder',
              collectionId: 'coll-1',
              parentFolderId: 'fold-1',
              defaultTarget: 'Inherit' as const,
              subFolders: [],
              requests: [
                {
                  id: 'req-sub-1',
                  name: 'Nested Req',
                  method: 'DELETE',
                  url: 'https://api.test/delete',
                  target: 'Inherit' as const,
                  bodyType: 'None' as const,
                  headersJson: '{}',
                  bodyContent: null,
                  collectionId: 'coll-1',
                  folderId: 'fold-sub-1',
                },
              ],
            },
          ],
          requests: [
            {
              id: 'req-1',
              name: 'Login',
              method: 'POST',
              url: 'https://api.test/login',
              target: 'Inherit' as const,
              bodyType: 'Json' as const,
              headersJson: '{}',
              bodyContent: null,
              collectionId: 'coll-1',
              folderId: 'fold-1',
            },
            {
              id: 'req-2',
              name: 'Get Profile',
              method: 'GET',
              url: 'https://api.test/profile',
              target: 'Inherit' as const,
              bodyType: 'None' as const,
              headersJson: '{}',
              bodyContent: null,
              collectionId: 'coll-1',
              folderId: 'fold-1',
            },
          ],
        },
      ],
      requests: [
        {
          id: 'req-root-1',
          name: 'Health Check',
          method: 'GET',
          url: 'https://api.test/health',
          target: 'Inherit' as const,
          bodyType: 'None' as const,
          headersJson: '{}',
          bodyContent: null,
          collectionId: 'coll-1',
          folderId: null,
        },
      ],
    },
    {
      id: 'coll-empty',
      name: 'Empty Collection',
      defaultTarget: 'Inherit' as const,
      openApiSpecUrl: null,
      folders: [],
      requests: [],
    },
  ],
};

describe('CollectionTree', () => {
  it('renders single + Novo button without chevron and filter bar', () => {
    render(<CollectionTree tree={mockTree} />);
    const btn = screen.getByRole('button', { name: /\+ novo/i });
    expect(btn).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/filtrar/i)).toBeInTheDocument();
  });

  it('opens creation dropdown on + Novo click and triggers creation', async () => {
    const onStartCreate = vi.fn();
    render(<CollectionTree tree={mockTree} onStartCreate={onStartCreate} />);
    fireEvent.click(screen.getByRole('button', { name: /\+ novo/i }));

    expect(screen.getByText(/nova coleção/i)).toBeInTheDocument();
    expect(screen.getByText(/nova pasta/i)).toBeInTheDocument();
    expect(screen.getByText(/nova requisição/i)).toBeInTheDocument();

    fireEvent.click(screen.getByText(/nova coleção/i));
    expect(onStartCreate).toHaveBeenCalledWith('collection', null);
  });

  it('opens context menu on right click of a request item', () => {
    render(<CollectionTree tree={mockTree} />);
    const reqNode = screen.getByText('Login');
    fireEvent.contextMenu(reqNode);

    expect(screen.getByText(/duplicar/i)).toBeInTheDocument();
    expect(screen.getByText(/renomear/i)).toBeInTheDocument();
    expect(screen.getByText(/excluir/i)).toBeInTheDocument();
  });

  it('renders collections, nested folders, and requests with correct HTTP method badges', () => {
    render(<CollectionTree tree={mockTree} />);

    expect(screen.getByText('Auth API')).toBeInTheDocument();
    expect(screen.getByText('V1')).toBeInTheDocument();
    expect(screen.getByText('Nested Subfolder')).toBeInTheDocument();
    expect(screen.getByText('Login')).toBeInTheDocument();
    expect(screen.getByText('Health Check')).toBeInTheDocument();

    // Verify method badges
    expect(screen.getByText('POST')).toBeInTheDocument();
    const getBadges = screen.getAllByText('GET');
    expect(getBadges.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('DELETE')).toBeInTheDocument();
  });

  it('collapses and expands folders and collections on chevron click', () => {
    render(<CollectionTree tree={mockTree} />);

    // Initially Login is visible
    expect(screen.getByText('Login')).toBeInTheDocument();

    // Click collapse on V1 folder
    const v1CollapseBtn = screen.getByRole('button', { name: /recolher pasta v1/i });
    fireEvent.click(v1CollapseBtn);

    // Login is collapsed/hidden
    expect(screen.queryByText('Login')).not.toBeInTheDocument();

    // Click expand on V1 folder
    const v1ExpandBtn = screen.getByRole('button', { name: /expandir pasta v1/i });
    fireEvent.click(v1ExpandBtn);

    // Login is visible again
    expect(screen.getByText('Login')).toBeInTheDocument();

    // Click collapse on collection Auth API
    const authCollapseBtn = screen.getByRole('button', { name: /recolher coleção auth api/i });
    fireEvent.click(authCollapseBtn);

    expect(screen.queryByText('V1')).not.toBeInTheDocument();
    expect(screen.queryByText('Health Check')).not.toBeInTheDocument();
  });

  it('calls onSelect when clicking a collection, folder, or request item', () => {
    const handleSelect = vi.fn();
    render(<CollectionTree tree={mockTree} onSelect={handleSelect} />);

    // Click request
    fireEvent.click(screen.getByText('Login'));
    expect(handleSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'request',
        id: 'req-1',
      })
    );

    // Click folder
    fireEvent.click(screen.getByText('V1'));
    expect(handleSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'folder',
        id: 'fold-1',
      })
    );

    // Click collection
    fireEvent.click(screen.getByText('Auth API'));
    expect(handleSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'collection',
        id: 'coll-1',
      })
    );
  });

  it('filters tree items based on text typed in the search bar', () => {
    render(<CollectionTree tree={mockTree} />);

    const searchInput = screen.getByPlaceholderText(/filtrar/i);
    fireEvent.change(searchInput, { target: { value: 'Login' } });

    // Login should be visible
    expect(screen.getByText('Login')).toBeInTheDocument();
    expect(screen.getByText('Auth API')).toBeInTheDocument();
    expect(screen.getByText('V1')).toBeInTheDocument();

    // Health Check and Empty Collection shouldn't be visible
    expect(screen.queryByText('Health Check')).not.toBeInTheDocument();
    expect(screen.queryByText('Empty Collection')).not.toBeInTheDocument();
  });

  it('calls onFilterChange when controlled filterText is used', () => {
    const onFilterChange = vi.fn();
    render(<CollectionTree tree={mockTree} filterText="" onFilterChange={onFilterChange} />);

    const searchInput = screen.getByPlaceholderText(/filtrar/i);
    fireEvent.change(searchInput, { target: { value: 'test' } });

    expect(onFilterChange).toHaveBeenCalledWith('test');
  });

  it('calls onReload when reload button is clicked', () => {
    const onReload = vi.fn();
    render(<CollectionTree tree={mockTree} onReload={onReload} />);

    const reloadBtn = screen.getByRole('button', { name: /recarregar/i });
    fireEvent.click(reloadBtn);

    expect(onReload).toHaveBeenCalledTimes(1);
  });

  it('opens context menu on collection and triggers actions', () => {
    const onStartCreate = vi.fn();
    render(<CollectionTree tree={mockTree} onStartCreate={onStartCreate} />);

    const colNode = screen.getByText('Auth API');
    fireEvent.contextMenu(colNode);

    expect(screen.getByText(/nova pasta/i)).toBeInTheDocument();
    expect(screen.getByText(/nova requisição/i)).toBeInTheDocument();
    expect(screen.getByText(/renomear/i)).toBeInTheDocument();
    expect(screen.getByText(/sincronizar openapi/i)).toBeInTheDocument();
    expect(screen.getByText(/excluir/i)).toBeInTheDocument();

    // Click Nova Pasta on collection
    fireEvent.click(screen.getByText(/nova pasta/i));
    expect(onStartCreate).toHaveBeenCalledWith('folder', 'coll-1');
  });

  it('opens context menu on folder and triggers actions', () => {
    const onStartCreate = vi.fn();
    render(<CollectionTree tree={mockTree} onStartCreate={onStartCreate} />);

    const folderNode = screen.getByText('V1');
    fireEvent.contextMenu(folderNode);

    expect(screen.getByText(/nova pasta/i)).toBeInTheDocument();
    expect(screen.getByText(/nova requisição/i)).toBeInTheDocument();
    expect(screen.getByText(/renomear/i)).toBeInTheDocument();
    expect(screen.getByText(/excluir/i)).toBeInTheDocument();

    // Click Nova Requisição on folder
    fireEvent.click(screen.getByText(/nova requisição/i));
    expect(onStartCreate).toHaveBeenCalledWith('request', 'fold-1');
  });

  it('opens context menu on empty area and triggers actions', () => {
    const onStartCreate = vi.fn();
    const onReload = vi.fn();
    const onImportOpenApi = vi.fn();

    render(
      <CollectionTree
        tree={mockTree}
        onStartCreate={onStartCreate}
        onReload={onReload}
        onImportOpenApi={onImportOpenApi}
      />
    );

    const emptyArea = screen.getByTestId('collection-tree-empty-area');
    fireEvent.contextMenu(emptyArea);

    expect(screen.getByText(/nova coleção/i)).toBeInTheDocument();
    expect(screen.getByText(/importar openapi/i)).toBeInTheDocument();
    expect(screen.getByText(/recarregar árvore/i)).toBeInTheDocument();

    // Click Nova Coleção
    fireEvent.click(screen.getByText(/nova coleção/i));
    expect(onStartCreate).toHaveBeenCalledWith('collection', null);
  });

  it('calls onDuplicateRequest from request context menu', () => {
    const onDuplicateRequest = vi.fn();
    render(<CollectionTree tree={mockTree} onDuplicateRequest={onDuplicateRequest} />);

    const reqNode = screen.getByText('Login');
    fireEvent.contextMenu(reqNode);

    fireEvent.click(screen.getByText(/duplicar/i));
    expect(onDuplicateRequest).toHaveBeenCalledWith('req-1');
  });

  it('handles inline renaming on a collection and commits on Enter', async () => {
    const onUpdateCollection = vi.fn();
    render(<CollectionTree tree={mockTree} onUpdateCollection={onUpdateCollection} />);

    // Right-click collection and choose Renomear
    fireEvent.contextMenu(screen.getByText('Auth API'));
    fireEvent.click(screen.getByText(/renomear/i));

    // Inline input should be present
    const inlineInput = screen.getByRole('textbox', { name: /renomear coleção/i });
    expect(inlineInput).toBeInTheDocument();
    expect(inlineInput).toHaveValue('Auth API');

    // Change value and commit with Enter
    fireEvent.change(inlineInput, { target: { value: 'Auth V2 API' } });
    fireEvent.keyDown(inlineInput, { key: 'Enter' });

    expect(onUpdateCollection).toHaveBeenCalledWith('coll-1', 'Auth V2 API');
  });

  it('handles inline renaming on a request and cancels on Escape', () => {
    const onUpdateRequest = vi.fn();
    render(<CollectionTree tree={mockTree} onUpdateRequest={onUpdateRequest} />);

    // Right-click request and choose Renomear
    fireEvent.contextMenu(screen.getByText('Login'));
    fireEvent.click(screen.getByText(/renomear/i));

    const inlineInput = screen.getByRole('textbox', { name: /renomear requisição/i });
    expect(inlineInput).toBeInTheDocument();

    // Press Escape
    fireEvent.keyDown(inlineInput, { key: 'Escape' });

    expect(onUpdateRequest).not.toHaveBeenCalled();
    expect(screen.getByText('Login')).toBeInTheDocument();
  });

  it('displays confirmation modal when deleting a non-empty collection and executes deletion on confirm', () => {
    const onDeleteCollection = vi.fn();
    render(<CollectionTree tree={mockTree} onDeleteCollection={onDeleteCollection} />);

    // Right-click non-empty collection and choose Excluir
    fireEvent.contextMenu(screen.getByText('Auth API'));
    fireEvent.click(screen.getByText(/excluir/i));

    // Modal dialog should appear
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(
      screen.getByText(/a coleção "auth api" não está vazia\. todos os itens contidos nela serão excluídos permanentemente\./i)
    ).toBeInTheDocument();

    // Confirm deletion
    const confirmBtn = screen.getByRole('button', { name: /^excluir$/i });
    fireEvent.click(confirmBtn);

    expect(onDeleteCollection).toHaveBeenCalledWith('coll-1');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('cancels deletion when clicking Cancelar in confirmation modal', () => {
    const onDeleteCollection = vi.fn();
    render(<CollectionTree tree={mockTree} onDeleteCollection={onDeleteCollection} />);

    fireEvent.contextMenu(screen.getByText('Auth API'));
    fireEvent.click(screen.getByText(/excluir/i));

    expect(screen.getByRole('dialog')).toBeInTheDocument();

    const cancelBtn = screen.getByRole('button', { name: /cancelar/i });
    fireEvent.click(cancelBtn);

    expect(onDeleteCollection).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('deletes empty collection immediately without confirmation modal', () => {
    const onDeleteCollection = vi.fn();
    render(<CollectionTree tree={mockTree} onDeleteCollection={onDeleteCollection} />);

    fireEvent.contextMenu(screen.getByText('Empty Collection'));
    fireEvent.click(screen.getByText(/excluir/i));

    // Dialog should NOT appear because collection is empty
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onDeleteCollection).toHaveBeenCalledWith('coll-empty');
  });

  it('displays confirmation modal when deleting a non-empty folder and executes deletion', () => {
    const onDeleteFolder = vi.fn();
    render(<CollectionTree tree={mockTree} onDeleteFolder={onDeleteFolder} />);

    fireEvent.contextMenu(screen.getByText('V1'));
    fireEvent.click(screen.getByText(/excluir/i));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(
      screen.getByText(/a pasta "v1" não está vazia/i)
    ).toBeInTheDocument();

    const confirmBtn = screen.getByRole('button', { name: /^excluir$/i });
    fireEvent.click(confirmBtn);

    expect(onDeleteFolder).toHaveBeenCalledWith('fold-1');
  });

  it('deletes request directly without confirmation modal', () => {
    const onDeleteRequest = vi.fn();
    render(<CollectionTree tree={mockTree} onDeleteRequest={onDeleteRequest} />);

    fireEvent.contextMenu(screen.getByText('Login'));
    fireEvent.click(screen.getByText(/excluir/i));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onDeleteRequest).toHaveBeenCalledWith('req-1');
  });

  it('creates a new collection inline and commits on Enter', () => {
    const onCreateCollection = vi.fn();
    render(<CollectionTree tree={mockTree} onCreateCollection={onCreateCollection} />);

    // Click + Novo -> Nova Coleção
    fireEvent.click(screen.getByRole('button', { name: /\+ novo/i }));
    fireEvent.click(screen.getByText(/nova coleção/i));

    const inlineInput = screen.getByRole('textbox', { name: /nova coleção/i });
    expect(inlineInput).toBeInTheDocument();

    fireEvent.change(inlineInput, { target: { value: 'Payments API' } });
    fireEvent.keyDown(inlineInput, { key: 'Enter' });

    expect(onCreateCollection).toHaveBeenCalledWith('Payments API');
  });

  it('resolves target collection when clicking Nova Pasta in + Novo with collection selected', () => {
    const onStartCreate = vi.fn();
    render(<CollectionTree tree={mockTree} selectedId="coll-1" onStartCreate={onStartCreate} />);

    fireEvent.click(screen.getByRole('button', { name: /\+ novo/i }));
    fireEvent.click(screen.getByText(/nova pasta/i));

    expect(onStartCreate).toHaveBeenCalledWith('folder', 'coll-1');
  });

  it('resolves target folder when clicking Nova Requisição in + Novo with folder selected', () => {
    const onStartCreate = vi.fn();
    render(<CollectionTree tree={mockTree} selectedId="fold-1" onStartCreate={onStartCreate} />);

    fireEvent.click(screen.getByRole('button', { name: /\+ novo/i }));
    fireEvent.click(screen.getByText(/nova requisição/i));

    expect(onStartCreate).toHaveBeenCalledWith('request', 'fold-1');
  });

  it('renders sync and settings action buttons on collections', () => {
    const onSyncCollection = vi.fn();
    const onOpenCollectionSettings = vi.fn();

    render(
      <CollectionTree
        tree={mockTree}
        onSyncCollection={onSyncCollection}
        onOpenCollectionSettings={onOpenCollectionSettings}
      />
    );

    const syncBtn = screen.getByRole('button', { name: /sincronizar coleção auth api/i });
    expect(syncBtn).toBeInTheDocument();
    fireEvent.click(syncBtn);
    expect(onSyncCollection).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'coll-1', name: 'Auth API' })
    );

    const settingsBtn = screen.getByRole('button', { name: /configurações da coleção auth api/i });
    expect(settingsBtn).toBeInTheDocument();
    fireEvent.click(settingsBtn);
    expect(onOpenCollectionSettings).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'coll-1', name: 'Auth API' })
    );
  });
});
