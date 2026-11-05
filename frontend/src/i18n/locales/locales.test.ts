import { describe, it, expect } from 'vitest';
import { translate } from '../index';
import enUS from './en-US';
import ptBR from './pt-BR';

describe('locales updater translation keys', () => {
  const tEn = (key: string) => translate('en-US', key);
  const tPt = (key: string) => translate('pt-BR', key);

  it('contains all required updater translation keys in en-US and pt-BR', () => {
    const requiredKeys = [
      'updater.checkNow',
      'updater.checking',
      'updater.upToDate',
      'updater.upToDateDesc',
      'updater.updateAvailable',
      'updater.releaseNotesSummary',
      'updater.downloadAndInstall',
      'updater.downloading',
      'updater.downloadComplete',
      'updater.readyToRestartDesc',
      'updater.restartNow',
      'updater.updateFailed',
      'updater.updatePill',
      'updater.cancel',
      'updater.errorCheck',
      'updater.retry',
    ];
    for (const key of requiredKeys) {
      expect(tEn(key)).not.toBe(key);
      expect(tPt(key)).not.toBe(key);
    }
  });

  it('interpolates updater dynamic parameters correctly', () => {
    expect(translate('en-US', 'updater.downloading', { version: '0.6.0' })).toBe(
      'Downloading update (0.6.0)...'
    );
    expect(translate('pt-BR', 'updater.downloading', { version: '0.6.0' })).toBe(
      'Baixando atualização (0.6.0)...'
    );
    expect(translate('en-US', 'updater.updatePill', { version: '0.6.0' })).toBe(
      'Update available: 0.6.0'
    );
    expect(translate('pt-BR', 'updater.updatePill', { version: '0.6.0' })).toBe(
      'Atualização disponível: 0.6.0'
    );
  });

  it('maintains structural symmetry between en-US and pt-BR updater sections', () => {
    const enUpdaterKeys = Object.keys((enUS as any).updater || {});
    const ptUpdaterKeys = Object.keys((ptBR as any).updater || {});

    expect(enUpdaterKeys.length).toBeGreaterThan(0);
    expect(ptUpdaterKeys.sort()).toEqual(enUpdaterKeys.sort());
  });
});
