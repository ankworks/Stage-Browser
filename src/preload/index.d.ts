import type { StageApi } from './index';

declare global {
  interface Window {
    stage: StageApi;
  }
}

export {};
