import { describe, it, expect, beforeEach } from 'vitest';
import {
  useRequestStore,
  CLEAN_SCRATCHPAD,
  DEFAULT_REQUESTS,
  REQUEST_STORAGE_KEY,
  INITIAL_REQUEST_STATE,
  ActiveRequestDetails,
} from './useRequestStore';
import { RequestData } from '@/components/request/RequestEditor';
import { ResponseData } from '@/components/response/ResponseViewer';
import { DependencyRequest } from '@/lib/variables';

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
    // Reset Zustand store state before each test
    useRequestStore.getState().reset();
    localStorage.clear();
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
      expect(parsed.state.requestHistory).toBeUndefined();
    });
  });
});
