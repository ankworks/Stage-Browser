import type {
  Favorite,
  HistoryEntry,
  Settings,
  StudyState,
  TabState,
} from './types';

/** First paint payload for the Stage renderer. */
export interface StageBootstrap {
  appName: string;
  version: string;
  dev: boolean;
  platform: NodeJS.Platform;
  settings: Settings;
  tabs: TabState[];
  activeTabId: string | null;
  favorites: Favorite[];
  history: HistoryEntry[];
  study: StudyState;
}
