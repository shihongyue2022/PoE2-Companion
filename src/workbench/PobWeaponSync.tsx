import { useEffect, useState } from 'react';
import { useSavedLoadout, writeSavedLoadout } from './loadoutStore';
import { readOriginalLocalPob } from './pobRepair';
import { supplementPobWeaponSets } from './pobWeaponSets';

export default function PobWeaponSync({ active = true }: { active?: boolean }) {
  const saved = useSavedLoadout(), [message, setMessage] = useState('');
  const needed = !saved.state.weaponSets && !!saved.state.source?.fileName && !!saved.state.source?.savedAt;
  useEffect(() => {
    if (!active || saved.error || !needed) return;
    const task = new AbortController();
    void (async () => {
      try {
        const xml = await readOriginalLocalPob(saved.state.source!, task.signal, true);
        if (task.signal.aborted) return;
        const next = supplementPobWeaponSets(saved.state, xml);
        const error = writeSavedLoadout(next, saved.raw); if (error) throw new Error(error);
      } catch (reason) { if (!task.signal.aborted) setMessage(reason instanceof Error ? reason.message : '第二套武器补读失败，请重新预览 PoB2 存档。'); }
    })();
    return () => task.abort();
  }, [active, saved, needed]);
  return needed && message ? <p className="lo-footnote" role="status">两套武器补读：{message}</p> : null;
}
