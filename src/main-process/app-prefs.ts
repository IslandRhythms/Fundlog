import { app } from 'electron';
import { join } from 'node:path';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import type { AppPrefs } from '../shared/types';

export type { AppPrefs } from '../shared/types';

const PREFS_FILENAME = 'fundlog-app-prefs.json';

export function getAppPrefsFilePath(): string {
  return join(app.getPath('userData'), PREFS_FILENAME);
}

export function readAppPrefs(): AppPrefs {
  const fp = getAppPrefsFilePath();
  if (!existsSync(fp)) return {};
  try {
    const raw = readFileSync(fp, 'utf8');
    const parsed = JSON.parse(raw) as AppPrefs;
    return typeof parsed === 'object' && parsed ? parsed : {};
  } catch {
    return {};
  }
}

export function writeAppPrefs(prefs: AppPrefs): void {
  writeFileSync(getAppPrefsFilePath(), `${JSON.stringify(prefs, null, 2)}\n`, 'utf8');
}
