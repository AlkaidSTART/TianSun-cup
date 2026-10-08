export interface DemoMetric { value: number; unit: string; normalRange: [number, number] }
export interface DemoAnimal {
  kind: 'animal'; id: string; type: string; breed: string; ownerName: string;
  areaId: string; areaName: string; status: string; healthStatus: string;
  longitude: number; latitude: number; recordedAt: string;
  metrics: { bodyTemperature: DemoMetric; heartRate: DemoMetric; rumination: DemoMetric };
  lastOnlineTime: string | null; offlineDuration: number | null; dataSource: 'demo';
}
export interface DemoArea {
  kind: 'area'; id: string; name: string; quality: string; capacity: number;
  currentLoad: number; pressure: number | null; overloaded: boolean; dataSource: 'demo';
}
export interface DemoSite { kind: 'site'; id: string; name: string; dataSource: 'demo' }
export type SceneSelection = DemoAnimal | DemoArea | DemoSite;
export type PreviewState = 'loading' | 'ready' | 'empty' | 'error';
export type SceneEvent =
  | { type: 'loading'; message: string }
  | { type: 'ready'; terrainAvailable: boolean }
  | { type: 'error'; title: string; message: string }
  | { type: 'service'; state: string; message: string }
  | { type: 'state'; time: string; day: number; phase: string; manualPaused: boolean; total: number }
  | { type: 'selection'; selection: SceneSelection | null }
  | { type: 'preview'; state: PreviewState; message: string };
