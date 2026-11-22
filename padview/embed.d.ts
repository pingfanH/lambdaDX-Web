export interface PadviewCenterRow {kind: string; label: string; value: string; size: number}

/** Detail of the mount element's padview-message event for a playback update. */
export interface PadviewStateMessage {
  type: 'padview:state';
  time: number;
  playing: boolean;
  noCore: boolean;
  title: string;
  artist: string;
  bpm: number;
  dxScore: number;
  maxDxScore: number;
  achievement: number;
  combo: number;
  judged: number;
  total: number;
  center: PadviewCenterRow[];
  subtitles: {text: string; opacity: number; position: [number, number]; size: number; font: string}[];
  warnings: string[];
  blocks: {index: number; text: string; progress: number | null; center?: PadviewCenterRow[]}[];
}

/** Direct mounts accept DOM elements. For iframe postMessage use strings, File/Blob or bytes. */
export type PadviewMediaSource = string | URL | HTMLInputElement | HTMLImageElement | HTMLVideoElement
  | Blob | ArrayBuffer | ArrayBufferView;
export interface PadviewLoadOptions {
  /** Original ChartDoc text, to preserve 64-bit note IDs exactly. */
  chartJson?: string;
  presentation?: object;
  viewerProfile?: object | null;
  cover?: PadviewMediaSource | null;
  video?: PadviewMediaSource | null;
}
export interface PadviewClockOptions {
  playing?: boolean;
  seek?: boolean;
  rate?: number;
  sentAt?: number;
  clockSource?: 'media' | 'silent';
  audioBoundary?: number | null;
}
export type PadviewBackgroundMessage =
  | ({type: 'padview:load'; chart: object} & PadviewLoadOptions)
  | {type: 'padview:cover' | 'padview:video'; source: PadviewMediaSource | null};
export type PadviewMediaError = {type: 'padview:media-error'; kind: 'cover' | 'video'; message: string};
export interface PadviewController {
  /** Resolves when this pane accepts charts. Rejects on startup failure or early disposal. */
  readonly ready: Promise<{type: 'padview:ready'; capabilities: {playable: boolean; htmlHud: boolean; backgroundMedia: boolean}; build: {id: string | null}}>;
  load(chart: object, options?: PadviewLoadOptions): void;
  /** Last supplied source; assign null to remove. Loading a new chart clears omitted media. */
  cover: PadviewMediaSource | null;
  video: PadviewMediaSource | null;
  /** Position in chart seconds. Defaults to paused. The host drives the playback clock. */
  setTime(time: number, options?: PadviewClockOptions): void;
  /** Result arrives as padview:parsed-chart with the same request ID. */
  parseSource(request: {request: number; name: string; source: string; diff?: number}): void;
  setPlayable(playable: boolean): void;
  requestState(): void;
  requestSettings(): void;
  configure(options: {patch: Record<string, unknown>} | {reset: true} | {restoreChart: true} | {presentation: object}): void;
  saveSettings(): void;
  openTemplates(): void;
  editInfo(): void;
  /** Compatibility with the existing message protocol. */
  send(message: PadviewBackgroundMessage): void;
  send(message: Record<string, unknown>): void;
  readonly audio?: {pause(): void; unlock(media?: HTMLAudioElement): Promise<void>;
    watchPlayback(media: HTMLAudioElement, active: () => boolean, interrupt: (message:string) => void): () => void};
  readonly startup?: { build: string; shared: boolean; status: string; readyMs: number | null; totalMs: number | null;
    chartMs: number | null; phases: {phase: string; ms: number}[]; operations: {phase: string; startMs: number; ms: number}[] };
  dispose(): void;
}
export function previewStartTime(chart: {bpm?: number; bpms?: {measure: number; bpm: number}[]; clock_count?: number}, countIn?: boolean): number;
export function mountPadview(element: HTMLElement, options?: {
  /** Defaults to true; pass false for a separate information panel. */
  transparent?: boolean;
  /** Render the selectable information blocks as a read-only grid in this element. */
  blocksContainer?: HTMLElement | null;
  /** Defaults to "stage" on the primary pane; an empty string disables publishing. */
  hudChannel?: string;
  /** Base assets for the single shared engine. Defaults to viewer (automatic playback). Select player for manual input. */
  assetPack?: 'player' | 'viewer';
  /** Synchronize with /api/padview/config. Defaults to true for player and false for viewer. */
  sharedConfig?: boolean | 'read-only';
  /** Used when a shared profile is unavailable, before the first frame. */
  defaultProfile?: () => Promise<{presentation: object; playable?: boolean} | null>;
  comparison?: boolean; snapshot?: string; fetcher?: typeof fetch; defaultNoCore?: boolean;
}): PadviewController;
