import { describe, it, expect, beforeEach } from 'vitest';
import {
  useEnvironmentStore,
  DEFAULT_ENVIRONMENTS,
  ENVIRONMENT_STORAGE_KEY,
  INITIAL_ENVIRONMENT_STATE,
} from './useEnvironmentStore';
import { EnvironmentGroup } from '@/components/environment/EnvironmentModal';
import { VariableItem } from '@/components/environment/VariableGrid';

describe('useEnvironmentStore', () => {
  beforeEach(() => {
    // Reset store state to initial defaults before each test
    useEnvironmentStore.setState({
      environments: [
        { name: 'Development', variables: [] },
        { name: 'Staging', variables: [] },
        { name: 'Production', variables: [] },
      ],
      activeEnvironment: null,
      globals: [],
      collectionVariables: [],
    });
    localStorage.clear();
  });

  describe('Initial State & Defaults', () => {
    it('should initialize with default environments (Development, Staging, Production)', () => {
      const state = useEnvironmentStore.getState();
      expect(state.environments).toHaveLength(3);
      expect(state.environments.map((e) => e.name)).toEqual([
        'Development',
        'Staging',
        'Production',
      ]);
      expect(state.environments[0].variables).toEqual([]);
      expect(state.environments[1].variables).toEqual([]);
      expect(state.environments[2].variables).toEqual([]);
    });

    it('should initialize with activeEnvironment as null', () => {
      const state = useEnvironmentStore.getState();
      expect(state.activeEnvironment).toBeNull();
    });

    it('should initialize with empty globals and collectionVariables', () => {
      const state = useEnvironmentStore.getState();
      expect(state.globals).toEqual([]);
      expect(state.collectionVariables).toEqual([]);
    });

    it('should export defined constants and initial state', () => {
      expect(ENVIRONMENT_STORAGE_KEY).toBe('apidot_environment_storage');
      expect(DEFAULT_ENVIRONMENTS).toEqual([
        { name: 'Development', variables: [] },
        { name: 'Staging', variables: [] },
        { name: 'Production', variables: [] },
      ]);
      expect(INITIAL_ENVIRONMENT_STATE).toEqual({
        environments: DEFAULT_ENVIRONMENTS,
        activeEnvironment: null,
        globals: [],
        collectionVariables: [],
      });
    });
  });

  describe('Environment Management (`setEnvironments`)', () => {
    it('should update environments list', () => {
      const newEnvs: EnvironmentGroup[] = [
        { name: 'Local', variables: [{ key: 'PORT', value: '3000', isActive: true }] },
        { name: 'Cloud', variables: [{ key: 'PORT', value: '443', isActive: true }] },
      ];

      useEnvironmentStore.getState().setEnvironments(newEnvs);

      const state = useEnvironmentStore.getState();
      expect(state.environments).toEqual(newEnvs);
    });

    it('should retain activeEnvironment if it still exists in the new list', () => {
      useEnvironmentStore.getState().setActiveEnvironment('Staging');
      expect(useEnvironmentStore.getState().activeEnvironment).toBe('Staging');

      const updatedEnvs: EnvironmentGroup[] = [
        { name: 'Development', variables: [] },
        { name: 'Staging', variables: [{ key: 'API_URL', value: 'https://staging.api.com' }] },
        { name: 'QA', variables: [] },
      ];

      useEnvironmentStore.getState().setEnvironments(updatedEnvs);

      expect(useEnvironmentStore.getState().activeEnvironment).toBe('Staging');
    });

    it('should retain activeEnvironment with case-insensitive matching and normalize name', () => {
      useEnvironmentStore.getState().setActiveEnvironment('Development');

      const updatedEnvs: EnvironmentGroup[] = [
        { name: 'development', variables: [{ key: 'HOST', value: 'localhost' }] },
      ];

      useEnvironmentStore.getState().setEnvironments(updatedEnvs);

      expect(useEnvironmentStore.getState().activeEnvironment).toBe('development');
    });

    it('should reset activeEnvironment to null if it no longer exists in the new list', () => {
      useEnvironmentStore.getState().setActiveEnvironment('Staging');
      expect(useEnvironmentStore.getState().activeEnvironment).toBe('Staging');

      const newEnvs: EnvironmentGroup[] = [
        { name: 'Development', variables: [] },
        { name: 'Production', variables: [] },
      ];

      useEnvironmentStore.getState().setEnvironments(newEnvs);

      expect(useEnvironmentStore.getState().activeEnvironment).toBeNull();
    });

    it('should preserve null activeEnvironment when updating environments', () => {
      expect(useEnvironmentStore.getState().activeEnvironment).toBeNull();

      useEnvironmentStore.getState().setEnvironments([
        { name: 'Sandbox', variables: [] },
      ]);

      expect(useEnvironmentStore.getState().activeEnvironment).toBeNull();
    });
  });

  describe('Active Environment Selection (`setActiveEnvironment`)', () => {
    it('should set active environment to an existing environment', () => {
      useEnvironmentStore.getState().setActiveEnvironment('Production');
      expect(useEnvironmentStore.getState().activeEnvironment).toBe('Production');
    });

    it('should normalize casing when setting active environment matching existing env', () => {
      useEnvironmentStore.getState().setActiveEnvironment('development');
      expect(useEnvironmentStore.getState().activeEnvironment).toBe('Development');
    });

    it('should allow setting active environment to null', () => {
      useEnvironmentStore.getState().setActiveEnvironment('Development');
      expect(useEnvironmentStore.getState().activeEnvironment).toBe('Development');

      useEnvironmentStore.getState().setActiveEnvironment(null);
      expect(useEnvironmentStore.getState().activeEnvironment).toBeNull();
    });

    it('should allow setting custom environment name', () => {
      useEnvironmentStore.getState().setActiveEnvironment('CustomEnv');
      expect(useEnvironmentStore.getState().activeEnvironment).toBe('CustomEnv');
    });
  });

  describe('Globals and Collection Variables Management', () => {
    it('should update globals list', () => {
      const vars: VariableItem[] = [
        { key: 'TOKEN', value: 'secret123', isActive: true, isSecret: true },
        { key: 'BASE_PATH', value: '/v1', isActive: true },
      ];

      useEnvironmentStore.getState().setGlobals(vars);
      expect(useEnvironmentStore.getState().globals).toEqual(vars);

      useEnvironmentStore.getState().setGlobals([]);
      expect(useEnvironmentStore.getState().globals).toEqual([]);
    });

    it('should update collectionVariables list', () => {
      const vars: VariableItem[] = [
        { key: 'COLLECTION_ID', value: 'col-42', isActive: true },
      ];

      useEnvironmentStore.getState().setCollectionVariables(vars);
      expect(useEnvironmentStore.getState().collectionVariables).toEqual(vars);

      useEnvironmentStore.getState().setCollectionVariables([]);
      expect(useEnvironmentStore.getState().collectionVariables).toEqual([]);
    });
  });

  describe('Cascading Variable Resolution (`getResolvedVariables`)', () => {
    it('should return empty record when no variables are defined', () => {
      expect(useEnvironmentStore.getState().getResolvedVariables()).toEqual({});
    });

    it('should resolve active global variables', () => {
      useEnvironmentStore.getState().setGlobals([
        { key: 'API_URL', value: 'https://api.com', isActive: true },
        { key: 'TIMEOUT', value: '5000', isActive: true },
      ]);

      expect(useEnvironmentStore.getState().getResolvedVariables()).toEqual({
        API_URL: 'https://api.com',
        TIMEOUT: '5000',
      });
    });

    it('should let collection variables override global variables with the same key', () => {
      useEnvironmentStore.getState().setGlobals([
        { key: 'API_URL', value: 'https://global.api.com', isActive: true },
        { key: 'GLOBAL_ONLY', value: 'true', isActive: true },
      ]);

      useEnvironmentStore.getState().setCollectionVariables([
        { key: 'API_URL', value: 'https://collection.api.com', isActive: true },
        { key: 'COLLECTION_ONLY', value: 'col-val', isActive: true },
      ]);

      expect(useEnvironmentStore.getState().getResolvedVariables()).toEqual({
        API_URL: 'https://collection.api.com',
        GLOBAL_ONLY: 'true',
        COLLECTION_ONLY: 'col-val',
      });
    });

    it('should let active environment variables override collection and global variables', () => {
      useEnvironmentStore.getState().setGlobals([
        { key: 'API_URL', value: 'https://global.api.com', isActive: true },
        { key: 'TIER', value: 'global', isActive: true },
      ]);

      useEnvironmentStore.getState().setCollectionVariables([
        { key: 'API_URL', value: 'https://collection.api.com', isActive: true },
        { key: 'COLLECTION_VAR', value: 'c1', isActive: true },
      ]);

      useEnvironmentStore.getState().setEnvironments([
        {
          name: 'Staging',
          variables: [
            { key: 'API_URL', value: 'https://staging.api.com', isActive: true },
            { key: 'ENV_ONLY', value: 'staging-special', isActive: true },
          ],
        },
      ]);

      useEnvironmentStore.getState().setActiveEnvironment('Staging');

      expect(useEnvironmentStore.getState().getResolvedVariables()).toEqual({
        API_URL: 'https://staging.api.com',
        TIER: 'global',
        COLLECTION_VAR: 'c1',
        ENV_ONLY: 'staging-special',
      });
    });

    it('should ignore inactive variables (isActive: false) across all tiers', () => {
      useEnvironmentStore.getState().setGlobals([
        { key: 'INACTIVE_GLOBAL', value: 'off', isActive: false },
        { key: 'ACTIVE_GLOBAL', value: 'on', isActive: true },
      ]);

      useEnvironmentStore.getState().setCollectionVariables([
        { key: 'INACTIVE_COLLECTION', value: 'off', isActive: false },
        { key: 'ACTIVE_GLOBAL', value: 'overridden-by-collection', isActive: false },
      ]);

      useEnvironmentStore.getState().setEnvironments([
        {
          name: 'Development',
          variables: [
            { key: 'INACTIVE_ENV', value: 'off', isActive: false },
          ],
        },
      ]);

      useEnvironmentStore.getState().setActiveEnvironment('Development');

      // Note: Inactive collection variable does NOT override active global variable
      expect(useEnvironmentStore.getState().getResolvedVariables()).toEqual({
        ACTIVE_GLOBAL: 'on',
      });
    });

    it('should treat variables with isActive: undefined as active', () => {
      useEnvironmentStore.getState().setGlobals([
        { key: 'DEFAULT_ACTIVE', value: 'default-active-val' },
      ]);

      expect(useEnvironmentStore.getState().getResolvedVariables()).toEqual({
        DEFAULT_ACTIVE: 'default-active-val',
      });
    });

    it('should ignore variables with empty or whitespace-only keys', () => {
      useEnvironmentStore.getState().setGlobals([
        { key: '', value: 'empty-key', isActive: true },
        { key: '   ', value: 'spaces-key', isActive: true },
        { key: 'VALID_KEY', value: 'valid', isActive: true },
      ]);

      expect(useEnvironmentStore.getState().getResolvedVariables()).toEqual({
        VALID_KEY: 'valid',
      });
    });

    it('should ignore variables from non-active environments', () => {
      useEnvironmentStore.getState().setEnvironments([
        {
          name: 'Development',
          variables: [{ key: 'DEV_VAR', value: 'dev-val', isActive: true }],
        },
        {
          name: 'Production',
          variables: [{ key: 'PROD_VAR', value: 'prod-val', isActive: true }],
        },
      ]);

      useEnvironmentStore.getState().setActiveEnvironment('Development');

      const resolved = useEnvironmentStore.getState().getResolvedVariables();
      expect(resolved).toEqual({ DEV_VAR: 'dev-val' });
      expect(resolved).not.toHaveProperty('PROD_VAR');
    });

    it('should resolve correctly when activeEnvironment is null', () => {
      useEnvironmentStore.getState().setGlobals([
        { key: 'VAR_A', value: 'val-a', isActive: true },
      ]);
      useEnvironmentStore.getState().setCollectionVariables([
        { key: 'VAR_B', value: 'val-b', isActive: true },
      ]);
      useEnvironmentStore.getState().setActiveEnvironment(null);

      expect(useEnvironmentStore.getState().getResolvedVariables()).toEqual({
        VAR_A: 'val-a',
        VAR_B: 'val-b',
      });
    });
  });

  describe('Autocomplete Available Variables (`getAvailableVariables`)', () => {
    it('should return empty array when no variables are configured', () => {
      expect(useEnvironmentStore.getState().getAvailableVariables()).toEqual([]);
    });

    it('should return globals tagged with scope: "global"', () => {
      useEnvironmentStore.getState().setGlobals([
        { key: 'BASE_URL', value: 'https://api.com', isActive: true },
        { key: '  PORT  ', value: '8080', isActive: true },
      ]);

      const available = useEnvironmentStore.getState().getAvailableVariables();
      expect(available).toEqual([
        { key: 'BASE_URL', value: 'https://api.com', scope: 'global' },
        { key: 'PORT', value: '8080', scope: 'global' },
      ]);
    });

    it('should return collection variables tagged with scope: "collection"', () => {
      useEnvironmentStore.getState().setCollectionVariables([
        { key: 'COLL_VAR', value: '123', isActive: true },
      ]);

      const available = useEnvironmentStore.getState().getAvailableVariables();
      expect(available).toEqual([
        { key: 'COLL_VAR', value: '123', scope: 'collection' },
      ]);
    });

    it('should return active environment variables tagged with the active environment name', () => {
      useEnvironmentStore.getState().setEnvironments([
        {
          name: 'Staging',
          variables: [
            { key: 'ENV_URL', value: 'https://staging.test.com', isActive: true },
          ],
        },
      ]);
      useEnvironmentStore.getState().setActiveEnvironment('Staging');

      const available = useEnvironmentStore.getState().getAvailableVariables();
      expect(available).toEqual([
        { key: 'ENV_URL', value: 'https://staging.test.com', scope: 'Staging' },
      ]);
    });

    it('should flatten and combine all scopes into available variables list', () => {
      useEnvironmentStore.getState().setGlobals([
        { key: 'VAR_1', value: 'g1', isActive: true },
      ]);
      useEnvironmentStore.getState().setCollectionVariables([
        { key: 'VAR_2', value: 'c2', isActive: true },
      ]);
      useEnvironmentStore.getState().setEnvironments([
        {
          name: 'Production',
          variables: [{ key: 'VAR_3', value: 'p3', isActive: true }],
        },
      ]);
      useEnvironmentStore.getState().setActiveEnvironment('Production');

      const available = useEnvironmentStore.getState().getAvailableVariables();
      expect(available).toEqual([
        { key: 'VAR_1', value: 'g1', scope: 'global' },
        { key: 'VAR_2', value: 'c2', scope: 'collection' },
        { key: 'VAR_3', value: 'p3', scope: 'Production' },
      ]);
    });

    it('should exclude inactive variables and empty keys from available variables', () => {
      useEnvironmentStore.getState().setGlobals([
        { key: 'ACTIVE_VAR', value: 'val', isActive: true },
        { key: 'INACTIVE_VAR', value: 'val', isActive: false },
        { key: '', value: 'no-key', isActive: true },
        { key: '   ', value: 'whitespace-key', isActive: true },
      ]);

      const available = useEnvironmentStore.getState().getAvailableVariables();
      expect(available).toEqual([
        { key: 'ACTIVE_VAR', value: 'val', scope: 'global' },
      ]);
    });

    it('should not include variables from non-active environments', () => {
      useEnvironmentStore.getState().setEnvironments([
        {
          name: 'Development',
          variables: [{ key: 'DEV_ONLY', value: 'dev', isActive: true }],
        },
        {
          name: 'Production',
          variables: [{ key: 'PROD_ONLY', value: 'prod', isActive: true }],
        },
      ]);
      useEnvironmentStore.getState().setActiveEnvironment('Development');

      const available = useEnvironmentStore.getState().getAvailableVariables();
      expect(available).toEqual([
        { key: 'DEV_ONLY', value: 'dev', scope: 'Development' },
      ]);
      expect(available.some((v) => v.key === 'PROD_ONLY')).toBe(false);
    });

    it('should include duplicate keys across scopes with their respective scopes', () => {
      useEnvironmentStore.getState().setGlobals([
        { key: 'URL', value: 'https://global.com', isActive: true },
      ]);
      useEnvironmentStore.getState().setCollectionVariables([
        { key: 'URL', value: 'https://collection.com', isActive: true },
      ]);
      useEnvironmentStore.getState().setEnvironments([
        {
          name: 'Staging',
          variables: [{ key: 'URL', value: 'https://staging.com', isActive: true }],
        },
      ]);
      useEnvironmentStore.getState().setActiveEnvironment('Staging');

      const available = useEnvironmentStore.getState().getAvailableVariables();
      expect(available).toHaveLength(3);
      expect(available).toEqual([
        { key: 'URL', value: 'https://global.com', scope: 'global' },
        { key: 'URL', value: 'https://collection.com', scope: 'collection' },
        { key: 'URL', value: 'https://staging.com', scope: 'Staging' },
      ]);
    });
  });

  describe('Reset Action (`reset`)', () => {
    it('should restore store state to default values', () => {
      useEnvironmentStore.getState().setGlobals([
        { key: 'G1', value: 'val', isActive: true },
      ]);
      useEnvironmentStore.getState().setCollectionVariables([
        { key: 'C1', value: 'val', isActive: true },
      ]);
      useEnvironmentStore.getState().setEnvironments([
        { name: 'Custom', variables: [] },
      ]);
      useEnvironmentStore.getState().setActiveEnvironment('Custom');

      useEnvironmentStore.getState().reset();

      const state = useEnvironmentStore.getState();
      expect(state.environments).toEqual(DEFAULT_ENVIRONMENTS);
      expect(state.activeEnvironment).toBeNull();
      expect(state.globals).toEqual([]);
      expect(state.collectionVariables).toEqual([]);
    });
  });

  describe('Persistence Configuration', () => {
    it('should configure persist middleware with apidot_environment_storage key', () => {
      const persistOptions = (useEnvironmentStore as any).persist?.getOptions?.();
      expect(persistOptions?.name).toBe('apidot_environment_storage');
      expect(persistOptions?.name).toBe(ENVIRONMENT_STORAGE_KEY);
    });

    it('should partialize environments, activeEnvironment, and globals, omitting collectionVariables and actions', () => {
      const persistOptions = (useEnvironmentStore as any).persist?.getOptions?.();
      expect(typeof persistOptions?.partialize).toBe('function');

      const fullState = {
        environments: [{ name: 'TestEnv', variables: [] }],
        activeEnvironment: 'TestEnv',
        globals: [{ key: 'G_KEY', value: 'g_val', isActive: true }],
        collectionVariables: [{ key: 'C_KEY', value: 'c_val', isActive: true }],
        setEnvironments: () => {},
        setActiveEnvironment: () => {},
        setGlobals: () => {},
        setCollectionVariables: () => {},
        getResolvedVariables: () => ({}),
        getAvailableVariables: () => [],
        reset: () => {},
      };

      const partialized = persistOptions.partialize(fullState);

      expect(partialized).toEqual({
        environments: [{ name: 'TestEnv', variables: [] }],
        activeEnvironment: 'TestEnv',
        globals: [{ key: 'G_KEY', value: 'g_val', isActive: true }],
      });

      // Verify collectionVariables and actions are excluded from persistence
      expect((partialized as any).collectionVariables).toBeUndefined();
      expect((partialized as any).setEnvironments).toBeUndefined();
      expect((partialized as any).setActiveEnvironment).toBeUndefined();
      expect((partialized as any).setGlobals).toBeUndefined();
      expect((partialized as any).setCollectionVariables).toBeUndefined();
      expect((partialized as any).getResolvedVariables).toBeUndefined();
      expect((partialized as any).getAvailableVariables).toBeUndefined();
      expect((partialized as any).reset).toBeUndefined();
    });
  });
});
