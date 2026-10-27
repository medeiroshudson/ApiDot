import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  useLayoutStore,
  INITIAL_LAYOUT_STATE,
  DEFAULT_SIDEBAR_WIDTH,
  MIN_SIDEBAR_WIDTH,
  MAX_SIDEBAR_WIDTH,
  DEFAULT_REQUEST_RESPONSE_RATIO,
  MIN_REQUEST_RESPONSE_RATIO,
  MAX_REQUEST_RESPONSE_RATIO,
  LAYOUT_STORAGE_KEY,
} from './useLayoutStore';

describe('useLayoutStore', () => {
  beforeEach(() => {
    // Reset store state to initial values before each test
    useLayoutStore.setState(INITIAL_LAYOUT_STATE);
    localStorage.clear();
  });

  describe('Initial Default State', () => {
    it('should initialize with correct default layout measurements', () => {
      const state = useLayoutStore.getState();
      expect(state.sidebarWidth).toBe(256);
      expect(state.sidebarWidth).toBe(DEFAULT_SIDEBAR_WIDTH);
      expect(state.requestResponseRatio).toBe(50);
      expect(state.requestResponseRatio).toBe(DEFAULT_REQUEST_RESPONSE_RATIO);
      expect(state.sidebarCollapsed).toBe(false);
      expect(state.activeMobilePane).toBe('request');
    });

    it('should initialize with all modals closed and banners empty', () => {
      const state = useLayoutStore.getState();
      expect(state.isWorkspaceModalOpen).toBe(false);
      expect(state.isSaveModalOpen).toBe(false);
      expect(state.isEnvModalOpen).toBe(false);
      expect(state.isCollectionSettingsOpen).toBe(false);
      expect(state.isImportOpenApiModalOpen).toBe(false);
      expect(state.isDrawerOpen).toBe(false);
      expect(state.auditBanner).toBeNull();
      expect(state.syncError).toBeNull();
    });

    it('should expose defined constants with expected values', () => {
      expect(DEFAULT_SIDEBAR_WIDTH).toBe(256);
      expect(MIN_SIDEBAR_WIDTH).toBe(180);
      expect(MAX_SIDEBAR_WIDTH).toBe(480);
      expect(DEFAULT_REQUEST_RESPONSE_RATIO).toBe(50);
      expect(MIN_REQUEST_RESPONSE_RATIO).toBe(20);
      expect(MAX_REQUEST_RESPONSE_RATIO).toBe(80);
      expect(LAYOUT_STORAGE_KEY).toBe('apidot_layout_preferences');
      expect(INITIAL_LAYOUT_STATE).toEqual({
        sidebarWidth: 256,
        requestResponseRatio: 50,
        sidebarCollapsed: false,
        activeMobilePane: 'request',
        isWorkspaceModalOpen: false,
        isSaveModalOpen: false,
        isEnvModalOpen: false,
        isCollectionSettingsOpen: false,
        isImportOpenApiModalOpen: false,
        isDrawerOpen: false,
        auditBanner: null,
        syncError: null,
      });
    });
  });

  describe('Sidebar Width Management & Clamps', () => {
    it('should set sidebar width within boundaries', () => {
      useLayoutStore.getState().setSidebarWidth(320);
      expect(useLayoutStore.getState().sidebarWidth).toBe(320);
    });

    it('should clamp sidebar width to MIN_SIDEBAR_WIDTH (180px) when lower', () => {
      useLayoutStore.getState().setSidebarWidth(120);
      expect(useLayoutStore.getState().sidebarWidth).toBe(MIN_SIDEBAR_WIDTH);
      expect(useLayoutStore.getState().sidebarWidth).toBe(180);
    });

    it('should clamp sidebar width to MAX_SIDEBAR_WIDTH (480px) when higher', () => {
      useLayoutStore.getState().setSidebarWidth(600);
      expect(useLayoutStore.getState().sidebarWidth).toBe(MAX_SIDEBAR_WIDTH);
      expect(useLayoutStore.getState().sidebarWidth).toBe(480);
    });

    it('should accept exact boundary values for sidebar width', () => {
      useLayoutStore.getState().setSidebarWidth(180);
      expect(useLayoutStore.getState().sidebarWidth).toBe(180);

      useLayoutStore.getState().setSidebarWidth(480);
      expect(useLayoutStore.getState().sidebarWidth).toBe(480);
    });

    it('should adjust sidebar width with positive and negative delta', () => {
      useLayoutStore.getState().adjustSidebarWidth(44);
      expect(useLayoutStore.getState().sidebarWidth).toBe(300);

      useLayoutStore.getState().adjustSidebarWidth(-50);
      expect(useLayoutStore.getState().sidebarWidth).toBe(250);
    });

    it('should clamp adjustSidebarWidth when delta exceeds bounds', () => {
      useLayoutStore.getState().adjustSidebarWidth(-200);
      expect(useLayoutStore.getState().sidebarWidth).toBe(MIN_SIDEBAR_WIDTH);

      useLayoutStore.getState().adjustSidebarWidth(500);
      expect(useLayoutStore.getState().sidebarWidth).toBe(MAX_SIDEBAR_WIDTH);
    });

    it('should reset sidebar width to DEFAULT_SIDEBAR_WIDTH (256px)', () => {
      useLayoutStore.getState().setSidebarWidth(420);
      expect(useLayoutStore.getState().sidebarWidth).toBe(420);

      useLayoutStore.getState().resetSidebarWidth();
      expect(useLayoutStore.getState().sidebarWidth).toBe(DEFAULT_SIDEBAR_WIDTH);
      expect(useLayoutStore.getState().sidebarWidth).toBe(256);
    });
  });

  describe('Request/Response Ratio Management & Clamps', () => {
    it('should set request/response ratio within boundaries', () => {
      useLayoutStore.getState().setRequestResponseRatio(65);
      expect(useLayoutStore.getState().requestResponseRatio).toBe(65);
    });

    it('should clamp ratio to MIN_REQUEST_RESPONSE_RATIO (20%) when lower', () => {
      useLayoutStore.getState().setRequestResponseRatio(10);
      expect(useLayoutStore.getState().requestResponseRatio).toBe(MIN_REQUEST_RESPONSE_RATIO);
      expect(useLayoutStore.getState().requestResponseRatio).toBe(20);
    });

    it('should clamp ratio to MAX_REQUEST_RESPONSE_RATIO (80%) when higher', () => {
      useLayoutStore.getState().setRequestResponseRatio(95);
      expect(useLayoutStore.getState().requestResponseRatio).toBe(MAX_REQUEST_RESPONSE_RATIO);
      expect(useLayoutStore.getState().requestResponseRatio).toBe(80);
    });

    it('should accept exact boundary values for ratio', () => {
      useLayoutStore.getState().setRequestResponseRatio(20);
      expect(useLayoutStore.getState().requestResponseRatio).toBe(20);

      useLayoutStore.getState().setRequestResponseRatio(80);
      expect(useLayoutStore.getState().requestResponseRatio).toBe(80);
    });

    it('should adjust ratio with positive and negative delta', () => {
      useLayoutStore.getState().adjustRequestResponseRatio(15);
      expect(useLayoutStore.getState().requestResponseRatio).toBe(65);

      useLayoutStore.getState().adjustRequestResponseRatio(-25);
      expect(useLayoutStore.getState().requestResponseRatio).toBe(40);
    });

    it('should clamp adjustRequestResponseRatio when delta exceeds bounds', () => {
      useLayoutStore.getState().adjustRequestResponseRatio(-50);
      expect(useLayoutStore.getState().requestResponseRatio).toBe(MIN_REQUEST_RESPONSE_RATIO);

      useLayoutStore.getState().adjustRequestResponseRatio(90);
      expect(useLayoutStore.getState().requestResponseRatio).toBe(MAX_REQUEST_RESPONSE_RATIO);
    });

    it('should reset ratio to DEFAULT_REQUEST_RESPONSE_RATIO (50%)', () => {
      useLayoutStore.getState().setRequestResponseRatio(75);
      expect(useLayoutStore.getState().requestResponseRatio).toBe(75);

      useLayoutStore.getState().resetRequestResponseRatio();
      expect(useLayoutStore.getState().requestResponseRatio).toBe(DEFAULT_REQUEST_RESPONSE_RATIO);
      expect(useLayoutStore.getState().requestResponseRatio).toBe(50);
    });
  });

  describe('Sidebar Collapsed State', () => {
    it('should set sidebar collapsed state explicitly', () => {
      useLayoutStore.getState().setSidebarCollapsed(true);
      expect(useLayoutStore.getState().sidebarCollapsed).toBe(true);

      useLayoutStore.getState().setSidebarCollapsed(false);
      expect(useLayoutStore.getState().sidebarCollapsed).toBe(false);
    });

    it('should toggle sidebar collapsed state', () => {
      expect(useLayoutStore.getState().sidebarCollapsed).toBe(false);

      useLayoutStore.getState().toggleSidebarCollapsed();
      expect(useLayoutStore.getState().sidebarCollapsed).toBe(true);

      useLayoutStore.getState().toggleSidebarCollapsed();
      expect(useLayoutStore.getState().sidebarCollapsed).toBe(false);
    });
  });

  describe('Mobile Active Pane', () => {
    it('should toggle between request and response mobile panes', () => {
      expect(useLayoutStore.getState().activeMobilePane).toBe('request');

      useLayoutStore.getState().setActiveMobilePane('response');
      expect(useLayoutStore.getState().activeMobilePane).toBe('response');

      useLayoutStore.getState().setActiveMobilePane('request');
      expect(useLayoutStore.getState().activeMobilePane).toBe('request');
    });
  });

  describe('Modal Visibility Management (`setModalOpen`)', () => {
    it('should toggle modals using short modal names', () => {
      const store = useLayoutStore.getState();

      store.setModalOpen('workspace', true);
      expect(useLayoutStore.getState().isWorkspaceModalOpen).toBe(true);
      store.setModalOpen('workspace', false);
      expect(useLayoutStore.getState().isWorkspaceModalOpen).toBe(false);

      store.setModalOpen('save', true);
      expect(useLayoutStore.getState().isSaveModalOpen).toBe(true);
      store.setModalOpen('save', false);
      expect(useLayoutStore.getState().isSaveModalOpen).toBe(false);

      store.setModalOpen('env', true);
      expect(useLayoutStore.getState().isEnvModalOpen).toBe(true);
      store.setModalOpen('env', false);
      expect(useLayoutStore.getState().isEnvModalOpen).toBe(false);

      store.setModalOpen('collectionSettings', true);
      expect(useLayoutStore.getState().isCollectionSettingsOpen).toBe(true);
      store.setModalOpen('collectionSettings', false);
      expect(useLayoutStore.getState().isCollectionSettingsOpen).toBe(false);

      store.setModalOpen('importOpenApi', true);
      expect(useLayoutStore.getState().isImportOpenApiModalOpen).toBe(true);
      store.setModalOpen('importOpenApi', false);
      expect(useLayoutStore.getState().isImportOpenApiModalOpen).toBe(false);

      store.setModalOpen('drawer', true);
      expect(useLayoutStore.getState().isDrawerOpen).toBe(true);
      store.setModalOpen('drawer', false);
      expect(useLayoutStore.getState().isDrawerOpen).toBe(false);
    });

    it('should toggle modals using exact state property names', () => {
      const store = useLayoutStore.getState();

      store.setModalOpen('isWorkspaceModalOpen', true);
      expect(useLayoutStore.getState().isWorkspaceModalOpen).toBe(true);

      store.setModalOpen('isSaveModalOpen', true);
      expect(useLayoutStore.getState().isSaveModalOpen).toBe(true);

      store.setModalOpen('isEnvModalOpen', true);
      expect(useLayoutStore.getState().isEnvModalOpen).toBe(true);

      store.setModalOpen('isCollectionSettingsOpen', true);
      expect(useLayoutStore.getState().isCollectionSettingsOpen).toBe(true);

      store.setModalOpen('isImportOpenApiModalOpen', true);
      expect(useLayoutStore.getState().isImportOpenApiModalOpen).toBe(true);

      store.setModalOpen('isDrawerOpen', true);
      expect(useLayoutStore.getState().isDrawerOpen).toBe(true);
    });
  });

  describe('Audit Banner and Sync Error Helpers', () => {
    it('should set and clear auditBanner', () => {
      const bannerData = {
        collectionName: 'Customers API',
        report: { addedRequests: 3, updatedRequests: 1, fieldsAdded: 4 },
      };

      useLayoutStore.getState().setAuditBanner(bannerData);
      expect(useLayoutStore.getState().auditBanner).toEqual(bannerData);

      useLayoutStore.getState().setAuditBanner(null);
      expect(useLayoutStore.getState().auditBanner).toBeNull();
    });

    it('should set and clear syncError', () => {
      useLayoutStore.getState().setSyncError('Connection refused by server');
      expect(useLayoutStore.getState().syncError).toBe('Connection refused by server');

      useLayoutStore.getState().setSyncError(null);
      expect(useLayoutStore.getState().syncError).toBeNull();
    });
  });

  describe('Persistence Configuration', () => {
    it('should have persist options configured with apidot_layout_preferences key', () => {
      const persistOptions = (useLayoutStore as any).persist?.getOptions?.();
      expect(persistOptions?.name).toBe('apidot_layout_preferences');
    });

    it('should partialize only layout dimensions and sidebarCollapsed state', () => {
      const persistOptions = (useLayoutStore as any).persist?.getOptions?.();
      expect(typeof persistOptions?.partialize).toBe('function');

      const fullState = {
        sidebarWidth: 350,
        requestResponseRatio: 65,
        sidebarCollapsed: true,
        activeMobilePane: 'response' as const,
        isWorkspaceModalOpen: true,
        isSaveModalOpen: true,
        isEnvModalOpen: true,
        isCollectionSettingsOpen: true,
        isImportOpenApiModalOpen: true,
        isDrawerOpen: true,
        auditBanner: { collectionName: 'Test', report: {} },
        syncError: 'error',
      };

      const partialized = persistOptions.partialize(fullState);
      expect(partialized).toEqual({
        sidebarWidth: 350,
        requestResponseRatio: 65,
        sidebarCollapsed: true,
      });

      // Confirm transient UI states are NOT persisted
      expect((partialized as any).activeMobilePane).toBeUndefined();
      expect((partialized as any).isWorkspaceModalOpen).toBeUndefined();
      expect((partialized as any).isSaveModalOpen).toBeUndefined();
      expect((partialized as any).isEnvModalOpen).toBeUndefined();
      expect((partialized as any).isCollectionSettingsOpen).toBeUndefined();
      expect((partialized as any).isImportOpenApiModalOpen).toBeUndefined();
      expect((partialized as any).isDrawerOpen).toBeUndefined();
      expect((partialized as any).auditBanner).toBeUndefined();
      expect((partialized as any).syncError).toBeUndefined();
    });
  });
});
