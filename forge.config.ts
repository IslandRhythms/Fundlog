import type { ForgeConfig } from '@electron-forge/shared-types';
import path from 'node:path';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import AutoUnpackNativesPlugin from '@electron-forge/plugin-auto-unpack-natives';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';

/**
 * Forge Vite’s default ignore only ships `/.vite`, so `require('better-sqlite3')` in the
 * main bundle has no module to load. Include that package and its runtime deps (not
 * prebuild-install — install-time only).
 *
 * If `packagerConfig.ignore` is set, the Vite plugin leaves it alone — see plugin-vite
 * `resolveForgeConfig`.
 */
function packagerIgnore(file: string): boolean {
  if (!file) return false;
  if (file.startsWith('/.vite')) return false;
  // Must not ignore the `node_modules` root; otherwise the walker never reaches packages below.
  if (file === '/node_modules') return false;
  if (file.startsWith('/node_modules/better-sqlite3')) return false;
  if (file.startsWith('/node_modules/bindings')) return false;
  if (file.startsWith('/node_modules/file-uri-to-path')) return false;
  // Skip the rest of node_modules and all other project files (same idea as Forge Vite default).
  return true;
}

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    ignore: packagerIgnore,
    icon: path.resolve(__dirname, 'build/icons/icon'),
    extraResource: [path.resolve(__dirname, 'build/icons')],
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({
      setupIcon: path.resolve(__dirname, 'build/icons/icon.ico'),
    }),
    new MakerZIP({}, ['darwin']),
    new MakerRpm({}),
    new MakerDeb({}),
  ],
  plugins: [
    // Unpack better-sqlite3 (.node binary) out of app.asar so it can load at runtime
    new AutoUnpackNativesPlugin({}),
    new VitePlugin({
      // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
      // If you are familiar with Vite configuration, it will look really familiar.
      build: [
        {
          // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
          entry: 'src/main.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/preload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.mts',
        },
      ],
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
