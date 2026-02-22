declare global {
  interface Window {
    Chart: new (
      ctx: CanvasRenderingContext2D,
      config: Record<string, unknown>
    ) => {
      data: { labels: string[]; datasets: Array<{ data: number[] }> };
      update: (mode?: string) => void;
      destroy?: () => void;
    };
    FaceMesh: new (config: { locateFile: (file: string) => string }) => {
      setOptions: (opts: {
        maxNumFaces: number;
        refineLandmarks: boolean;
        minDetectionConfidence: number;
      }) => void;
      onResults: (cb: (results: FaceMeshResults) => void) => void;
      send: (input: { image: HTMLVideoElement }) => Promise<void>;
    };
  }
}

export interface FaceMeshResults {
  image: HTMLVideoElement | HTMLImageElement;
  multiFaceLandmarks?: Array<Array<{ x: number; y: number; z?: number }>>;
}
