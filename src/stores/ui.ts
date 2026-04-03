import { defineStore } from 'pinia';
import type { CustomThemeColors, CustomThemeConfig } from '../shared/types';

type Theme = 'light' | 'dark' | 'system';

const CUSTOM_PROPERTIES = [
  '--bg',
  '--shell-bg',
  '--card-bg',
  '--card-text',
  '--text',
  '--text-h',
  '--muted',
  '--border',
  '--card-border',
  '--accent',
  '--accent-bg',
  '--accent-border',
] as const;

function parseRgb(hexLike: string): { r: number; g: number; b: number } | null {
  const s = hexLike.trim();
  const m6 = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(s);
  if (m6) {
    return {
      r: parseInt(m6[1], 16),
      g: parseInt(m6[2], 16),
      b: parseInt(m6[3], 16),
    };
  }
  const m3 = /^#?([a-f\d])([a-f\d])([a-f\d])$/i.exec(s);
  if (m3) {
    return {
      r: parseInt(m3[1] + m3[1], 16),
      g: parseInt(m3[2] + m3[2], 16),
      b: parseInt(m3[3] + m3[3], 16),
    };
  }
  return null;
}

function applyColorsToRoot(colors: CustomThemeColors) {
  const root = document.documentElement;
  if (colors.bg) {
    root.style.setProperty('--bg', colors.bg);
  }
  if (colors.shellBg) {
    root.style.setProperty('--shell-bg', colors.shellBg);
  }
  if (colors.cardBg) {
    root.style.setProperty('--card-bg', colors.cardBg);
  }
  if (colors.cardText) {
    root.style.setProperty('--card-text', colors.cardText);
  }
  if (colors.text) {
    root.style.setProperty('--text', colors.text);
  }
  if (colors.textH) {
    root.style.setProperty('--text-h', colors.textH);
  }
  if (colors.muted) {
    root.style.setProperty('--muted', colors.muted);
  }
  if (colors.border) {
    root.style.setProperty('--border', colors.border);
  }
  if (colors.cardBorder) {
    root.style.setProperty('--card-border', colors.cardBorder);
  }
  if (colors.accent) {
    root.style.setProperty('--accent', colors.accent);
    const rgb = parseRgb(colors.accent);
    if (rgb) {
      root.style.setProperty(
        '--accent-bg',
        `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.14)`,
      );
      root.style.setProperty(
        '--accent-border',
        `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.5)`,
      );
    }
  }
}

function clearCustomPropertiesFromRoot() {
  const root = document.documentElement;
  for (const p of CUSTOM_PROPERTIES) {
    root.style.removeProperty(p);
  }
}

function hasColorOverrides(colors: CustomThemeColors) {
  return Object.keys(colors).length > 0;
}

export const useUiStore = defineStore('ui', {
  state: () => ({
    theme: 'system' as Theme,
    resolvedTheme: 'light' as 'light' | 'dark',
    customTheme: null as CustomThemeConfig | null,
  }),
  actions: {
    async initTheme() {
      if (!window.fundlog?.theme) return;
      const state = await window.fundlog.theme.getState();
      this.theme = state.preference;
      this.resolvedTheme = state.resolved;
      document.documentElement.dataset.theme = state.resolved;
      await this.loadCustomThemeFromPrefs();
    },
    async loadCustomThemeFromPrefs() {
      if (!window.fundlog?.preferences) return;
      const prefs = await window.fundlog.preferences.get();
      const cfg = prefs.customTheme;
      if (cfg?.enabled && cfg.colors && hasColorOverrides(cfg.colors)) {
        this.customTheme = cfg;
        clearCustomPropertiesFromRoot();
        applyColorsToRoot(cfg.colors);
      } else {
        this.customTheme = cfg ?? null;
        clearCustomPropertiesFromRoot();
      }
    },
    async setTheme(theme: Theme) {
      this.theme = theme;
      if (window.fundlog?.theme) {
        const resolved = await window.fundlog.theme.set(theme);
        this.resolvedTheme = resolved;
        document.documentElement.dataset.theme = resolved;
        if (this.customTheme?.enabled && this.customTheme.colors && hasColorOverrides(this.customTheme.colors)) {
          clearCustomPropertiesFromRoot();
          applyColorsToRoot(this.customTheme.colors);
        }
      }
    },
    async saveCustomTheme(config: CustomThemeConfig | null) {
      if (!window.fundlog?.preferences) return;
      await window.fundlog.preferences.set({
        customTheme: config,
      });
      this.customTheme = config;
      clearCustomPropertiesFromRoot();
      if (config?.enabled && config.colors && hasColorOverrides(config.colors)) {
        applyColorsToRoot(config.colors);
      }
    },
  },
});
