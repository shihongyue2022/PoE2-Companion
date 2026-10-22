import { loadEngine } from '../lib/engine';
import { runSolve } from '../lib/solve';
import type { WorkbenchWorkerRequest, WorkbenchWorkerResponse } from './compute';

self.onmessage = async ({ data }: MessageEvent<WorkbenchWorkerRequest>) => {
  try {
    const loaded = await loadEngine();
    const currency = { ...loaded.prices.currency };
    for (const [key, value] of Object.entries(data.overrides)) {
      if (!Number.isFinite(value) || value <= 0 || !(key in currency)) throw new Error('材料价格必须为大于零的数字。');
      currency[key] = value;
    }
    const engine = { ...loaded, prices: { ...loaded.prices, currency } };
    const result = runSolve(engine, data.request, (progress) => {
      self.postMessage({ type: 'progress', progress } satisfies WorkbenchWorkerResponse);
    });
    self.postMessage({ type: 'result', result } satisfies WorkbenchWorkerResponse);
  } catch (error) {
    self.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) } satisfies WorkbenchWorkerResponse);
  }
};
