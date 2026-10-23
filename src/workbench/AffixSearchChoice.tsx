import type { EquipmentTradeRow } from './genericEquipmentTrade';
import type { RollGuide } from './searchGuidance';
import './presetControls.css';
import { useState } from 'react';

export function affixSearchChoices(row: EquipmentTradeRow, guide?: RollGuide) {
  const tidy = (n: number) => String(Math.round(n * 1e6) / 1e6);
  const boundary = (value: number) => guide?.lowerIsBetter ? { min: '', max: tidy(value) } : { min: tidy(value), max: '' };
  const choices = [{ id: 'auto', label: row.presenceOnly || row.referenceOnly ? '保留此机制' : '系统择优，不设单项门槛', min: '', max: '' }];
  if (row.actualValue !== undefined && !row.suggested && !row.presenceOnly && !row.referenceOnly) choices.push({ id: 'current', label: '不低于当前装备', ...boundary(row.actualValue) });
  if (guide?.safe) {
    for (const tier of (guide.tiers ?? []).filter((entry) => entry.tier <= 3)) choices.push({ id: `t${tier.tier}`, label: `T${tier.tier} 起步 · ${tier.min === undefined ? '≤' : '≥'} ${tier.min ?? tier.max} · 需物等 ${tier.requiredLevel}`, min: tier.min === undefined ? '' : tidy(tier.min), max: tier.max === undefined ? '' : tidy(tier.max) });
    if (!guide.tiers?.length && guide.tierFloor) choices.push({ id: 't1', label: 'T1 起步', min: guide.tierFloor.min === undefined ? '' : tidy(guide.tierFloor.min), max: guide.tierFloor.max === undefined ? '' : tidy(guide.tierFloor.max) });
    if (guide.top) {
      const { min, max } = guide.top;
      choices.push({ id: 'high', label: guide.unique ? '传奇高 roll · 已知范围 90%' : 'T1 高 roll · 阶层范围 90%', ...boundary(guide.lowerIsBetter ? min + (max - min) * .1 : min + (max - min) * .9) });
      choices.push({ id: 'max', label: guide.unique ? '传奇满 roll' : 'T1 满 roll', ...boundary(guide.lowerIsBetter ? min : max) });
    }
  }
  return choices;
}
export default function AffixSearchChoice({ row, guide, onChoose }: { row: EquipmentTradeRow; guide?: RollGuide; onChoose: (patch: Pick<EquipmentTradeRow, 'min' | 'max'>) => void }) {
  const [picked, setPicked] = useState<{ id: string; min: string; max: string }>();
  if (row.locked) return null;
  const choices = affixSearchChoices(row, guide);
  const selected = picked && picked.min === row.min && picked.max === row.max && choices.some((choice) => choice.id === picked.id && choice.min === row.min && choice.max === row.max)
    ? picked.id : choices.find((choice) => choice.min === row.min && choice.max === row.max)?.id ?? 'custom';
  return <label className="wb-affix-choice">搜索档位<select aria-label={`${row.label}搜索档位`} disabled={!row.enabled} value={selected} onChange={(event) => {
    const choice = choices.find((entry) => entry.id === event.target.value); if (choice) { setPicked(choice); onChoose({ min: choice.min, max: choice.max }); }
  }}>{choices.map((choice) => <option key={choice.id} value={choice.id}>{choice.label}</option>)}{selected === 'custom' && <option value="custom">当前方案／高级数值</option>}</select></label>;
}
