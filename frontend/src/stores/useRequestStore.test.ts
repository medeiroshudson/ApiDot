import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  useRequestStore,
  CLEAN_SCRATCHPAD,
  DEFAULT_REQUESTS,
  REQUEST_STORAGE_KEY,
  INITIAL_REQUEST_STATE,
  ActiveRequestDetails,
  SCRATCHPAD_REQ_ID,
  getScratchpadKey,
} from './useRequestStore';
import { RequestData } from '@/components/request/RequestEditor';
import { ResponseData } from '@/components/response/ResponseViewer';
import { DependencyRequest } from '@/lib/variables';
import { saveResponseToStorage } from '@/lib/responseStorage';

// In-memory IndexedDB mock for Vitest / JSDOM environment
function createMockIndexedDB() {
  const dbs = new Map<string, Map<string, any>>();

  const idb = {
    open: (dbName: string, version: number = 1) => {
      const openReq: any = {
        result: null,
        error: null,
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null,
      };

      queueMicrotask(() => {
        let dbStores = dbs.get(dbName);
        let isNew = false;
        if (!dbStores) {
          dbStores = new Map();
          dbs.set(dbName, dbStores);
          isNew = true;
        }

        const db: any = {
          name: dbName,
          version,
          objectStoreNames: {
            contains: (storeName: string) => dbStores!.has(storeName),
          },
          createObjectStore: (storeName: string) => {
            if (!dbStores!.has(storeName)) {
              dbStores!.set(storeName, new Map());
            }
            return {};
          },
          transaction: (storeNames: string | string[], _mode: string) => {
            const primaryStoreName = Array.isArray(storeNames) ? storeNames[0] : storeNames;
            if (!dbStores!.has(primaryStoreName)) {
              dbStores!.set(primaryStoreName, new Map());
            }
            const storeMap = dbStores!.get(primaryStoreName)!;

            const store = {
              put: (value: any, key: string) => {
                const req: any = { onsuccess: null, onerror: null, result: null };
                queueMicrotask(() => {
                  try {
                    storeMap.set(key, structuredClone ? structuredClone(value) : JSON.parse(JSON.stringify(value)));
                    req.result = key;
                    if (req.onsuccess) req.onsuccess({ target: req });
                  } catch (err) {
                    req.error = err;
                    if (req.onerror) req.onerror({ target: req });
                  }
                });
                return req;
              },
              get: (key: string) => {
                const req: any = { onsuccess: null, onerror: null, result: null };
                queueMicrotask(() => {
                  const val = storeMap.get(key);
                  req.result = val !== undefined ? (structuredClone ? structuredClone(val) : JSON.parse(JSON.stringify(val))) : undefined;
                  if (req.onsuccess) req.onsuccess({ target: req });
                });
                return req;
              },
              delete: (key: string) => {
                const req: any = { onsuccess: null, onerror: null, result: null };
                queueMicrotask(() => {
                  storeMap.delete(key);
                  if (req.onsuccess) req.onsuccess({ target: req });
                });
                return req;
              },
              clear: () => {
                const req: any = { onsuccess: null, onerror: null, result: null };
                queueMicrotask(() => {
                  storeMap.clear();
                  if (req.onsuccess) req.onsuccess({ target: req });
                });
                return req;
              },
            };

            const tx: any = {
              objectStore: () => store,
              onerror: null,
              oncomplete: null,
            };
            return tx;
          },
          close: () => {},
        };

        openReq.result = db;
        if (isNew && openReq.onupgradeneeded) {
          openReq.onupgradeneeded({ target: openReq });
        }
        if (openReq.onsuccess) {
          openReq.onsuccess({ target: openReq });
        }
      });

      return openReq;
    },
    deleteDatabase: (dbName: string) => {
      dbs.delete(dbName);
      const req: any = { onsuccess: null, onerror: null };
      queueMicrotask(() => {
        if (req.onsuccess) req.onsuccess({ target: req });
      });
      return req;
    },
  };

  return { idb, dbs };
}

describe('useRequestStore', () => {
  const sampleRequestDetails: ActiveRequestDetails = {
    id: 'req-users-list',
    name: 'Listar Usuários',
    method: 'GET',
    url: 'https://api.example.com/v1/users',
    target: 'Server',
    headers: 'Authorization: Bearer token-123\nAccept: application/json',
    body: '',
    auth: {
      type: 'bearer',
      token: 'token-123',
    },
    collectionId: 'col-main',
    folderId: 'fld-users',
    schemaDefinition: '{"type":"object"}',
  };

  const sampleEditorData: RequestData = {
    method: 'POST',
    url: 'https://api.example.com/v1/users',
    target: 'Agent',
    headers: 'Content-Type: application/json',
    body: JSON.stringify({ name: 'Alice', email: 'alice@example.com' }),
    auth: { type: 'bearer', token: 'jwt-xyz' },
  };

  const sampleResponse: ResponseData = {
    statusCode: 201,
    statusText: 'Created',
    durationMs: 142,
    sizeBytes: 1024,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: 101, name: 'Alice' }),
    timing: {
      dnsLookupMs: 10,
      tcpHandshakeMs: 15,
      tlsHandshakeMs: 25,
      timeToFirstByteMs: 50,
      contentDownloadMs: 42,
      totalDurationMs: 142,
    },
  };

  beforeEach(() => {
    const mockEnv = createMockIndexedDB();
    (globalThis as any).indexedDB = mockEnv.idb;
    if (typeof window !== 'undefined') {
      (window as any).indexedDB = mockEnv.idb;
    }
    // Reset Zustand store state before each test
    useRequestStore.getState().reset();
    localStorage.clear();
  });

  afterEach(() => {
    delete (globalThis as any).indexedDB;
    if (typeof window !== 'undefined') {
      delete (window as any).indexedDB;
    }
  });

  describe('1. Constants & Initial State', () => {
    it('should export CLEAN_SCRATCHPAD with expected default values', () => {
      expect(CLEAN_SCRATCHPAD).toEqual({
        method: 'GET',
        url: '',
        target: 'Inherit',
        headers: '',
        body: '',
        auth: { type: 'none' },
      });
    });

    it('should export DEFAULT_REQUESTS with mock authentication request', () => {
      expect(DEFAULT_REQUESTS).toHaveLength(1);
      expect(DEFAULT_REQUESTS[0]).toEqual({
        id: 'req-auth',
        name: 'Autenticação Login',
        method: 'POST',
        url: 'https://api.example.com/auth/login',
        response: {
          statusCode: 200,
          headers: { 'content-type': 'application/json' },
          body: {
            token: 'mock-jwt-token-xyz',
            user: { id: 42, role: 'admin' },
          },
        },
      });
    });

    it('should export REQUEST_STORAGE_KEY as apidot_request_storage', () => {
      expect(REQUEST_STORAGE_KEY).toBe('apidot_request_storage');
    });

    it('should export INITIAL_REQUEST_STATE with default attributes', () => {
      expect(INITIAL_REQUEST_STATE).toEqual({
        activeRequestId: null,
        activeRequestDetails: null,
        currentEditorData: null,
        pendingSaveData: null,
        isSavingRequest: false,
        isLoading: false,
        isAgentOnline: false,
        response: null,
        responsesByRequestId: {},
        requestHistory: DEFAULT_REQUESTS,
      });
    });

    it('should initialize store with null active request, empty editor data and default history', () => {
      const state = useRequestStore.getState();
      expect(state.activeRequestId).toBeNull();
      expect(state.activeRequestDetails).toBeNull();
      expect(state.currentEditorData).toBeNull();
      expect(state.pendingSaveData).toBeNull();
      expect(state.isSavingRequest).toBe(false);
      expect(state.isLoading).toBe(false);
      expect(state.isAgentOnline).toBe(false);
      expect(state.response).toBeNull();
      expect(state.responsesByRequestId).toEqual({});
      expect(state.requestHistory).toEqual(DEFAULT_REQUESTS);
    });
  });

  describe('2. Active Request Management', () => {
    it('should set activeRequestId and activeRequestDetails', () => {
      useRequestStore.getState().setActiveRequest('req-users-list', sampleRequestDetails);

      const state = useRequestStore.getState();
      expect(state.activeRequestId).toBe('req-users-list');
      expect(state.activeRequestDetails).toEqual(sampleRequestDetails);
    });

    it('should allow clearing active request by passing null', () => {
      useRequestStore.getState().setActiveRequest('req-users-list', sampleRequestDetails);
      useRequestStore.getState().setActiveRequest(null, null);

      const state = useRequestStore.getState();
      expect(state.activeRequestId).toBeNull();
      expect(state.activeRequestDetails).toBeNull();
    });

    it('should update active request name via setActiveRequestName when details exist', () => {
      useRequestStore.getState().setActiveRequest('req-users-list', sampleRequestDetails);
      useRequestStore.getState().setActiveRequestName('Listar Todos Usuários (V2)');

      const state = useRequestStore.getState();
      expect(state.activeRequestDetails?.name).toBe('Listar Todos Usuários (V2)');
      expect(state.activeRequestDetails?.id).toBe(sampleRequestDetails.id);
      expect(state.activeRequestDetails?.url).toBe(sampleRequestDetails.url);
    });

    it('should do nothing in setActiveRequestName when activeRequestDetails is null', () => {
      useRequestStore.getState().setActiveRequest(null, null);
      useRequestStore.getState().setActiveRequestName('Ignorado');

      const state = useRequestStore.getState();
      expect(state.activeRequestDetails).toBeNull();
    });
  });

  describe('3. Current Editor & Pending Save Data', () => {
    it('should set and clear currentEditorData', () => {
      useRequestStore.getState().setCurrentEditorData(sampleEditorData);
      expect(useRequestStore.getState().currentEditorData).toEqual(sampleEditorData);

      useRequestStore.getState().setCurrentEditorData(null);
      expect(useRequestStore.getState().currentEditorData).toBeNull();
    });

    it('should set and clear pendingSaveData', () => {
      useRequestStore.getState().setPendingSaveData(sampleEditorData);
      expect(useRequestStore.getState().pendingSaveData).toEqual(sampleEditorData);

      useRequestStore.getState().setPendingSaveData(null);
      expect(useRequestStore.getState().pendingSaveData).toBeNull();
    });

    it('should toggle isSavingRequest flag', () => {
      expect(useRequestStore.getState().isSavingRequest).toBe(false);

      useRequestStore.getState().setIsSavingRequest(true);
      expect(useRequestStore.getState().isSavingRequest).toBe(true);

      useRequestStore.getState().setIsSavingRequest(false);
      expect(useRequestStore.getState().isSavingRequest).toBe(false);
    });
  });

  describe('4. Execution State & Response', () => {
    it('should toggle isLoading flag', () => {
      expect(useRequestStore.getState().isLoading).toBe(false);

      useRequestStore.getState().setIsLoading(true);
      expect(useRequestStore.getState().isLoading).toBe(true);

      useRequestStore.getState().setIsLoading(false);
      expect(useRequestStore.getState().isLoading).toBe(false);
    });

    it('should toggle isAgentOnline flag', () => {
      expect(useRequestStore.getState().isAgentOnline).toBe(false);

      useRequestStore.getState().setIsAgentOnline(true);
      expect(useRequestStore.getState().isAgentOnline).toBe(true);

      useRequestStore.getState().setIsAgentOnline(false);
      expect(useRequestStore.getState().isAgentOnline).toBe(false);
    });

    it('should set and clear HTTP execution response', () => {
      expect(useRequestStore.getState().response).toBeNull();

      useRequestStore.getState().setResponse(sampleResponse);
      expect(useRequestStore.getState().response).toEqual(sampleResponse);

      useRequestStore.getState().setResponse(null);
      expect(useRequestStore.getState().response).toBeNull();
    });
  });

  describe('5. Request History Management & Deduplication', () => {
    it('should prepend new requests to history', () => {
      const newReq: DependencyRequest = {
        id: 'req-orders',
        name: 'Listar Pedidos',
        method: 'GET',
        url: 'https://api.example.com/orders',
        response: { statusCode: 200, body: [{ id: 1 }] },
      };

      useRequestStore.getState().addRequestHistory(newReq);

      const history = useRequestStore.getState().requestHistory;
      expect(history).toHaveLength(2);
      expect(history[0]).toEqual(newReq);
      expect(history[1].id).toBe('req-auth');
    });

    it('should deduplicate existing requests with the same id and move updated one to front', () => {
      const updatedAuthReq: DependencyRequest = {
        id: 'req-auth',
        name: 'Autenticação Login (Atualizado)',
        method: 'POST',
        url: 'https://api.example.com/auth/login-v2',
        response: { statusCode: 200, body: { token: 'new-token' } },
      };

      useRequestStore.getState().addRequestHistory(updatedAuthReq);

      const history = useRequestStore.getState().requestHistory;
      expect(history).toHaveLength(1);
      expect(history[0]).toEqual(updatedAuthReq);
      expect(history[0].name).toBe('Autenticação Login (Atualizado)');
    });

    it('should handle multiple requests maintaining recent-first order', () => {
      const req1: DependencyRequest = { id: 'req-1', name: 'Req 1', method: 'GET' };
      const req2: DependencyRequest = { id: 'req-2', name: 'Req 2', method: 'POST' };
      const req3: DependencyRequest = { id: 'req-3', name: 'Req 3', method: 'DELETE' };

      useRequestStore.getState().addRequestHistory(req1);
      useRequestStore.getState().addRequestHistory(req2);
      useRequestStore.getState().addRequestHistory(req3);

      const history = useRequestStore.getState().requestHistory;
      expect(history.map((r) => r.id)).toEqual(['req-3', 'req-2', 'req-1', 'req-auth']);
    });
  });

  describe('6. Scratchpad Reset (`resetScratchpad`)', () => {
    it('should reset activeRequest, editorData to CLEAN_SCRATCHPAD, and clear response', () => {
      useRequestStore.getState().setActiveRequest('req-1', sampleRequestDetails);
      useRequestStore.getState().setCurrentEditorData(sampleEditorData);
      useRequestStore.getState().setResponse(sampleResponse);

      useRequestStore.getState().resetScratchpad();

      const state = useRequestStore.getState();
      expect(state.activeRequestId).toBeNull();
      expect(state.activeRequestDetails).toBeNull();
      expect(state.currentEditorData).toEqual(CLEAN_SCRATCHPAD);
      expect(state.response).toBeNull();
    });

    it('should not clear requestHistory or isAgentOnline on resetScratchpad', () => {
      useRequestStore.getState().setIsAgentOnline(true);
      const initialHistoryLength = useRequestStore.getState().requestHistory.length;

      useRequestStore.getState().resetScratchpad();

      const state = useRequestStore.getState();
      expect(state.isAgentOnline).toBe(true);
      expect(state.requestHistory).toHaveLength(initialHistoryLength);
    });
  });

  describe('7. Initial Editor Request Calculation (`getInitialEditorRequest`)', () => {
    it('should return CLEAN_SCRATCHPAD when activeRequestDetails is null', () => {
      useRequestStore.getState().setActiveRequest(null, null);
      const result = useRequestStore.getState().getInitialEditorRequest();
      expect(result).toEqual(CLEAN_SCRATCHPAD);
    });

    it('should construct initial editor request payload from activeRequestDetails', () => {
      useRequestStore.getState().setActiveRequest(sampleRequestDetails.id, sampleRequestDetails);

      const result = useRequestStore.getState().getInitialEditorRequest();
      expect(result).toEqual({
        id: sampleRequestDetails.id,
        method: sampleRequestDetails.method,
        url: sampleRequestDetails.url,
        target: sampleRequestDetails.target,
        headers: sampleRequestDetails.headers,
        body: sampleRequestDetails.body,
        auth: sampleRequestDetails.auth,
        schemaDefinition: sampleRequestDetails.schemaDefinition,
      });
    });

    it('should map falsy or null schemaDefinition to undefined in initial editor request', () => {
      const detailsWithoutSchema: ActiveRequestDetails = {
        ...sampleRequestDetails,
        schemaDefinition: null,
      };
      useRequestStore.getState().setActiveRequest(detailsWithoutSchema.id, detailsWithoutSchema);

      const result = useRequestStore.getState().getInitialEditorRequest();
      expect(result.schemaDefinition).toBeUndefined();
    });
  });

  describe('8. Full Store Reset (`reset`)', () => {
    it('should restore all state fields to clean initial defaults', () => {
      useRequestStore.getState().setActiveRequest('req-1', sampleRequestDetails);
      useRequestStore.getState().setCurrentEditorData(sampleEditorData);
      useRequestStore.getState().setPendingSaveData(sampleEditorData);
      useRequestStore.getState().setIsSavingRequest(true);
      useRequestStore.getState().setIsLoading(true);
      useRequestStore.getState().setIsAgentOnline(true);
      useRequestStore.getState().setResponse(sampleResponse);
      useRequestStore.getState().addRequestHistory({ id: 'custom-req', name: 'Custom', method: 'GET' });

      useRequestStore.getState().reset();

      const state = useRequestStore.getState();
      expect(state.activeRequestId).toBeNull();
      expect(state.activeRequestDetails).toBeNull();
      expect(state.currentEditorData).toBeNull();
      expect(state.pendingSaveData).toBeNull();
      expect(state.isSavingRequest).toBe(false);
      expect(state.isLoading).toBe(false);
      expect(state.isAgentOnline).toBe(false);
      expect(state.response).toBeNull();
      expect(state.responsesByRequestId).toEqual({});
      expect(state.requestHistory).toEqual(DEFAULT_REQUESTS);
    });
  });

  describe('9. Memory Isolation & Storage Partialize (Anti-Goal 2.3)', () => {
    it('should persist only currentEditorData to localStorage and exclude response & history', () => {
      useRequestStore.getState().setActiveRequest('req-1', sampleRequestDetails);
      useRequestStore.getState().setCurrentEditorData(sampleEditorData);
      useRequestStore.getState().setPendingSaveData(sampleEditorData);
      useRequestStore.getState().setIsSavingRequest(true);
      useRequestStore.getState().setIsLoading(true);
      useRequestStore.getState().setIsAgentOnline(true);
      useRequestStore.getState().setResponse(sampleResponse);
      useRequestStore.getState().addRequestHistory({
        id: 'heavy-req',
        name: 'Heavy Request',
        method: 'POST',
        response: { statusCode: 200, body: 'huge-binary-or-json-content' },
      });

      const raw = localStorage.getItem(REQUEST_STORAGE_KEY);
      expect(raw).toBeTruthy();
      const parsed = JSON.parse(raw!);

      // Only currentEditorData should be preserved in localStorage
      expect(parsed.state).toEqual({
        currentEditorData: sampleEditorData,
      });

      // Transient / volatile memory fields must be undefined in storage to prevent QuotaExceededError
      expect(parsed.state.response).toBeUndefined();
      expect(parsed.state.responsesByRequestId).toBeUndefined();
      expect(parsed.state.requestHistory).toBeUndefined();
      expect(parsed.state.activeRequestId).toBeUndefined();
      expect(parsed.state.activeRequestDetails).toBeUndefined();
      expect(parsed.state.pendingSaveData).toBeUndefined();
      expect(parsed.state.isSavingRequest).toBeUndefined();
      expect(parsed.state.isLoading).toBeUndefined();
      expect(parsed.state.isAgentOnline).toBeUndefined();
    });

    it('should handle null currentEditorData in persisted storage', () => {
      useRequestStore.getState().setCurrentEditorData(null);

      const raw = localStorage.getItem(REQUEST_STORAGE_KEY);
      expect(raw).toBeTruthy();
      const parsed = JSON.parse(raw!);

      expect(parsed.state).toEqual({
        currentEditorData: null,
      });
      expect(parsed.state.response).toBeUndefined();
      expect(parsed.state.responsesByRequestId).toBeUndefined();
      expect(parsed.state.requestHistory).toBeUndefined();
    });
  });

  describe('10. Scratchpad Keys & Workspace Isolation', () => {
    it('should export SCRATCHPAD_REQ_ID as __scratchpad__', () => {
      expect(SCRATCHPAD_REQ_ID).toBe('__scratchpad__');
    });

    it('should return __scratchpad__ when workspaceId is not provided or empty', () => {
      expect(getScratchpadKey()).toBe('__scratchpad__');
      expect(getScratchpadKey(null)).toBe('__scratchpad__');
      expect(getScratchpadKey(undefined)).toBe('__scratchpad__');
      expect(getScratchpadKey('')).toBe('__scratchpad__');
      expect(getScratchpadKey('   ')).toBe('__scratchpad__');
    });

    it('should return __scratchpad__:<workspaceId> when workspaceId is provided', () => {
      expect(getScratchpadKey('ws-123')).toBe('__scratchpad__:ws-123');
      expect(getScratchpadKey('workspace-prod')).toBe('__scratchpad__:workspace-prod');
    });
  });

  describe('11. Multi-Request Response Isolation (responsesByRequestId)', () => {
    it('should isolate responses by requestId without overwriting or leaking across requests', () => {
      const responseA: ResponseData = { statusCode: 200, body: { data: 'A' } };
      const responseB: ResponseData = { statusCode: 201, body: { data: 'B' } };

      // Set active request A and assign response
      useRequestStore.getState().setActiveRequest('req-a', { ...sampleRequestDetails, id: 'req-a' });
      useRequestStore.getState().setResponse(responseA);

      expect(useRequestStore.getState().response).toEqual(responseA);
      expect(useRequestStore.getState().responsesByRequestId['req-a']).toEqual(responseA);

      // Switch to active request B (no response yet)
      useRequestStore.getState().setActiveRequest('req-b', { ...sampleRequestDetails, id: 'req-b' });
      expect(useRequestStore.getState().response).toBeNull();

      // Assign response to request B
      useRequestStore.getState().setResponse(responseB);
      expect(useRequestStore.getState().response).toEqual(responseB);
      expect(useRequestStore.getState().responsesByRequestId['req-b']).toEqual(responseB);
      // Verify request A response was NOT altered
      expect(useRequestStore.getState().responsesByRequestId['req-a']).toEqual(responseA);

      // Switch back to request A and verify response A is restored
      useRequestStore.getState().setActiveRequest('req-a', { ...sampleRequestDetails, id: 'req-a' });
      expect(useRequestStore.getState().response).toEqual(responseA);
    });

    it('should isolate scratchpad responses per workspaceId', () => {
      const scratchResponse1: ResponseData = { statusCode: 200, body: 'Scratchpad WS 1' };
      const scratchResponse2: ResponseData = { statusCode: 200, body: 'Scratchpad WS 2' };

      // Active scratchpad on workspace 1
      useRequestStore.getState().setActiveRequest(null, null, 'ws-1');
      useRequestStore.getState().setResponse(scratchResponse1, null, 'ws-1');

      expect(useRequestStore.getState().getResponseForActiveRequest('ws-1')).toEqual(scratchResponse1);
      expect(useRequestStore.getState().responsesByRequestId['__scratchpad__:ws-1']).toEqual(scratchResponse1);

      // Switch to workspace 2 scratchpad
      useRequestStore.getState().setActiveRequest(null, null, 'ws-2');
      expect(useRequestStore.getState().getResponseForActiveRequest('ws-2')).toBeNull();

      useRequestStore.getState().setResponse(scratchResponse2, null, 'ws-2');
      expect(useRequestStore.getState().getResponseForActiveRequest('ws-2')).toEqual(scratchResponse2);
      expect(useRequestStore.getState().responsesByRequestId['__scratchpad__:ws-2']).toEqual(scratchResponse2);

      // Workspace 1 scratchpad remains isolated
      expect(useRequestStore.getState().responsesByRequestId['__scratchpad__:ws-1']).toEqual(scratchResponse1);
    });

    it('should return active response via getResponseForActiveRequest for both request and scratchpad', () => {
      // For a specific request
      useRequestStore.getState().setActiveRequest('req-active', { ...sampleRequestDetails, id: 'req-active' });
      useRequestStore.getState().setResponse(sampleResponse);
      expect(useRequestStore.getState().getResponseForActiveRequest()).toEqual(sampleResponse);

      // For a scratchpad without workspace
      useRequestStore.getState().setActiveRequest(null, null);
      expect(useRequestStore.getState().getResponseForActiveRequest()).toBeNull();
      useRequestStore.getState().setResponse(sampleResponse);
      expect(useRequestStore.getState().getResponseForActiveRequest()).toEqual(sampleResponse);
      expect(useRequestStore.getState().responsesByRequestId[SCRATCHPAD_REQ_ID]).toEqual(sampleResponse);
    });
  });

  describe('12. Direct Request Response Management (setResponseForRequest, clearResponseForRequest, loadResponseForRequest)', () => {
    it('should set and clear response for a specific request via setResponseForRequest and clearResponseForRequest', () => {
      useRequestStore.getState().setResponseForRequest('req-target', sampleResponse);
      expect(useRequestStore.getState().responsesByRequestId['req-target']).toEqual(sampleResponse);

      useRequestStore.getState().clearResponseForRequest('req-target');
      expect(useRequestStore.getState().responsesByRequestId['req-target']).toBeUndefined();
    });

    it('should update active response when setResponseForRequest targets currently active request', () => {
      useRequestStore.getState().setActiveRequest('req-target', { ...sampleRequestDetails, id: 'req-target' });
      expect(useRequestStore.getState().response).toBeNull();

      useRequestStore.getState().setResponseForRequest('req-target', sampleResponse);
      expect(useRequestStore.getState().response).toEqual(sampleResponse);

      useRequestStore.getState().clearResponseForRequest('req-target');
      expect(useRequestStore.getState().response).toBeNull();
    });

    it('should not clobber active response when setResponse is called for a different background targetRequestId', () => {
      const activeResp: ResponseData = { statusCode: 200, body: 'Active' };
      const bgResp: ResponseData = { statusCode: 202, body: 'Background' };

      useRequestStore.getState().setActiveRequest('req-active', { ...sampleRequestDetails, id: 'req-active' });
      useRequestStore.getState().setResponse(activeResp);
      expect(useRequestStore.getState().response).toEqual(activeResp);

      // Background request completes
      useRequestStore.getState().setResponse(bgResp, 'req-bg');
      // Active response must remain activeResp
      expect(useRequestStore.getState().response).toEqual(activeResp);
      // Background response must be stored in map
      expect(useRequestStore.getState().responsesByRequestId['req-bg']).toEqual(bgResp);
    });

    it('should load response from storage via loadResponseForRequest and hydrate memory and active response', async () => {
      const persistedResponse: ResponseData = { statusCode: 200, body: 'From IndexedDB' };
      await saveResponseToStorage('req-persisted', persistedResponse);

      // Set active request to req-persisted (in-memory response initially null)
      useRequestStore.getState().setActiveRequest('req-persisted', { ...sampleRequestDetails, id: 'req-persisted' });
      expect(useRequestStore.getState().responsesByRequestId['req-persisted']).toBeUndefined();

      const loaded = await useRequestStore.getState().loadResponseForRequest('req-persisted');
      expect(loaded).toEqual(persistedResponse);
      expect(useRequestStore.getState().responsesByRequestId['req-persisted']).toEqual(persistedResponse);
      expect(useRequestStore.getState().response).toEqual(persistedResponse);
    });

    it('should return null from loadResponseForRequest when key is not in storage or memory', async () => {
      const loaded = await useRequestStore.getState().loadResponseForRequest('req-unknown');
      expect(loaded).toBeNull();
    });
  });

  describe('13. Workspace-Isolated Scratchpad Reset (resetScratchpad)', () => {
    it('should reset only the workspace-specific scratchpad and keep other request responses intact', () => {
      const reqResp: ResponseData = { statusCode: 200, body: 'Req' };
      const scratchResp: ResponseData = { statusCode: 200, body: 'Scratch' };

      useRequestStore.getState().setResponseForRequest('req-kept', reqResp);
      useRequestStore.getState().setActiveRequest(null, null, 'ws-target');
      useRequestStore.getState().setResponse(scratchResp, null, 'ws-target');

      expect(useRequestStore.getState().responsesByRequestId['req-kept']).toEqual(reqResp);
      expect(useRequestStore.getState().responsesByRequestId['__scratchpad__:ws-target']).toEqual(scratchResp);

      useRequestStore.getState().resetScratchpad('ws-target');

      const state = useRequestStore.getState();
      expect(state.activeRequestId).toBeNull();
      expect(state.activeRequestDetails).toBeNull();
      expect(state.currentEditorData).toEqual(CLEAN_SCRATCHPAD);
      expect(state.response).toBeNull();
      expect(state.responsesByRequestId['__scratchpad__:ws-target']).toBeUndefined();
      // Other request responses remain intact!
      expect(state.responsesByRequestId['req-kept']).toEqual(reqResp);
    });
  });
});
