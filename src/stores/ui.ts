import { defineStore } from 'pinia';

type Theme = 'light' | 'dark' | 'system';

export const useUiStore = defineStore('ui', {
  state: () => ({
    theme: 'system' as Theme,
  }),
  actions: {
    async initTheme() {
      if (window.fundlog?.theme) {
        const current = await window.fundlog.theme.get();
        this.theme = current;
        document.documentElement.dataset.theme = current;
      }
    },
    async setTheme(theme: Theme) {
      this.theme = theme;
      if (window.fundlog?.theme) {
        const applied = await window.fundlog.theme.set(theme);
        document.documentElement.dataset.theme = applied;
      }
    },
  },
});

