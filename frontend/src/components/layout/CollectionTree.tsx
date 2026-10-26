import React, { useState, useMemo, useRef } from 'react';
import {
  Layers,
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  Plus,
  RefreshCw,
  Search,
  Copy,
  Pencil,
  Trash2,
  Download,
  Settings,
  AlertTriangle,
  Briefcase,
} from 'lucide-react';
import {
  WorkspaceTreeDto,
  WorkspaceDto,
  CollectionNodeDto,
  FolderNodeDto,
  RequestItemNodeDto,
} from '@/lib/treeApi';
import { filterTree, ActiveTreeItem, ActiveTreeItemType } from '@/hooks/useCollectionTree';
import { ContextMenu, ContextMenuItem, ContextMenuPosition } from '@/components/common/ContextMenu';
import { InlineNodeInput } from './InlineNodeInput';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';

export const HTTP_METHOD_BADGES: Record<string, string> = {
  GET: 'text-emerald-400 bg-emerald-950/60 border-emerald-800/80',
  POST: 'text-blue-400 bg-blue-950/60 border-blue-800/80',
  PUT: 'text-amber-400 bg-amber-950/60 border-amber-800/80',
  PATCH: 'text-purple-400 bg-purple-950/60 border-purple-800/80',
  DELETE: 'text-rose-400 bg-rose-950/60 border-rose-800/80',
  HEAD: 'text-neutral-400 bg-neutral-900 border-neutral-700',
  OPTIONS: 'text-cyan-400 bg-cyan-950/60 border-cyan-800/80',
};

export interface CollectionTreeProps {
  tree: WorkspaceTreeDto | null;
  selectedId?: string | null;
  activeItem?: ActiveTreeItem | null;
  isLoading?: boolean;
  syncingId?: string | null;
  filterText?: string;
  onFilterChange?: (text: string) => void;
  onSelect?: (item: ActiveTreeItem) => void;
  onSelectItem?: (item: ActiveTreeItem) => void;
  onStartCreate?: (type: 'collection' | 'folder' | 'request', parentId: string | null) => void;
  onCreateCollection?: (name: string) => Promise<unknown> | void;
  onCreateFolder?: (name: string, collectionId: string, parentFolderId?: string | null) => Promise<unknown> | void;
  onCreateRequest?: (name: string, collectionId?: string | null, folderId?: string | null) => Promise<unknown> | void;
  onUpdateCollection?: (id: string, name: string) => Promise<unknown> | void;
  onUpdateFolder?: (id: string, name: string) => Promise<unknown> | void;
  onUpdateRequest?: (id: string, name: string) => Promise<unknown> | void;
  onUpdateRequestName?: (id: string, name: string) => Promise<unknown> | void;
  onDeleteCollection?: (id: string) => Promise<unknown> | void;
  onDeleteFolder?: (id: string) => Promise<unknown> | void;
  onDeleteRequest?: (id: string) => Promise<unknown> | void;
  onDuplicateRequest?: (id: string) => Promise<unknown> | void;
  onReload?: () => Promise<unknown> | void;
  onImportOpenApi?: () => void;
  onSyncCollection?: (collection: CollectionNodeDto) => void;
  onSync?: (collection: CollectionNodeDto) => void;
  onOpenCollectionSettings?: (collection: CollectionNodeDto) => void;
  onOpenSettings?: (collection: CollectionNodeDto) => void;
  className?: string;

  // Workspace integration props
  workspaces?: WorkspaceDto[];
  activeWorkspaceId?: string | null;
  onSelectWorkspace?: (id: string) => void;
  onCreateWorkspaceClick?: () => void;
  isWorkspacesLoading?: boolean;
}

interface InlineEditingState {
  type: ActiveTreeItemType;
  id: string;
  name: string;
}

interface InlineCreatingState {
  type: 'collection' | 'folder' | 'request';
  parentId: string | null;
  collectionId?: string | null;
  folderId?: string | null;
}

interface DeleteModalState {
  isOpen: boolean;
  type: 'collection' | 'folder';
  id: string;
  name: string;
}

interface ContextMenuState {
  isOpen: boolean;
  position: ContextMenuPosition;
  targetType: 'collection' | 'folder' | 'request' | 'empty';
  targetItem: CollectionNodeDto | FolderNodeDto | RequestItemNodeDto | null;
}

function findFolderInCollections(collections: CollectionNodeDto[], folderId: string): FolderNodeDto | null {
  function search(folders: FolderNodeDto[]): FolderNodeDto | null {
    for (const f of folders) {
      if (f.id === folderId) return f;
      const sub = search(f.subFolders);
      if (sub) return sub;
    }
    return null;
  }

  for (const c of collections) {
    const found = search(c.folders);
    if (found) return found;
  }
  return null;
}

function findRequestInCollections(collections: CollectionNodeDto[], requestId: string): RequestItemNodeDto | null {
  function searchFolders(folders: FolderNodeDto[]): RequestItemNodeDto | null {
    for (const f of folders) {
      for (const req of f.requests) {
        if (req.id === requestId) return req;
      }
      const sub = searchFolders(f.subFolders);
      if (sub) return sub;
    }
    return null;
  }

  for (const c of collections) {
    for (const req of c.requests) {
      if (req.id === requestId) return req;
    }
    const found = searchFolders(c.folders);
    if (found) return found;
  }
  return null;
}

export function CollectionTree({
  tree,
  selectedId,
  activeItem,
  isLoading = false,
  syncingId,
  filterText,
  onFilterChange,
  onSelect,
  onSelectItem,
  onStartCreate,
  onCreateCollection,
  onCreateFolder,
  onCreateRequest,
  onUpdateCollection,
  onUpdateFolder,
  onUpdateRequest,
  onUpdateRequestName,
  onDeleteCollection,
  onDeleteFolder,
  onDeleteRequest,
  onDuplicateRequest,
  onReload,
  onImportOpenApi,
  onSyncCollection,
  onSync,
  onOpenCollectionSettings,
  onOpenSettings,
  className = '',
  workspaces,
  activeWorkspaceId,
  onSelectWorkspace,
  onCreateWorkspaceClick,
  isWorkspacesLoading = false,
}: CollectionTreeProps) {
  const treeContainerRef = useRef<HTMLDivElement>(null);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set());
  const [localFilter, setLocalFilter] = useState('');
  const [isNewMenuOpen, setIsNewMenuOpen] = useState(false);
  const [newMenuPos, setNewMenuPos] = useState<ContextMenuPosition>({ x: 0, y: 0 });

  const hasWorkspaces = workspaces !== undefined;
  const hasActiveWorkspace =
    !hasWorkspaces || Boolean(activeWorkspaceId) || (workspaces && workspaces.length > 0);

  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    isOpen: false,
    position: { x: 0, y: 0 },
    targetType: 'empty',
    targetItem: null,
  });

  const [inlineEditing, setInlineEditing] = useState<InlineEditingState | null>(null);
  const [inlineCreating, setInlineCreating] = useState<InlineCreatingState | null>(null);
  const [deleteModal, setDeleteModal] = useState<DeleteModalState | null>(null);

  const effectiveFilter = filterText !== undefined ? filterText : localFilter;

  const handleFilterChange = (val: string) => {
    if (onFilterChange) {
      onFilterChange(val);
    } else {
      setLocalFilter(val);
    }
  };

  const displayedTree = useMemo(() => {
    return filterTree(tree, effectiveFilter);
  }, [tree, effectiveFilter]);

  const toggleCollapse = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelect = (
    type: ActiveTreeItemType,
    id: string,
    data: CollectionNodeDto | FolderNodeDto | RequestItemNodeDto
  ) => {
    const item: ActiveTreeItem = { type, id, data };
    (onSelectItem ?? onSelect)?.(item);
  };

  const handleStartCreate = (
    type: 'collection' | 'folder' | 'request',
    parentId: string | null,
    collectionId?: string | null,
    folderId?: string | null
  ) => {
    onStartCreate?.(type, parentId);
    if (parentId) {
      setCollapsedIds((prev) => {
        const next = new Set(prev);
        next.delete(parentId);
        return next;
      });
    }
    setInlineCreating({
      type,
      parentId,
      collectionId,
      folderId,
    });
  };

  const handleStartRename = (type: ActiveTreeItemType, id: string, name: string) => {
    setInlineEditing({ type, id, name });
  };

  const handleContextMenu = (
    e: React.MouseEvent,
    type: 'collection' | 'folder' | 'request' | 'empty',
    item?: CollectionNodeDto | FolderNodeDto | RequestItemNodeDto | null
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setIsNewMenuOpen(false);
    setContextMenu({
      isOpen: true,
      position: { x: e.clientX, y: e.clientY },
      targetType: type,
      targetItem: item || null,
    });
  };

  const handleRequestDelete = (
    type: 'collection' | 'folder' | 'request',
    item: CollectionNodeDto | FolderNodeDto | RequestItemNodeDto
  ) => {
    if (type === 'collection') {
      const col = item as CollectionNodeDto;
      const hasChildren =
        (col.folders && col.folders.length > 0) || (col.requests && col.requests.length > 0);
      if (hasChildren) {
        setDeleteModal({ isOpen: true, type: 'collection', id: col.id, name: col.name });
      } else {
        onDeleteCollection?.(col.id);
      }
    } else if (type === 'folder') {
      const folder = item as FolderNodeDto;
      const hasChildren =
        (folder.subFolders && folder.subFolders.length > 0) ||
        (folder.requests && folder.requests.length > 0);
      if (hasChildren) {
        setDeleteModal({ isOpen: true, type: 'folder', id: folder.id, name: folder.name });
      } else {
        onDeleteFolder?.(folder.id);
      }
    } else if (type === 'request') {
      onDeleteRequest?.(item.id);
    }
  };

  const handleCommitCreate = async (name: string) => {
    const current = inlineCreating;
    setInlineCreating(null);
    const trimmed = name.trim();
    if (!trimmed || !current) return;

    if (current.type === 'collection') {
      await onCreateCollection?.(trimmed);
    } else if (current.type === 'folder') {
      const collId = current.collectionId || current.parentId;
      if (collId) {
        await onCreateFolder?.(trimmed, collId, current.folderId || null);
      }
    } else if (current.type === 'request') {
      await onCreateRequest?.(trimmed, current.collectionId || current.parentId || null, current.folderId || null);
    }
  };

  const handleCancelCreate = () => {
    setInlineCreating(null);
  };

  const handleCommitRename = async (type: ActiveTreeItemType, id: string, newName: string) => {
    setInlineEditing(null);
    const trimmed = newName.trim();
    if (!trimmed) return;

    if (type === 'collection') {
      await onUpdateCollection?.(id, trimmed);
    } else if (type === 'folder') {
      await onUpdateFolder?.(id, trimmed);
    } else if (type === 'request') {
      await (onUpdateRequestName ?? onUpdateRequest)?.(id, trimmed);
    }
  };

  const handleCancelRename = () => {
    setInlineEditing(null);
  };

  const handleNewButtonClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setNewMenuPos({ x: rect.left, y: rect.bottom + 4 });
    setContextMenu((prev) => ({ ...prev, isOpen: false }));
    setIsNewMenuOpen((prev) => !prev);
  };

  const handleNewOptionClick = (type: 'collection' | 'folder' | 'request') => {
    setIsNewMenuOpen(false);
    if (type === 'collection') {
      handleStartCreate('collection', null);
      return;
    }

    let targetCollectionId: string | null = null;
    let targetFolderId: string | null = null;
    let parentId: string | null = null;

    const currentSelectedId = selectedId || activeItem?.id;

    if (currentSelectedId && tree) {
      const col = tree.collections.find((c) => c.id === currentSelectedId);
      if (col) {
        targetCollectionId = col.id;
        parentId = col.id;
      } else {
        const folder = findFolderInCollections(tree.collections, currentSelectedId);
        if (folder) {
          targetCollectionId = folder.collectionId;
          targetFolderId = folder.id;
          parentId = folder.id;
        } else {
          const req = findRequestInCollections(tree.collections, currentSelectedId);
          if (req) {
            targetCollectionId = req.collectionId || null;
            targetFolderId = req.folderId || null;
            parentId = req.folderId || req.collectionId || null;
          }
        }
      }
    }

    if (!parentId && tree && tree.collections.length > 0) {
      targetCollectionId = tree.collections[0].id;
      parentId = tree.collections[0].id;
    }

    handleStartCreate(type, parentId, targetCollectionId, targetFolderId);
  };

  // Build Context Menu Items based on targetType
  const getContextMenuItems = (): ContextMenuItem[] => {
    const { targetType, targetItem } = contextMenu;

    if (targetType === 'collection' && targetItem) {
      const col = targetItem as CollectionNodeDto;
      return [
        {
          id: 'col-new-folder',
          label: 'Nova Pasta',
          icon: <Folder className="w-4 h-4 text-amber-400" />,
          onClick: () => handleStartCreate('folder', col.id, col.id, null),
        },
        {
          id: 'col-new-request',
          label: 'Nova Requisição',
          icon: <Plus className="w-4 h-4 text-blue-400" />,
          onClick: () => handleStartCreate('request', col.id, col.id, null),
        },
        {
          id: 'col-rename',
          label: 'Renomear',
          icon: <Pencil className="w-4 h-4 text-zinc-400" />,
          onClick: () => handleStartRename('collection', col.id, col.name),
        },
        { isDivider: true },
        ...(col.openApiSpecUrl || onSyncCollection || onSync
          ? [
              {
                id: 'col-sync',
                label: 'Sincronizar OpenAPI',
                icon: <RefreshCw className="w-4 h-4 text-emerald-400" />,
                onClick: () => {
                  (onSyncCollection ?? onSync)?.(col);
                },
              },
            ]
          : []),
        ...(onOpenCollectionSettings || onOpenSettings
          ? [
              {
                id: 'col-settings',
                label: 'Configurações',
                icon: <Settings className="w-4 h-4 text-zinc-400" />,
                onClick: () => {
                  (onOpenCollectionSettings ?? onOpenSettings)?.(col);
                },
              },
            ]
          : []),
        { isDivider: true },
        {
          id: 'col-delete',
          label: 'Excluir',
          icon: <Trash2 className="w-4 h-4 text-rose-400" />,
          danger: true,
          onClick: () => handleRequestDelete('collection', col),
        },
      ];
    }

    if (targetType === 'folder' && targetItem) {
      const folder = targetItem as FolderNodeDto;
      return [
        {
          id: 'folder-new-folder',
          label: 'Nova Pasta',
          icon: <Folder className="w-4 h-4 text-amber-400" />,
          onClick: () => handleStartCreate('folder', folder.id, folder.collectionId, folder.id),
        },
        {
          id: 'folder-new-request',
          label: 'Nova Requisição',
          icon: <Plus className="w-4 h-4 text-blue-400" />,
          onClick: () => handleStartCreate('request', folder.id, folder.collectionId, folder.id),
        },
        {
          id: 'folder-rename',
          label: 'Renomear',
          icon: <Pencil className="w-4 h-4 text-zinc-400" />,
          onClick: () => handleStartRename('folder', folder.id, folder.name),
        },
        { isDivider: true },
        {
          id: 'folder-delete',
          label: 'Excluir',
          icon: <Trash2 className="w-4 h-4 text-rose-400" />,
          danger: true,
          onClick: () => handleRequestDelete('folder', folder),
        },
      ];
    }

    if (targetType === 'request' && targetItem) {
      const req = targetItem as RequestItemNodeDto;
      return [
        {
          id: 'req-duplicate',
          label: 'Duplicar',
          icon: <Copy className="w-4 h-4 text-blue-400" />,
          onClick: () => onDuplicateRequest?.(req.id),
        },
        {
          id: 'req-rename',
          label: 'Renomear',
          icon: <Pencil className="w-4 h-4 text-zinc-400" />,
          onClick: () => handleStartRename('request', req.id, req.name),
        },
        { isDivider: true },
        {
          id: 'req-delete',
          label: 'Excluir',
          icon: <Trash2 className="w-4 h-4 text-rose-400" />,
          danger: true,
          onClick: () => handleRequestDelete('request', req),
        },
      ];
    }

    // Default: Empty scroll area
    return [
      {
        id: 'empty-new-collection',
        label: 'Nova Coleção',
        icon: <Layers className="w-4 h-4 text-emerald-400" />,
        onClick: () => handleStartCreate('collection', null),
      },
      {
        id: 'empty-import-openapi',
        label: 'Importar OpenAPI',
        icon: <Download className="w-4 h-4 text-purple-400" />,
        onClick: () => onImportOpenApi?.(),
      },
      { isDivider: true },
      {
        id: 'empty-reload',
        label: 'Recarregar Árvore',
        icon: <RefreshCw className="w-4 h-4 text-zinc-400" />,
        onClick: () => onReload?.(),
      },
    ];
  };

  const newMenuItems: ContextMenuItem[] = [
    {
      id: 'create-collection',
      label: 'Nova Coleção',
      icon: <Layers className="w-4 h-4 text-emerald-400" />,
      onClick: () => handleNewOptionClick('collection'),
    },
    {
      id: 'create-folder',
      label: 'Nova Pasta',
      icon: <Folder className="w-4 h-4 text-amber-400" />,
      onClick: () => handleNewOptionClick('folder'),
    },
    {
      id: 'create-request',
      label: 'Nova Requisição',
      icon: <Plus className="w-4 h-4 text-blue-400" />,
      onClick: () => handleNewOptionClick('request'),
    },
    { isDivider: true },
    {
      id: 'import-openapi-top',
      label: 'Importar OpenAPI',
      icon: <Download className="w-4 h-4 text-purple-400" />,
      onClick: () => onImportOpenApi?.(),
    },
  ];

  function renderRequest(req: RequestItemNodeDto, depth: number) {
    const isSelected = selectedId === req.id || activeItem?.id === req.id;
    const isEditing = inlineEditing?.id === req.id;
    const methodUpper = req.method ? req.method.toUpperCase() : 'GET';
    const badgeClass =
      HTTP_METHOD_BADGES[methodUpper] || 'text-neutral-400 bg-neutral-900 border-neutral-700';

    return (
      <div
        key={req.id}
        role="treeitem"
        aria-selected={isSelected}
        onClick={() => handleSelect('request', req.id, req)}
        onContextMenu={(e) => handleContextMenu(e, 'request', req)}
        style={{ paddingLeft: `${depth * 14 + 10}px` }}
        className={`group flex items-center justify-between pr-2 py-1 rounded transition-colors cursor-pointer ${
          isSelected
            ? 'bg-neutral-800 text-white font-medium'
            : 'text-neutral-300 hover:text-white hover:bg-neutral-800/60'
        }`}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span
            className={`px-1.5 py-0.5 text-[10px] font-mono font-semibold rounded border shrink-0 ${badgeClass}`}
          >
            {methodUpper}
          </span>

          {isEditing ? (
            <InlineNodeInput
              initialValue={req.name}
              placeholder="Nome da requisição..."
              aria-label={`Renomear requisição ${req.name}`}
              onCommit={(newName) => handleCommitRename('request', req.id, newName)}
              onCancel={handleCancelRename}
            />
          ) : (
            <span className="truncate text-xs">{req.name}</span>
          )}
        </div>
      </div>
    );
  }

  function renderFolder(folder: FolderNodeDto, depth: number) {
    const isExpanded = !collapsedIds.has(folder.id);
    const isSelected = selectedId === folder.id || activeItem?.id === folder.id;
    const isEditing = inlineEditing?.id === folder.id;

    return (
      <div key={folder.id} className="select-none">
        <div
          role="treeitem"
          aria-expanded={isExpanded}
          aria-selected={isSelected}
          onClick={() => handleSelect('folder', folder.id, folder)}
          onContextMenu={(e) => handleContextMenu(e, 'folder', folder)}
          style={{ paddingLeft: `${depth * 14 + 10}px` }}
          className={`group flex items-center justify-between pr-2 py-1 rounded transition-colors cursor-pointer ${
            isSelected
              ? 'bg-neutral-800 text-white font-medium'
              : 'text-neutral-300 hover:text-white hover:bg-neutral-800/60'
          }`}
        >
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <button
              type="button"
              aria-label={isExpanded ? `Recolher pasta ${folder.name}` : `Expandir pasta ${folder.name}`}
              onClick={(e) => toggleCollapse(folder.id, e)}
              className="p-0.5 text-neutral-400 hover:text-white rounded"
            >
              {isExpanded ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" />
              )}
            </button>

            {isExpanded ? (
              <FolderOpen className="w-4 h-4 text-amber-400/90 shrink-0" />
            ) : (
              <Folder className="w-4 h-4 text-amber-400/90 shrink-0" />
            )}

            {isEditing ? (
              <InlineNodeInput
                initialValue={folder.name}
                placeholder="Nome da pasta..."
                aria-label={`Renomear pasta ${folder.name}`}
                onCommit={(newName) => handleCommitRename('folder', folder.id, newName)}
                onCancel={handleCancelRename}
              />
            ) : (
              <span className="truncate text-xs">{folder.name}</span>
            )}
          </div>
        </div>

        {isExpanded && (
          <div>
            {/* Subfolders */}
            {folder.subFolders.map((sub) => renderFolder(sub, depth + 1))}

            {/* Inline creation of subfolder under this folder */}
            {inlineCreating?.type === 'folder' && inlineCreating.parentId === folder.id && (
              <div
                style={{ paddingLeft: `${(depth + 1) * 14 + 10}px` }}
                className="flex items-center gap-1.5 pr-2 py-1"
              >
                <Folder className="w-4 h-4 text-amber-400/70 shrink-0" />
                <InlineNodeInput
                  initialValue=""
                  placeholder="Nome da pasta..."
                  aria-label="Nova subpasta"
                  onCommit={handleCommitCreate}
                  onCancel={handleCancelCreate}
                />
              </div>
            )}

            {/* Requests */}
            {folder.requests.map((req) => renderRequest(req, depth + 1))}

            {/* Inline creation of request under this folder */}
            {inlineCreating?.type === 'request' && inlineCreating.parentId === folder.id && (
              <div
                style={{ paddingLeft: `${(depth + 1) * 14 + 10}px` }}
                className="flex items-center gap-1.5 pr-2 py-1"
              >
                <span className="px-1.5 py-0.5 text-[10px] font-mono font-semibold rounded border text-blue-400 bg-blue-950/60 border-blue-800/80 shrink-0">
                  REQ
                </span>
                <InlineNodeInput
                  initialValue=""
                  placeholder="Nome da requisição..."
                  aria-label="Nova requisição"
                  onCommit={handleCommitCreate}
                  onCancel={handleCancelCreate}
                />
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  function renderCollection(col: CollectionNodeDto) {
    const isExpanded = !collapsedIds.has(col.id);
    const isSelected = selectedId === col.id || activeItem?.id === col.id;
    const isEditing = inlineEditing?.id === col.id;
    const isSyncing = syncingId === col.id;
    const depth = 0;

    return (
      <div key={col.id} className="select-none">
        <div
          role="treeitem"
          aria-expanded={isExpanded}
          aria-selected={isSelected}
          onClick={() => handleSelect('collection', col.id, col)}
          onContextMenu={(e) => handleContextMenu(e, 'collection', col)}
          style={{ paddingLeft: '8px' }}
          className={`group flex items-center justify-between pr-2 py-1 rounded transition-colors cursor-pointer ${
            isSelected
              ? 'bg-neutral-800 text-white font-medium'
              : 'text-neutral-300 hover:text-white hover:bg-neutral-800/60'
          }`}
        >
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <button
              type="button"
              aria-label={isExpanded ? `Recolher coleção ${col.name}` : `Expandir coleção ${col.name}`}
              onClick={(e) => toggleCollapse(col.id, e)}
              className="p-0.5 text-neutral-400 hover:text-white rounded"
            >
              {isExpanded ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" />
              )}
            </button>

            <Layers className="w-4 h-4 text-blue-400/90 shrink-0" />

            {isEditing ? (
              <InlineNodeInput
                initialValue={col.name}
                placeholder="Nome da coleção..."
                aria-label={`Renomear coleção ${col.name}`}
                onCommit={(newName) => handleCommitRename('collection', col.id, newName)}
                onCancel={handleCancelRename}
              />
            ) : (
              <button
                type="button"
                role="button"
                aria-current={isSelected ? 'page' : undefined}
                onClick={(e) => {
                  e.stopPropagation();
                  handleSelect('collection', col.id, col);
                }}
                className="truncate text-xs font-medium text-left bg-transparent border-none p-0 cursor-pointer text-inherit hover:underline"
              >
                {col.name}
              </button>
            )}
          </div>

          {/* Action icons on hover */}
          {!isEditing && (
            <div className="flex items-center gap-1 opacity-70 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity ml-1 shrink-0">
              {(col.openApiSpecUrl || onSyncCollection || onSync) && (
                <button
                  type="button"
                  title={`Sincronizar coleção ${col.name}`}
                  aria-label={`Sincronizar coleção ${col.name}`}
                  disabled={isSyncing}
                  onClick={(e) => {
                    e.stopPropagation();
                    (onSyncCollection ?? onSync)?.(col);
                  }}
                  className="p-1 rounded text-neutral-400 hover:text-white hover:bg-neutral-700/60 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-blue-400' : ''}`}
                    data-testid={isSyncing ? `nav-sync-spinning-${col.id}` : undefined}
                  />
                </button>
              )}

              {(onOpenCollectionSettings || onOpenSettings) && (
                <button
                  type="button"
                  title={`Configurações da coleção ${col.name}`}
                  aria-label={`Configurações da coleção ${col.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    (onOpenCollectionSettings ?? onOpenSettings)?.(col);
                  }}
                  className="p-1 rounded text-neutral-400 hover:text-white hover:bg-neutral-700/60 transition-colors cursor-pointer"
                >
                  <Settings className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>

        {isExpanded && (
          <div>
            {/* Folders */}
            {col.folders.map((folder) => renderFolder(folder, depth + 1))}

            {/* Inline creation of folder under this collection */}
            {inlineCreating?.type === 'folder' && inlineCreating.parentId === col.id && (
              <div
                style={{ paddingLeft: `${(depth + 1) * 14 + 10}px` }}
                className="flex items-center gap-1.5 pr-2 py-1"
              >
                <Folder className="w-4 h-4 text-amber-400/70 shrink-0" />
                <InlineNodeInput
                  initialValue=""
                  placeholder="Nome da pasta..."
                  aria-label="Nova pasta"
                  onCommit={handleCommitCreate}
                  onCancel={handleCancelCreate}
                />
              </div>
            )}

            {/* Direct Requests */}
            {col.requests.map((req) => renderRequest(req, depth + 1))}

            {/* Inline creation of request under this collection */}
            {inlineCreating?.type === 'request' && inlineCreating.parentId === col.id && (
              <div
                style={{ paddingLeft: `${(depth + 1) * 14 + 10}px` }}
                className="flex items-center gap-1.5 pr-2 py-1"
              >
                <span className="px-1.5 py-0.5 text-[10px] font-mono font-semibold rounded border text-blue-400 bg-blue-950/60 border-blue-800/80 shrink-0">
                  REQ
                </span>
                <InlineNodeInput
                  initialValue=""
                  placeholder="Nome da requisição..."
                  aria-label="Nova requisição"
                  onCommit={handleCommitCreate}
                  onCancel={handleCancelCreate}
                />
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      ref={treeContainerRef}
      data-testid="collection-tree-container"
      className={`flex flex-col h-full overflow-hidden text-sm ${className}`}
    >
      {/* Unified Toolbar */}
      <div className="flex flex-col gap-2 pb-3 mb-2 border-b border-neutral-800 shrink-0">
        <div className="flex items-center justify-between gap-1.5">
          {hasWorkspaces && (
            <WorkspaceSwitcher
              workspaces={workspaces}
              activeWorkspaceId={activeWorkspaceId ?? null}
              onSelectWorkspace={onSelectWorkspace ?? (() => {})}
              onCreateWorkspaceClick={onCreateWorkspaceClick ?? (() => {})}
              onOpenChange={(open) => {
                if (open) {
                  setIsNewMenuOpen(false);
                  setContextMenu((prev) => ({ ...prev, isOpen: false }));
                }
              }}
              className="flex-1 min-w-0"
            />
          )}

          {hasActiveWorkspace && (
            <div className={`flex items-center gap-1.5 shrink-0 ${!hasWorkspaces ? 'w-full justify-between' : ''}`}>
              <button
                type="button"
                aria-label="Novo"
                aria-haspopup="true"
                aria-expanded={isNewMenuOpen}
                onClick={handleNewButtonClick}
                className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md bg-blue-600 hover:bg-blue-500 text-white transition-colors cursor-pointer shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Novo</span>
              </button>

              <button
                type="button"
                title="Recarregar árvore"
                aria-label="Recarregar 🔄"
                disabled={isLoading}
                onClick={() => onReload?.()}
                className="p-1 rounded text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors disabled:opacity-40 cursor-pointer"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-blue-400' : ''}`}
                  aria-hidden="true"
                />
              </button>
            </div>
          )}
        </div>

        {hasActiveWorkspace && (
          <div className="relative">
            <Search
              className="w-3.5 h-3.5 text-neutral-500 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="text"
              value={effectiveFilter}
              onChange={(e) => handleFilterChange(e.target.value)}
              placeholder="Filtrar por nome ou rota..."
              aria-label="Filtrar coleções, pastas e requisições"
              className="w-full bg-neutral-900 border border-neutral-800 rounded px-2 pl-7 py-1 text-xs text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-neutral-700 focus:ring-1 focus:ring-neutral-700 transition-colors"
            />
          </div>
        )}
      </div>

      {/* Scrollable Tree Items or Welcome Card / Loading */}
      {isWorkspacesLoading ? (
        <div
          data-testid="sidebar-workspaces-loading"
          className="flex-1 flex items-center justify-center text-center p-4 text-xs text-neutral-500"
        >
          Carregando workspaces...
        </div>
      ) : hasWorkspaces && workspaces.length === 0 ? (
        <div
          data-testid="sidebar-empty-workspace"
          className="flex-1 flex flex-col items-center justify-center text-center p-4 border border-dashed border-neutral-800 rounded-lg bg-neutral-900/30 my-auto"
        >
          <div className="w-10 h-10 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 mb-3">
            <Briefcase className="w-5 h-5" aria-hidden="true" />
          </div>
          <h3 className="text-xs font-semibold text-neutral-200 mb-1">
            Comece criando seu Workspace
          </h3>
          <p className="text-[11px] text-neutral-400 mb-4 max-w-[200px]">
            Workspaces isolam suas coleções, variáveis e requisições para cada projeto.
          </p>
          <button
            type="button"
            data-testid="create-workspace-empty-state-btn"
            onClick={() => onCreateWorkspaceClick?.()}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors cursor-pointer shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Criar Workspace</span>
          </button>
        </div>
      ) : (
        <div
          role="tree"
          aria-label="Árvore de Coleções"
          className="flex-1 overflow-y-auto space-y-0.5 min-h-[120px] focus:outline-none"
        >
          {displayedTree && displayedTree.collections.length > 0 ? (
            displayedTree.collections.map(renderCollection)
          ) : !inlineCreating ? (
            <div className="py-6 text-center text-xs text-neutral-500">
              {effectiveFilter ? 'Nenhum item encontrado.' : 'Nenhuma coleção disponível.'}
            </div>
          ) : null}

          {inlineCreating?.type === 'collection' && (
            <div style={{ paddingLeft: '8px' }} className="flex items-center gap-1.5 pr-2 py-1">
              <Layers className="w-4 h-4 text-blue-400/70 shrink-0" />
              <InlineNodeInput
                initialValue=""
                placeholder="Nome da coleção..."
                aria-label="Nova coleção"
                onCommit={handleCommitCreate}
                onCancel={handleCancelCreate}
              />
            </div>
          )}

          {/* Empty scroll space to catch right clicks on empty area */}
          <div
            data-testid="collection-tree-empty-area"
            aria-hidden="true"
            onContextMenu={(e) => handleContextMenu(e, 'empty')}
            className="flex-1 min-h-[80px] cursor-default"
          />
        </div>
      )}

      {/* Creation Dropdown from + Novo */}
      <ContextMenu
        isOpen={isNewMenuOpen}
        position={newMenuPos}
        onClose={() => setIsNewMenuOpen(false)}
        items={newMenuItems}
        containerRef={treeContainerRef}
      />

      {/* Right-click Context Menu */}
      <ContextMenu
        isOpen={contextMenu.isOpen}
        position={contextMenu.position}
        onClose={() => setContextMenu((prev) => ({ ...prev, isOpen: false }))}
        items={getContextMenuItems()}
        containerRef={treeContainerRef}
      />

      {/* Non-empty Delete Confirmation Modal */}
      {deleteModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-delete-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDeleteModal(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setDeleteModal(null);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-100"
        >
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg max-w-sm w-full p-4 shadow-2xl shadow-black/80 space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-full bg-rose-500/10 text-rose-400 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 id="confirm-delete-title" className="text-sm font-semibold text-zinc-100">
                  {deleteModal.type === 'collection' ? 'Excluir Coleção' : 'Excluir Pasta'}
                </h3>
                <p className="text-xs text-zinc-400 mt-1">
                  {deleteModal.type === 'collection'
                    ? `A coleção "${deleteModal.name}" não está vazia. Todos os itens contidos nela serão excluídos permanentemente.`
                    : `A pasta "${deleteModal.name}" não está vazia. Todos os itens contidos nela serão excluídos permanentemente.`}
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800/80">
              <button
                type="button"
                onClick={() => setDeleteModal(null)}
                className="px-3 py-1.5 text-xs font-medium rounded text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={async () => {
                  const { type, id } = deleteModal;
                  setDeleteModal(null);
                  if (type === 'collection') {
                    await onDeleteCollection?.(id);
                  } else if (type === 'folder') {
                    await onDeleteFolder?.(id);
                  }
                }}
                className="px-3 py-1.5 text-xs font-medium rounded bg-rose-600 hover:bg-rose-500 text-white transition-colors"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
