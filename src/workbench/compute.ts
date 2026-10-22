import type { SolveProgress, SolveRequest, SolveResult } from '../lib/solve';

export interface WorkbenchWorkerRequest {
  request: SolveRequest;
  overrides: Record<string, number>;
}
export type WorkbenchWorkerResponse =
  | { type: 'progress'; progress: SolveProgress }
  | { type: 'result'; result: SolveResult }
  | { type: 'error'; message: string };

export function computeWorkbench(
  request: SolveRequest, overrides: Record<string, number>, onProgress: (progress: SolveProgress) => void,
): { promise: Promise<SolveResult>; cancel: () => void } {
  const worker = new Worker(new URL('./compute.worker.ts', import.meta.url), { type: 'module' });
  let rejectPromise: (reason: Error) => void = () => {};
  let settled = false;
  const promise = new Promise<SolveResult>((resolve, reject) => {
    rejectPromise = reject;
    worker.onmessage = ({ data }: MessageEvent<WorkbenchWorkerResponse>) => {
      if (data.type === 'progress') { onProgress(data.progress); return; }
      settled = true;
      worker.terminate();
      if (data.type === 'result') resolve(data.result);
      else reject(new Error(data.message));
    };
    worker.onerror = (event) => {
      settled = true;
      worker.terminate();
      reject(new Error(event.message || '计算线程加载失败，请刷新后重试。'));
    };
    worker.postMessage({ request, overrides } satisfies WorkbenchWorkerRequest);
  });
  return {
    promise,
    cancel: () => {
      if (settled) return;
      settled = true;
      worker.terminate();
      rejectPromise(new Error('计算已取消。'));
    },
  };
}
