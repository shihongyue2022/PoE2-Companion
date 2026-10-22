export interface LocalGameData {
  found: boolean;
  location?: string;
  configuration?: {
    language?: string; renderer?: string; width?: number; height?: number;
    mode: 'exclusive' | 'borderless' | 'windowed' | 'unknown';
    controls: 'wasd' | 'mouse' | 'unknown'; activeFilter?: string;
    altHighlight: boolean; eActions: string[];
  };
  plans: { id?: string; fileName: string; name: string; author?: string; ascendancy?: string;
    passiveCount: number; skillCount: number; modifiedAt: string }[];
  savedTradeSearchFile: boolean;
  warnings: string[];
}
