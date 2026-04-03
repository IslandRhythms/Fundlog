import type { api } from './preload';

declare global {
  interface Window {
    fundlog: typeof api;
  }
}

export {};
declare module 'bootstrap/dist/js/bootstrap.bundle.min.js';
declare module 'bootstrap';
