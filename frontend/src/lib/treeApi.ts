export type ExecutionTarget = 'Inherit' | 'Server' | 'Agent';
export type HttpBodyType = 'None' | 'Json' | 'FormData' | 'Multipart' | 'RawText';

export interface RequestItemNodeDto {
  id: string;
  name: string;
  method: string;
  url: string;
  target: ExecutionTarget;
  bodyType: HttpBodyType;
  headersJson: string;
  bodyContent?: string | null;
  collectionId?: string | null;
  folderId?: string | null;
  schemaDefinition?: string | null;
}

export interface FolderNodeDto {
  id: string;
  name: string;
  collectionId: string;
  parentFolderId?: string | null;
  defaultTarget: ExecutionTarget;
  subFolders: FolderNodeDto[];
  requests: RequestItemNodeDto[];
}

export interface CollectionNodeDto {
  id: string;
  name: string;
  defaultTarget: ExecutionTarget;
  openApiSpecUrl?: string | null;
  folders: FolderNodeDto[];
  requests: RequestItemNodeDto[];
}

export interface WorkspaceTreeDto {
  workspaceId: string;
  workspaceName: string;
  collections: CollectionNodeDto[];
}

export interface WorkspaceDto {
  id: string;
  name: string;
  createdAtUtc: string;
}

export async function fetchWorkspacesApi(): Promise<WorkspaceDto[]> {
  const res = await fetch('/api/workspaces');
  if (!res.ok) {
    throw new Error('Falha ao listar workspaces');
  }
  return res.json();
}

export async function createWorkspaceApi(name: string): Promise<WorkspaceDto> {
  const res = await fetch('/api/workspaces', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    throw new Error('Falha ao criar workspace');
  }
  return res.json();
}

export interface CreateCollectionRequest {
  name: string;
  workspaceId: string;
  defaultTarget?: ExecutionTarget;
}

export interface UpdateCollectionRequest {
  name: string;
  defaultTarget?: ExecutionTarget;
}

export interface CreateFolderRequest {
  name: string;
  workspaceId: string;
  collectionId: string;
  parentFolderId?: string | null;
  defaultTarget?: ExecutionTarget;
}

export interface UpdateFolderRequest {
  name: string;
  parentFolderId?: string | null;
  defaultTarget?: ExecutionTarget;
}

export interface CreateRequestItemRequest {
  name: string;
  method: string;
  url: string;
  workspaceId: string;
  collectionId?: string | null;
  folderId?: string | null;
  target?: ExecutionTarget;
  headersJson?: string;
  bodyType?: HttpBodyType;
  bodyContent?: string | null;
  schemaDefinition?: string | null;
}

export interface UpdateRequestItemRequest {
  name: string;
  method: string;
  url: string;
  target: ExecutionTarget;
  headersJson: string;
  bodyType: HttpBodyType;
  bodyContent?: string | null;
  collectionId?: string | null;
  folderId?: string | null;
  schemaDefinition?: string | null;
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = `Request failed with status ${res.status}`;
    try {
      const data = await res.json();
      if (data && typeof data === 'object') {
        message = data.detail || data.title || data.message || message;
      }
    } catch {
      try {
        const text = await res.text();
        if (text) {
          message = text;
        }
      } catch {
        // use fallback message
      }
    }
    throw new Error(message);
  }

  if (res.status === 204) {
    return undefined as unknown as T;
  }

  return (await res.json()) as T;
}

export async function fetchWorkspaceTree(workspaceId: string): Promise<WorkspaceTreeDto> {
  const res = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/tree`);
  return handleResponse<WorkspaceTreeDto>(res);
}

export async function createCollectionApi(data: CreateCollectionRequest): Promise<CollectionNodeDto> {
  const res = await fetch('/api/collections', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return handleResponse<CollectionNodeDto>(res);
}

export async function updateCollectionApi(id: string, data: UpdateCollectionRequest): Promise<CollectionNodeDto> {
  const res = await fetch(`/api/collections/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return handleResponse<CollectionNodeDto>(res);
}

export async function deleteCollectionApi(id: string): Promise<void> {
  const res = await fetch(`/api/collections/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  return handleResponse<void>(res);
}

export async function createFolderApi(data: CreateFolderRequest): Promise<FolderNodeDto> {
  const res = await fetch('/api/folders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return handleResponse<FolderNodeDto>(res);
}

export async function updateFolderApi(id: string, data: UpdateFolderRequest): Promise<FolderNodeDto> {
  const res = await fetch(`/api/folders/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return handleResponse<FolderNodeDto>(res);
}

export async function deleteFolderApi(id: string): Promise<void> {
  const res = await fetch(`/api/folders/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  return handleResponse<void>(res);
}

export async function createRequestApi(data: CreateRequestItemRequest): Promise<RequestItemNodeDto> {
  const res = await fetch('/api/requests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return handleResponse<RequestItemNodeDto>(res);
}

export async function updateRequestApi(id: string, data: UpdateRequestItemRequest): Promise<RequestItemNodeDto> {
  const res = await fetch(`/api/requests/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return handleResponse<RequestItemNodeDto>(res);
}

export async function duplicateRequestApi(id: string): Promise<RequestItemNodeDto> {
  const res = await fetch(`/api/requests/${encodeURIComponent(id)}/duplicate`, {
    method: 'POST',
  });
  return handleResponse<RequestItemNodeDto>(res);
}

export async function deleteRequestApi(id: string): Promise<void> {
  const res = await fetch(`/api/requests/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  return handleResponse<void>(res);
}

export interface ImportOpenApiCollectionRequest {
  workspaceId: string;
  name?: string;
  specUrl?: string;
  specContent?: string;
}

export async function importOpenApiCollection(
  data: ImportOpenApiCollectionRequest
): Promise<CollectionNodeDto> {
  const res = await fetch('/api/collections/import-openapi', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return handleResponse<CollectionNodeDto>(res);
}

