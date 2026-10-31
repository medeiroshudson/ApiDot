import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { CollectionTree, HTTP_METHOD_BADGES } from './CollectionTree';
import { WorkspaceTreeDto, WorkspaceDto } from '@/lib/treeApi';

const mockWorkspaces: WorkspaceDto[] = [
  {
    id: 'ws-1',
    name: 'Workspace Pessoal',
    createdAtUtc: '2026-01-01T00:00:00Z',
  },
  {
    id: 'ws-2',
    name: 'Workspace Corporativo',
    createdAtUtc: '2026-01-02T00:00:00Z',
  },
];

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
  it('renders single Novo button without chevron and filter bar', () => {
    render(<CollectionTree tree={mockTree} />);
    const btn = screen.getByRole('button', { name: /new/i });
    expect(btn).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/filter/i)).toBeInTheDocument();
  });

  it('opens creation dropdown on Novo click and triggers creation', async () => {
    const onStartCreate = vi.fn();
    render(<CollectionTree tree={mockTree} onStartCreate={onStartCreate} />);
    fireEvent.click(screen.getByRole('button', { name: /new/i }));

    expect(screen.getByText(/new collection/i)).toBeInTheDocument();
    expect(screen.getByText(/new folder/i)).toBeInTheDocument();
    expect(screen.getByText(/new request/i)).toBeInTheDocument();

    fireEvent.click(screen.getByText(/new collection/i));
    expect(onStartCreate).toHaveBeenCalledWith('collection', null);
  });

  it('opens context menu on right click of a request item', () => {
    render(<CollectionTree tree={mockTree} />);
    const reqNode = screen.getByText('Login');
    fireEvent.contextMenu(reqNode);

    expect(screen.getByText(/copy curl/i)).toBeInTheDocument();
    expect(screen.getByText(/duplicate/i)).toBeInTheDocument();
    expect(screen.getByText(/rename/i)).toBeInTheDocument();
    expect(screen.getByText('Delete')).toBeInTheDocument();
  });

  it('renders collections, nested folders, and requests with correct HTTP method badges', () => {
    render(<CollectionTree tree={mockTree} />);

    expect(screen.getByText('Auth API')).toBeInTheDocument();
    expect(screen.getByText('V1')).toBeInTheDocument();
    expect(screen.getByText('Nested Subfolder')).toBeInTheDocument();
    expect(screen.getByText('Login')).toBeInTheDocument();
    expect(screen.getByText('Health Check')).toBeInTheDocument();

    // Verify method badges
    const postBadge = screen.getByText('POST');
    expect(postBadge).toBeInTheDocument();
    expect(postBadge.className).toContain(HTTP_METHOD_BADGES.POST);
    const getBadges = screen.getAllByText('GET');
    expect(getBadges.length).toBeGreaterThanOrEqual(1);
    expect(getBadges[0].className).toContain(HTTP_METHOD_BADGES.GET);
    expect(screen.getByText('DELETE')).toBeInTheDocument();
  });

  it('collapses and expands folders and collections on chevron click', () => {
    render(<CollectionTree tree={mockTree} />);

    // Initially Login is visible
    expect(screen.getByText('Login')).toBeInTheDocument();

    // Click collapse on V1 folder
    const v1CollapseBtn = screen.getByRole('button', { name: /collapse folder v1/i });
    fireEvent.click(v1CollapseBtn);

    // Login is collapsed/hidden
    expect(screen.queryByText('Login')).not.toBeInTheDocument();

    // Click expand on V1 folder
    const v1ExpandBtn = screen.getByRole('button', { name: /expand folder v1/i });
    fireEvent.click(v1ExpandBtn);

    // Login is visible again
    expect(screen.getByText('Login')).toBeInTheDocument();

    // Click collapse on collection Auth API
    const authCollapseBtn = screen.getByRole('button', { name: /collapse collection auth api/i });
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

    const searchInput = screen.getByPlaceholderText(/filter/i);
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

    const searchInput = screen.getByPlaceholderText(/filter/i);
    fireEvent.change(searchInput, { target: { value: 'test' } });

    expect(onFilterChange).toHaveBeenCalledWith('test');
  });

  it('calls onReload when reload button is clicked', () => {
    const onReload = vi.fn();
    render(<CollectionTree tree={mockTree} onReload={onReload} />);

    const reloadBtn = screen.getByRole('button', { name: /reload tree/i });
    fireEvent.click(reloadBtn);

    expect(onReload).toHaveBeenCalledTimes(1);
  });

  it('opens context menu on collection and triggers actions', () => {
    const onStartCreate = vi.fn();
    render(<CollectionTree tree={mockTree} onStartCreate={onStartCreate} />);

    const colNode = screen.getByText('Auth API');
    fireEvent.contextMenu(colNode);

    expect(screen.getByText(/new folder/i)).toBeInTheDocument();
    expect(screen.getByText(/new request/i)).toBeInTheDocument();
    expect(screen.getByText(/import curl/i)).toBeInTheDocument();
    expect(screen.getByText(/rename/i)).toBeInTheDocument();
    expect(screen.getByText(/sync openapi/i)).toBeInTheDocument();
    expect(screen.getByText('Delete')).toBeInTheDocument();

    // Click New Folder on collection
    fireEvent.click(screen.getByText(/new folder/i));
    expect(onStartCreate).toHaveBeenCalledWith('folder', 'coll-1');
  });

  it('opens context menu on folder and triggers actions', () => {
    const onStartCreate = vi.fn();
    render(<CollectionTree tree={mockTree} onStartCreate={onStartCreate} />);

    const folderNode = screen.getByText('V1');
    fireEvent.contextMenu(folderNode);

    expect(screen.getByText(/new folder/i)).toBeInTheDocument();
    expect(screen.getByText(/new request/i)).toBeInTheDocument();
    expect(screen.getByText(/import curl/i)).toBeInTheDocument();
    expect(screen.getByText(/rename/i)).toBeInTheDocument();
    expect(screen.getByText('Delete')).toBeInTheDocument();

    // Click New Request on folder
    fireEvent.click(screen.getByText(/new request/i));
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

    expect(screen.getByText(/new collection/i)).toBeInTheDocument();
    expect(screen.getByText(/import openapi/i)).toBeInTheDocument();
    expect(screen.getByText(/reload tree/i)).toBeInTheDocument();

    // Click New Collection
    fireEvent.click(screen.getByText(/new collection/i));
    expect(onStartCreate).toHaveBeenCalledWith('collection', null);
  });

  it('calls onDuplicateRequest from request context menu', () => {
    const onDuplicateRequest = vi.fn();
    render(<CollectionTree tree={mockTree} onDuplicateRequest={onDuplicateRequest} />);

    const reqNode = screen.getByText('Login');
    fireEvent.contextMenu(reqNode);

    fireEvent.click(screen.getByText(/duplicate/i));
    expect(onDuplicateRequest).toHaveBeenCalledWith('req-1');
  });

  describe('cURL context menu actions', () => {
    it('opens context menu on collection and triggers onImportCurl with collection id and null folder id', () => {
      const onImportCurl = vi.fn();
      render(<CollectionTree tree={mockTree} onImportCurl={onImportCurl} />);

      const colNode = screen.getByText('Auth API');
      fireEvent.contextMenu(colNode);

      const importCurlItem = screen.getByText('Import cURL');
      expect(importCurlItem).toBeInTheDocument();

      fireEvent.click(importCurlItem);
      expect(onImportCurl).toHaveBeenCalledTimes(1);
      expect(onImportCurl).toHaveBeenCalledWith('coll-1', null);
    });

    it('opens context menu on folder and triggers onImportCurl with collection id and folder id', () => {
      const onImportCurl = vi.fn();
      render(<CollectionTree tree={mockTree} onImportCurl={onImportCurl} />);

      const folderNode = screen.getByText('V1');
      fireEvent.contextMenu(folderNode);

      const importCurlItem = screen.getByText('Import cURL');
      expect(importCurlItem).toBeInTheDocument();

      fireEvent.click(importCurlItem);
      expect(onImportCurl).toHaveBeenCalledTimes(1);
      expect(onImportCurl).toHaveBeenCalledWith('coll-1', 'fold-1');
    });

    it('opens context menu on request and triggers onCopyCurl with request item', () => {
      const onCopyCurl = vi.fn();
      render(<CollectionTree tree={mockTree} onCopyCurl={onCopyCurl} />);

      const reqNode = screen.getByText('Login');
      fireEvent.contextMenu(reqNode);

      const copyCurlItem = screen.getByText('Copy cURL');
      expect(copyCurlItem).toBeInTheDocument();

      fireEvent.click(copyCurlItem);
      expect(onCopyCurl).toHaveBeenCalledTimes(1);
      expect(onCopyCurl).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'req-1',
          name: 'Login',
          method: 'POST',
          url: 'https://api.test/login',
          collectionId: 'coll-1',
          folderId: 'fold-1',
        })
      );
    });

    it('does not throw when clicking Import cURL or Copy cURL if callbacks are undefined', () => {
      render(<CollectionTree tree={mockTree} />);

      // Collection context menu
      fireEvent.contextMenu(screen.getByText('Auth API'));
      expect(() => fireEvent.click(screen.getByText('Import cURL'))).not.toThrow();

      // Folder context menu
      fireEvent.contextMenu(screen.getByText('V1'));
      expect(() => fireEvent.click(screen.getByText('Import cURL'))).not.toThrow();

      // Request context menu
      fireEvent.contextMenu(screen.getByText('Login'));
      expect(() => fireEvent.click(screen.getByText('Copy cURL'))).not.toThrow();
    });
  });

  it('handles inline renaming on a collection and commits on Enter', async () => {
    const onUpdateCollection = vi.fn();
    render(<CollectionTree tree={mockTree} onUpdateCollection={onUpdateCollection} />);

    // Right-click collection and choose Rename
    fireEvent.contextMenu(screen.getByText('Auth API'));
    fireEvent.click(screen.getByText(/rename/i));

    // Inline input should be present
    const inlineInput = screen.getByRole('textbox', { name: /rename collection/i });
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

    // Right-click request and choose Rename
    fireEvent.contextMenu(screen.getByText('Login'));
    fireEvent.click(screen.getByText(/rename/i));

    const inlineInput = screen.getByRole('textbox', { name: /rename request/i });
    expect(inlineInput).toBeInTheDocument();

    // Press Escape
    fireEvent.keyDown(inlineInput, { key: 'Escape' });

    expect(onUpdateRequest).not.toHaveBeenCalled();
    expect(screen.getByText('Login')).toBeInTheDocument();
  });

  it('displays confirmation modal when deleting a non-empty collection and executes deletion on confirm', () => {
    const onDeleteCollection = vi.fn();
    render(<CollectionTree tree={mockTree} onDeleteCollection={onDeleteCollection} />);

    // Right-click non-empty collection and choose Delete
    fireEvent.contextMenu(screen.getByText('Auth API'));
    fireEvent.click(screen.getByText('Delete'));

    // Modal dialog should appear
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(
      screen.getByText(/collection "auth api" is not empty\. all items inside it will be permanently deleted\./i)
    ).toBeInTheDocument();

    // Confirm deletion
    const confirmBtn = screen.getByRole('button', { name: /^delete$/i });
    fireEvent.click(confirmBtn);

    expect(onDeleteCollection).toHaveBeenCalledWith('coll-1');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('cancels deletion when clicking Cancelar in confirmation modal', () => {
    const onDeleteCollection = vi.fn();
    render(<CollectionTree tree={mockTree} onDeleteCollection={onDeleteCollection} />);

    fireEvent.contextMenu(screen.getByText('Auth API'));
    fireEvent.click(screen.getByText('Delete'));

    expect(screen.getByRole('dialog')).toBeInTheDocument();

    const cancelBtn = screen.getByRole('button', { name: /cancel/i });
    fireEvent.click(cancelBtn);

    expect(onDeleteCollection).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('deletes empty collection immediately without confirmation modal', () => {
    const onDeleteCollection = vi.fn();
    render(<CollectionTree tree={mockTree} onDeleteCollection={onDeleteCollection} />);

    fireEvent.contextMenu(screen.getByText('Empty Collection'));
    fireEvent.click(screen.getByText('Delete'));

    // Dialog should NOT appear because collection is empty
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onDeleteCollection).toHaveBeenCalledWith('coll-empty');
  });

  it('displays confirmation modal when deleting a non-empty folder and executes deletion', () => {
    const onDeleteFolder = vi.fn();
    render(<CollectionTree tree={mockTree} onDeleteFolder={onDeleteFolder} />);

    fireEvent.contextMenu(screen.getByText('V1'));
    fireEvent.click(screen.getByText('Delete'));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(
      screen.getByText(/folder "v1" is not empty/i)
    ).toBeInTheDocument();

    const confirmBtn = screen.getByRole('button', { name: /^delete$/i });
    fireEvent.click(confirmBtn);

    expect(onDeleteFolder).toHaveBeenCalledWith('fold-1');
  });

  it('deletes request directly without confirmation modal', () => {
    const onDeleteRequest = vi.fn();
    render(<CollectionTree tree={mockTree} onDeleteRequest={onDeleteRequest} />);

    fireEvent.contextMenu(screen.getByText('Login'));
    fireEvent.click(screen.getByText('Delete'));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onDeleteRequest).toHaveBeenCalledWith('req-1');
  });

  it('creates a new collection inline and commits on Enter', () => {
    const onCreateCollection = vi.fn();
    render(<CollectionTree tree={mockTree} onCreateCollection={onCreateCollection} />);

    // Click New -> New Collection
    fireEvent.click(screen.getByRole('button', { name: /new/i }));
    fireEvent.click(screen.getByText(/new collection/i));

    const inlineInput = screen.getByRole('textbox', { name: /new collection/i });
    expect(inlineInput).toBeInTheDocument();

    fireEvent.change(inlineInput, { target: { value: 'Payments API' } });
    fireEvent.keyDown(inlineInput, { key: 'Enter' });

    expect(onCreateCollection).toHaveBeenCalledWith('Payments API');
  });

  it('resolves target collection when clicking Nova Pasta in Novo with collection selected', () => {
    const onStartCreate = vi.fn();
    render(<CollectionTree tree={mockTree} selectedId="coll-1" onStartCreate={onStartCreate} />);

    fireEvent.click(screen.getByRole('button', { name: /new/i }));
    fireEvent.click(screen.getByText(/new folder/i));

    expect(onStartCreate).toHaveBeenCalledWith('folder', 'coll-1');
  });

  it('resolves target folder when clicking Nova Requisição in Novo with folder selected', () => {
    const onStartCreate = vi.fn();
    render(<CollectionTree tree={mockTree} selectedId="fold-1" onStartCreate={onStartCreate} />);

    fireEvent.click(screen.getByRole('button', { name: /new/i }));
    fireEvent.click(screen.getByText(/new request/i));

    expect(onStartCreate).toHaveBeenCalledWith('request', 'fold-1');
  });

  it('renders settings action button on collections and excludes redundant sync button', () => {
    const onOpenCollectionSettings = vi.fn();

    render(
      <CollectionTree
        tree={mockTree}
        onOpenCollectionSettings={onOpenCollectionSettings}
      />
    );

    // Sync button should NOT be in the collection row
    expect(screen.queryByRole('button', { name: /sync collection auth api/i })).toBeNull();

    const settingsBtn = screen.getByRole('button', { name: /collection settings auth api/i });
    expect(settingsBtn).toBeInTheDocument();
    fireEvent.click(settingsBtn);
    expect(onOpenCollectionSettings).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'coll-1', name: 'Auth API' })
    );
  });

  describe('Unified Sidebar Header & Workspaces', () => {
    it('renders WorkspaceSwitcher in the same top row as Novo when workspaces prop is provided', () => {
      render(
        <CollectionTree
          tree={mockTree}
          workspaces={mockWorkspaces}
          activeWorkspaceId="ws-1"
        />
      );

      const switcherBtn = screen.getByRole('button', { name: /workspace: workspace pessoal/i });
      const novoBtn = screen.getByRole('button', { name: /^new$/i });
      const reloadBtn = screen.getByRole('button', { name: /reload tree/i });

      expect(switcherBtn).toBeInTheDocument();
      expect(novoBtn).toBeInTheDocument();
      expect(reloadBtn).toBeInTheDocument();

      // Ensure switcher and action buttons share the same parent row container
      expect(switcherBtn.parentElement?.parentElement).toBe(novoBtn.parentElement?.parentElement);
    });

    it('renders clean welcome card and hides Novo button and search input when workspaces is empty', () => {
      const onCreateWorkspaceClick = vi.fn();
      render(
        <CollectionTree
          tree={null}
          workspaces={[]}
          onCreateWorkspaceClick={onCreateWorkspaceClick}
        />
      );

      expect(screen.getByTestId('sidebar-empty-workspace')).toBeInTheDocument();
      expect(screen.getByText('Start by creating your Workspace')).toBeInTheDocument();
      expect(
        screen.getByText(/workspaces isolate your collections, variables and requests for each project/i)
      ).toBeInTheDocument();

      const createBtn = screen.getByRole('button', { name: /^create workspace$/i });
      expect(createBtn).toBeInTheDocument();
      expect(createBtn.textContent).toBe('Create Workspace');

      fireEvent.click(createBtn);
      expect(onCreateWorkspaceClick).toHaveBeenCalledTimes(1);

      // Novo button and search bar should NOT be rendered in zero-workspaces state
      expect(screen.queryByRole('button', { name: /^new$/i })).toBeNull();
      expect(screen.queryByPlaceholderText(/filter/i)).toBeNull();
    });

    it('renders active workspace name, Novo button, search input, and tree when workspaces has items', () => {
      const onSelectWorkspace = vi.fn();
      render(
        <CollectionTree
          tree={mockTree}
          workspaces={mockWorkspaces}
          activeWorkspaceId="ws-1"
          onSelectWorkspace={onSelectWorkspace}
        />
      );

      expect(screen.getByText('Workspace Pessoal')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^new$/i })).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/filter/i)).toBeInTheDocument();
      expect(screen.getByText('Auth API')).toBeInTheDocument();

      // Select another workspace via the dropdown
      fireEvent.click(screen.getByRole('button', { name: /workspace: workspace pessoal/i }));
      fireEvent.click(screen.getByTestId('workspace-option-ws-2'));
      expect(onSelectWorkspace).toHaveBeenCalledWith('ws-2');
    });

    it('renders loading state when isWorkspacesLoading is true', () => {
      render(
        <CollectionTree
          tree={null}
          workspaces={[]}
          isWorkspacesLoading={true}
        />
      );

      expect(screen.getByTestId('sidebar-workspaces-loading')).toBeInTheDocument();
      expect(screen.getByText('Loading workspaces...')).toBeInTheDocument();
      expect(screen.queryByTestId('sidebar-empty-workspace')).toBeNull();
      expect(screen.queryByRole('button', { name: /^new$/i })).toBeNull();
    });

    it('closes Novo dropdown when WorkspaceSwitcher dropdown is opened', () => {
      render(
        <CollectionTree
          tree={mockTree}
          workspaces={mockWorkspaces}
          activeWorkspaceId="ws-1"
        />
      );

      // Open Novo dropdown
      fireEvent.click(screen.getByRole('button', { name: /^new$/i }));
      expect(screen.getByText(/new collection/i)).toBeInTheDocument();

      // Open Workspace dropdown
      fireEvent.click(screen.getByRole('button', { name: /workspace: workspace pessoal/i }));
      expect(screen.getByRole('listbox', { name: /workspaces/i })).toBeInTheDocument();

      // Novo dropdown should be closed
      expect(screen.queryByText(/new collection/i)).toBeNull();
    });

    it('opens empty context menu when right-clicking on root container or empty message', () => {
      render(
        <CollectionTree
          tree={{ workspaceId: 'ws-1', workspaceName: 'Workspace Pessoal', collections: [] }}
          workspaces={mockWorkspaces}
          activeWorkspaceId="ws-1"
        />
      );

      const container = screen.getByTestId('collection-tree-container');
      fireEvent.contextMenu(container);

      expect(screen.getByText(/new collection/i)).toBeInTheDocument();
      expect(screen.getByText(/import openapi/i)).toBeInTheDocument();
      expect(screen.getByText(/reload tree/i)).toBeInTheDocument();

      // Close menu
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(screen.queryByText(/new collection/i)).toBeNull();

      // Right-click on empty message text
      const emptyMessage = screen.getByText('No collections available.');
      fireEvent.contextMenu(emptyMessage);
      expect(screen.getByText(/new collection/i)).toBeInTheDocument();
    });

    it('allows native context menu when right-clicking inside search input', () => {
      render(
        <CollectionTree
          tree={mockTree}
          workspaces={mockWorkspaces}
          activeWorkspaceId="ws-1"
        />
      );

      const searchInput = screen.getByPlaceholderText('Filter by name or route...');
      const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
      searchInput.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(false);
      expect(screen.queryByText(/new collection/i)).toBeNull();
    });
  });
});
