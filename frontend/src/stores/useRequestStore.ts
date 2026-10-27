import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import { RequestData } from '@/components/request/RequestEditor';
import { ResponseData } from '@/components/response/ResponseViewer';
import { DependencyRequest } from '@/lib/variables';
import { ExecutionTarget } from '@/lib/treeApi';

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

export const CLEAN_SCRATCHPAD: RequestData = {
  method: 'GET',
  url: '',
  target: 'Inherit',
  headers: '',
  body: '',
  auth: { type: 'none' },
};

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
  requestHistory: DependencyRequest[];
  setActiveRequest: (id: string | null, details: ActiveRequestDetails | null) => void;
  setActiveRequestName: (name: string) => void;
  setCurrentEditorData: (data: RequestData | null) => void;
  setPendingSaveData: (data: RequestData | null) => void;
  setIsSavingRequest: (isSaving: boolean) => void;
  setIsLoading: (isLoading: boolean) => void;
  setIsAgentOnline: (isOnline: boolean) => void;
  setResponse: (response: ResponseData | null) => void;
  addRequestHistory: (request: DependencyRequest) => void;
  resetScratchpad: () => void;
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
      requestHistory: cloneDefaultRequests(),

      setActiveRequest: (id: string | null, details: ActiveRequestDetails | null) => {
        set({
          activeRequestId: id,
          activeRequestDetails: details,
        });
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

      setResponse: (response: ResponseData | null) => {
        set({ response });
      },

      addRequestHistory: (request: DependencyRequest) => {
        set((state) => ({
          requestHistory: [
            request,
            ...state.requestHistory.filter((r) => r.id !== request.id),
          ],
        }));
      },

      resetScratchpad: () => {
        set({
          activeRequestId: null,
          activeRequestDetails: null,
          currentEditorData: CLEAN_SCRATCHPAD,
          response: null,
        });
      },

      reset: () => {
        set({
          activeRequestId: null,
          activeRequestDetails: null,
          currentEditorData: null,
          pendingSaveData: null,
          isSavingRequest: false,
          isLoading: false,
          isAgentOnline: false,
          response: null,
          requestHistory: cloneDefaultRequests(),
        });
      },

      getInitialEditorRequest: () => {
        const { activeRequestDetails } = get();
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
        return CLEAN_SCRATCHPAD;
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
