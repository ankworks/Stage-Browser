/**
 * IPC channel registry for Stage Browser.
 *
 * One window, one renderer role. Every invoke is validated in main; web tabs
 * have no preload at all, so page content can never reach these channels.
 */

export const CH = {
  /* app / window */
  APP_STATE: 'app:state',
  APP_SET_SETTINGS: 'app:setSettings',
  APP_QUIT: 'app:quit',
  WIN_MINIMIZE: 'win:minimize',
  WIN_TOGGLE_MAXIMIZE: 'win:toggleMaximize',
  WIN_CLOSE: 'win:close',
  WIN_OBSCURE: 'win:obscure',
  WIN_FOCUS_PAGE: 'win:focus-page',
  WIN_NEW_WINDOW: 'win:newWindow',

  /* tabs */
  TAB_NEW: 'tab:new',
  TAB_CLOSE: 'tab:close',
  TAB_CLOSE_OTHERS: 'tab:closeOthers',
  TAB_CLOSE_RIGHT: 'tab:closeRight',
  TAB_ACTIVATE: 'tab:activate',
  TAB_REOPEN: 'tab:reopen',
  TAB_REORDER: 'tab:reorder',
  TAB_DUPLICATE: 'tab:duplicate',
  TAB_PIN: 'tab:pin',
  TAB_MUTE: 'tab:mute',
  TAB_NAVIGATE: 'tab:navigate',
  TAB_BACK: 'tab:back',
  TAB_FORWARD: 'tab:forward',
  TAB_RELOAD: 'tab:reload',
  TAB_HARD_RELOAD: 'tab:hardReload',
  TAB_STOP: 'tab:stop',
  TAB_ZOOM: 'tab:zoom',

  /* library */
  FAV_LIST: 'fav:list',
  FAV_ADD: 'fav:add',
  FAV_REMOVE: 'fav:remove',
  FAV_RENAME: 'fav:rename',
  HIST_LIST: 'hist:list',
  HIST_CLEAR: 'hist:clear',
  HIST_REMOVE: 'hist:remove',

  /* shell */
  CLIPBOARD_WRITE: 'clipboard:write',
  SHELL_OPEN_EXTERNAL: 'shell:openExternal',

  /* study */
  STUDY_STATE: 'study:state',
  STUDY_FIND: 'study:find',
  STUDY_FIND_STEP: 'study:findStep',
  STUDY_FIND_STOP: 'study:findStop',
  STUDY_DOWNLOADS: 'study:downloads',
  STUDY_DOWNLOAD_CMD: 'study:downloadCmd',
  STUDY_DOWNLOAD_CLEAR: 'study:downloadClear',
  STUDY_ZOOM_SET: 'study:zoomSet',
  STUDY_ZOOM_RESET: 'study:zoomReset',
  STUDY_PRINT_PDF: 'study:printPdf',
  STUDY_READER: 'study:reader',
  STUDY_READER_GET: 'study:readerGet',
  STUDY_READING_LIST: 'study:readingList',
  STUDY_READING_ADD: 'study:readingAdd',
  STUDY_READING_CMD: 'study:readingCmd',
  STUDY_EXTENSIONS: 'study:extensions',
  STUDY_EXTENSION_ADD: 'study:extensionAdd',
  STUDY_EXTENSION_CMD: 'study:extensionCmd',
  STUDY_EXTENSION_OPEN: 'study:extensionOpen',
  STUDY_PAGE_ACTION: 'study:pageAction',
  STUDY_SCREENSHOT: 'study:screenshot',
} as const;

export const EV = {
  STATE: 'ev:state',
  TABS: 'ev:tabs',
  SETTINGS: 'ev:settings',
  FAVORITES: 'ev:favorites',
  HISTORY: 'ev:history',
  TOAST: 'ev:toast',
  STUDY: 'ev:study',
  FIND: 'ev:find',
  READING: 'ev:reading',
  EXTENSIONS: 'ev:extensions',
  PAGE_MENU: 'ev:pageMenu',
  FOCUS_SEARCH: 'ev:focusSearch',
  GEOM: 'ev:geom',
  SHOT: 'ev:shot',
  ACCEL: 'ev:accel',
} as const;

export type Channel = (typeof CH)[keyof typeof CH];
export type EventName = (typeof EV)[keyof typeof EV];
