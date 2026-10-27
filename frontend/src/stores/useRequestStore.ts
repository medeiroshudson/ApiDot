import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import { RequestData } from '@/components/request/RequestEditor';
import { ResponseData } from '@/components/response/ResponseViewer';
import { DependencyRequest } from '@/lib/variables';
import { ExecutionTarget } from '@/lib/treeApi';
import {
  saveResponseToStorage,
  getResponseFromStorage,
  deleteResponseFromStorage,
  clearAllResponsesFromStorage,
} from '@/lib/responseStorage';

export interface ActiveRequestDetails {
  id: string;
  name: string;
  method: string;
  url: string;
  target: ExecutionTarget;
  headers: string;
  body: string;
  auth: RequestData['auth'];
  collectionId?: string | null;
  folderId?: string | null;
  schemaDefinition?: string | null;
}

export const MAX_HISTORY_ITEMS = 50;
export const SCRATCHPAD_REQ_ID = '__scratchpad__';

export function getScratchpadKey(workspaceId?: string | null): string {
  if (workspaceId && workspaceId.trim()) {
    return `${SCRATCHPAD_REQ_ID}:${workspaceId.trim()}`;
  }
  return SCRATCHPAD_REQ_ID;
}

function createCleanScratchpad(): RequestData {
  return {
    method: 'GET',
    url: '',
    target: 'Inherit',
    headers: '',
    body: '',
    auth: { type: 'none' },
  };
}

export const CLEAN_SCRATCHPAD: RequestData = Object.freeze(createCleanScratchpad());

export const DEFAULT_REQUESTS: DependencyRequest[] = [
  {
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
  },
];

export const REQUEST_STORAGE_KEY = 'apidot_request_storage';

export const INITIAL_REQUEST_STATE = {
  activeRequestId: null as string | null,
  activeRequestDetails: null as ActiveRequestDetails | null,
  currentEditorData: null as RequestData | null,
  pendingSaveData: null as RequestData | null,
  isSavingRequest: false,
  isLoading: false,
  isAgentOnline: false,
  response: null as ResponseData | null,
  responsesByRequestId: {} as Record<string, ResponseData>,
  requestHistory: DEFAULT_REQUESTS,
};

export interface RequestState {
  activeRequestId: string | null;
  activeRequestDetails: ActiveRequestDetails | null;
  currentEditorData: RequestData | null;
  pendingSaveData: RequestData | null;
  isSavingRequest: boolean;
  isLoading: boolean;
  isAgentOnline: boolean;
  response: ResponseData | null;
  responsesByRequestId: Record<string, ResponseData>;
  requestHistory: DependencyRequest[];

  setActiveRequest: (id: string | null, details: ActiveRequestDetails | null, workspaceId?: string | null) => void;
  setActiveRequestName: (name: string) => void;
  setCurrentEditorData: (data: RequestData | null) => void;
  setPendingSaveData: (data: RequestData | null) => void;
  setIsSavingRequest: (isSaving: boolean) => void;
  setIsLoading: (isLoading: boolean) => void;
  setIsAgentOnline: (isOnline: boolean) => void;
  setResponse: (response: ResponseData | null, targetRequestId?: string | null, workspaceId?: string | null) => void;
  setResponseForRequest: (requestId: string, response: ResponseData | null) => void;
  loadResponseForRequest: (requestId: string) => Promise<ResponseData | null>;
  getResponseForActiveRequest: (workspaceId?: string | null) => ResponseData | null;
  clearResponseForRequest: (requestId: string) => void;
  addRequestHistory: (request: DependencyRequest) => void;
  resetScratchpad: (workspaceId?: string | null) => void;
  reset: () => void;
  getInitialEditorRequest: () => Partial<RequestData> & { id?: string };
}

const dummyStorage: StateStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

function cloneDefaultRequests(): DependencyRequest[] {
  return DEFAULT_REQUESTS.map((r) => ({
    ...r,
    response: r.response
      ? {
          ...r.response,
          headers: r.response.headers ? { ...r.response.headers } : null,
          body:
            r.response.body && typeof r.response.body === 'object'
              ? JSON.parse(JSON.stringify(r.response.body))
              : r.response.body,
        }
      : null,
  }));
}

export const useRequestStore = create<RequestState>()(
  persist(
    (set, get) => ({
      activeRequestId: null,
      activeRequestDetails: null,
      currentEditorData: null,
      pendingSaveData: null,
      isSavingRequest: false,
      isLoading: false,
      isAgentOnline: false,
      response: null,
      responsesByRequestId: {},
      requestHistory: cloneDefaultRequests(),

      setActiveRequest: (id: string | null, details: ActiveRequestDetails | null, workspaceId?: string | null) => {
        const targetKey = id ? id : getScratchpadKey(workspaceId);
        const existingResponse = get().responsesByRequestId[targetKey] ?? null;

        set({
          activeRequestId: id,
          activeRequestDetails: details,
          response: existingResponse,
        });

        if (!existingResponse) {
          getResponseFromStorage(targetKey)
            .then((stored) => {
              if (stored) {
                const currentActiveKey = get().activeRequestId
                  ? get().activeRequestId
                  : getScratchpadKey(workspaceId);
                set((state) => ({
                  responsesByRequestId: {
                    ...state.responsesByRequestId,
                    [targetKey]: stored,
                  },
                  ...(currentActiveKey === targetKey ? { response: stored } : {}),
                }));
              }
            })
            .catch(() => {});
        }
      },

      setActiveRequestName: (name: string) => {
        set((state) => {
          if (!state.activeRequestDetails) {
            return {};
          }
          return {
            activeRequestDetails: {
              ...state.activeRequestDetails,
              name,
            },
          };
        });
      },

      setCurrentEditorData: (data: RequestData | null) => {
        set({ currentEditorData: data });
      },

      setPendingSaveData: (data: RequestData | null) => {
        set({ pendingSaveData: data });
      },

      setIsSavingRequest: (isSaving: boolean) => {
        set({ isSavingRequest: isSaving });
      },

      setIsLoading: (isLoading: boolean) => {
        set({ isLoading });
      },

      setIsAgentOnline: (isOnline: boolean) => {
        set({ isAgentOnline: isOnline });
      },

      setResponse: (
        response: ResponseData | null,
        targetRequestId?: string | null,
        workspaceId?: string | null
      ) => {
        const targetKey =
          targetRequestId !== undefined
            ? targetRequestId ?? getScratchpadKey(workspaceId)
            : get().activeRequestId ?? getScratchpadKey(workspaceId);

        const currentActiveKey = get().activeRequestId
          ? get().activeRequestId
          : getScratchpadKey(workspaceId);

        const isTargetActive = targetKey === currentActiveKey;

        if (response === null) {
          const nextResponses = { ...get().responsesByRequestId };
          delete nextResponses[targetKey];
          deleteResponseFromStorage(targetKey).catch(() => {});

          set({
            responsesByRequestId: nextResponses,
            ...(isTargetActive ? { response: null } : {}),
          });
        } else {
          const nextResponses = {
            ...get().responsesByRequestId,
            [targetKey]: response,
          };
          saveResponseToStorage(targetKey, response).catch(() => {});

          set({
            responsesByRequestId: nextResponses,
            ...(isTargetActive ? { response } : {}),
          });
        }
      },

      setResponseForRequest: (requestId: string, response: ResponseData | null) => {
        get().setResponse(response, requestId);
      },

      loadResponseForRequest: async (requestId: string) => {
        try {
          const stored = await getResponseFromStorage(requestId);
          if (stored) {
            set((state) => ({
              responsesByRequestId: {
                ...state.responsesByRequestId,
                [requestId]: stored,
              },
              ...(state.activeRequestId === requestId ? { response: stored } : {}),
            }));
            return stored;
          }
        } catch {
          // Fallback to in-memory store
        }
        return get().responsesByRequestId[requestId] ?? null;
      },

      getResponseForActiveRequest: (workspaceId?: string | null) => {
        const { activeRequestId, responsesByRequestId, response } = get();
        const key = activeRequestId ? activeRequestId : getScratchpadKey(workspaceId);
        return responsesByRequestId[key] ?? response ?? null;
      },

      clearResponseForRequest: (requestId: string) => {
        get().setResponse(null, requestId);
      },

      addRequestHistory: (request: DependencyRequest) => {
        set((state) => ({
          requestHistory: [
            request,
            ...state.requestHistory.filter((r) => r.id !== request.id),
          ].slice(0, MAX_HISTORY_ITEMS),
        }));
      },

      resetScratchpad: (workspaceId?: string | null) => {
        const scratchKey = getScratchpadKey(workspaceId);
        const nextResponses = { ...get().responsesByRequestId };
        delete nextResponses[scratchKey];
        deleteResponseFromStorage(scratchKey).catch(() => {});

        set({
          activeRequestId: null,
          activeRequestDetails: null,
          currentEditorData: createCleanScratchpad(),
          response: null,
          responsesByRequestId: nextResponses,
        });
      },

      reset: () => {
        clearAllResponsesFromStorage().catch(() => {});
        set({
          activeRequestId: null,
          activeRequestDetails: null,
          currentEditorData: null,
          pendingSaveData: null,
          isSavingRequest: false,
          isLoading: false,
          isAgentOnline: false,
          response: null,
          responsesByRequestId: {},
          requestHistory: cloneDefaultRequests(),
        });
      },

      getInitialEditorRequest: () => {
        const { activeRequestDetails, currentEditorData } = get();
        if (activeRequestDetails) {
          return {
            id: activeRequestDetails.id,
            method: activeRequestDetails.method,
            url: activeRequestDetails.url,
            target: activeRequestDetails.target,
            headers: activeRequestDetails.headers,
            body: activeRequestDetails.body,
            auth: activeRequestDetails.auth,
            schemaDefinition: activeRequestDetails.schemaDefinition || undefined,
          };
        }
        return currentEditorData || createCleanScratchpad();
      },
    }),
    {
      name: REQUEST_STORAGE_KEY,
      storage: createJSONStorage(() =>
        typeof window !== 'undefined' ? window.localStorage : dummyStorage
      ),
      partialize: (state) => ({
        currentEditorData: state.currentEditorData,
      }),
    }
  )
);
