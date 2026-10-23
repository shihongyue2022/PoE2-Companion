import { useEffect, useState } from 'react';
import { HOSTED_WORKBENCH } from './workbenchRuntime';
import { readOriginalLocalPob } from './pobRepair';
import { needsPobResistanceRepair, supplementPobResistances } from './pobResistanceRepair';
import { useSavedLoadout, writeSavedLoadout } from './loadoutStore';

/** Repair legacy metadata once per saved snapshot; CAS prevents overwriting edits
 * made in this tab or another tab while the original XML is being read. */
export default function PobResistanceSync({ active = true }: { active?: boolean }) {
  const saved = useSavedLoadout();
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (HOSTED_WORKBENCH || !active || saved.error || !saved.state.source?.fileName || !needsPobResistanceRepair(saved.state)) return;
    const task = new AbortController();
    void (async () => {
      try {
        const xml = await readOriginalLocalPob(saved.state.source!, task.signal, true);
        if (task.signal.aborted) return;
        const next = supplementPobResistances(saved.state, xml);
        if (JSON.stringify(next.source?.reference) === JSON.stringify(saved.state.source?.reference)) return;
        const error = writeSavedLoadout(next, saved.raw);
        if (error) throw new Error(error);
      } catch (failure) {
        if (!task.signal.aborted) setMessage(failure instanceof Error ? failure.message : '补读抗性失败，请重新读取 PoB2 存档。');
      }
    })();
    return () => task.abort();
  }, [active, saved]);
  return needsPobResistanceRepair(saved.state) && message ? <p className="lo-footnote" role="status">抗性补读：{message}</p> : null;
}
