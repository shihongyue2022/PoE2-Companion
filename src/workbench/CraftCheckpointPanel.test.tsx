import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { loadPatch } from '../../packages/engine/src/loadPatch';
import { listMods, type ExistingItem } from '../lib/engine';
import { CraftCheckpointPanel } from './CraftCheckpointPanel';
import type { CheckpointReview, CraftCheckpoint } from './craftCheckpoint';

const data = loadPatch('data/patches/0.5.0');
const list = listMods(data, 'Rings');
const mods = new Map([...list.prefixes, ...list.suffixes].map((mod) => [mod.id, mod]));
const current: ExistingItem = {
  baseId: 'Rings', level: 82, rarity: 'rare',
  prefixes: [{ modId: 'Rings/IncreasedLife', tierDisplay: 2 }],
  suffixes: [{ modId: 'Rings/ColdResistance', tierDisplay: 3 }, { modId: 'Rings/ItemFoundRarityIncrease', tierDisplay: 1, fractured: true }],
};

describe('explicit crafting checkpoint controls', () => {
  it('requires an explicit removal target, locks a copied snapshot, and sends fresh pasted text for validation', () => {
    const capture = vi.fn();
    const check = vi.fn();
    function Harness() {
      const [anchor, setAnchor] = useState<CraftCheckpoint | null>(null);
      return <CraftCheckpointPanel item={current} baseName="Breach Ring" targets={[]} mods={mods} anchor={anchor} review={null}
        onAnchor={(next) => { capture(next); setAnchor(next); }} onCheckText={check} onRecalculate={vi.fn()} />;
    }
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: '设置制作锚点' }));
    expect(screen.getByRole('button', { name: '锁定本步目标' })).toBeDisabled();
    const fracturedRemoval = screen.getByRole('checkbox', { name: /允许移除：.*稀有度/ });
    const fracturedPreserve = screen.getByRole('checkbox', { name: /必须保留：.*稀有度/ });
    expect(fracturedRemoval).toBeDisabled();
    expect(fracturedPreserve).toBeDisabled();
    expect(fracturedPreserve).toBeChecked();
    fireEvent.click(screen.getByRole('checkbox', { name: /允许移除：.*冰冷抗性/ }));
    fireEvent.click(screen.getByRole('button', { name: '锁定本步目标' }));
    const locked = capture.mock.calls[0]![0] as CraftCheckpoint;
    expect(locked).toMatchObject({ mode: 'remove', removeModIds: ['Rings/ColdResistance'], preserveModIds: ['Rings/ItemFoundRarityIncrease'] });
    expect(locked.before).not.toBe(current);
    expect(locked.before.suffixes[0]).not.toBe(current.suffixes[0]);
    expect(screen.getByRole('button', { name: '校验本步结果' })).toBeDisabled();
    fireEvent.change(screen.getByRole('textbox', { name: '操作后装备文本' }), { target: { value: '游戏操作后的完整文本' } });
    fireEvent.click(screen.getByRole('button', { name: '校验本步结果' }));
    expect(check).toHaveBeenCalledWith('游戏操作后的完整文本');
    expect(capture).toHaveBeenCalledTimes(1);
  });

  it('blocks recalculation for unresolved or mismatched input and permits an explicit repair calculation after a miss', () => {
    const anchor: CraftCheckpoint = {
      id: 'test', createdAt: new Date().toISOString(), before: current, baseName: 'Breach Ring',
      mode: 'goals', action: 'Chaos', removeModIds: [], preserveModIds: [], targets: [{ modId: 'Rings/IncreasedLife', tierDisplay: 1 }],
    };
    const recalculate = vi.fn();
    const incomplete: CheckpointReview = { status: 'unresolved', title: '先核对文本', details: ['存在未识别词缀。'], canContinue: false };
    const props = { item: current, baseName: 'Breach Ring', targets: anchor.targets, mods, anchor, onAnchor: vi.fn(), onCheckText: vi.fn(), onRecalculate: recalculate };
    const { rerender } = render(<CraftCheckpointPanel {...props} review={incomplete} />);
    expect(screen.getByRole('button', { name: '重新计算后续策略' })).toBeDisabled();
    rerender(<CraftCheckpointPanel {...props} review={{ ...incomplete, status: 'mismatch' }} />);
    expect(screen.getByRole('button', { name: '重新计算后续策略' })).toBeDisabled();
    rerender(<CraftCheckpointPanel {...props} review={{ status: 'missed', title: '本步未达标', details: ['需要按真实状态修复。'], canContinue: false }} />);
    expect(screen.getByRole('button', { name: '重新计算后续策略' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: '重新计算后续策略' }));
    expect(recalculate).toHaveBeenCalledOnce();
  });

  it('starts a fresh unlocked draft when the item and goals change, without retaining old removal choices', () => {
    const props = { item: current, baseName: 'Breach Ring', targets: [], mods,
      anchor: null, review: null, onAnchor: vi.fn(), onCheckText: vi.fn(), onRecalculate: vi.fn() };
    const { rerender } = render(<CraftCheckpointPanel {...props} />);
    fireEvent.click(screen.getByRole('button', { name: '设置制作锚点' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /允许移除：.*冰冷抗性/ }));
    fireEvent.change(screen.getByRole('textbox', { name: '自定义通货组合' }), { target: { value: '旧装备的操作备注' } });
    expect(screen.getByRole('button', { name: '锁定本步目标' })).toBeEnabled();
    const replacement: ExistingItem = { ...current, level: 83,
      prefixes: [{ modId: 'Rings/IncreasedLife', tierDisplay: 1 }],
      suffixes: [{ modId: 'Rings/ColdResistance', tierDisplay: 2 }],
    };
    rerender(<CraftCheckpointPanel {...props} item={replacement} baseName="Ruby Ring"
      targets={[{ modId: 'Rings/IncreasedLife', tierDisplay: 1 }]} />);
    expect(screen.getByRole('combobox', { name: '计划使用的通货' })).toHaveValue('剥离石');
    expect(screen.getByRole('checkbox', { name: /允许移除：.*冰冷抗性/ })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: /必须保留：.*最大生命/ })).toBeChecked();
    expect(screen.queryByRole('checkbox', { name: /必须保留：.*稀有度/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '锁定本步目标' })).toBeDisabled();
    expect(screen.getByText(/当前快照：.*物等 83/)).toBeInTheDocument();
    expect(props.onAnchor).not.toHaveBeenCalled();
  });

  it('opens a fresh configuration immediately when resetting a locked checkpoint and clears the old pasted result', () => {
    const previous: CraftCheckpoint = {
      id: 'previous-checkpoint', createdAt: '2026-10-22T01:00:00.000Z', before: current, baseName: 'Breach Ring',
      mode: 'remove', action: 'Annulment', removeModIds: ['Rings/ColdResistance'], preserveModIds: [], targets: [],
    };
    const capture = vi.fn();
    function Harness() {
      const [anchor, setAnchor] = useState<CraftCheckpoint | null>(previous);
      return <CraftCheckpointPanel item={current} baseName="Breach Ring" targets={[]} mods={mods}
        anchor={anchor} review={null} suggestedAction="Annulment" onAnchor={(next) => { capture(next); setAnchor(next); }}
        onCheckText={vi.fn()} onRecalculate={vi.fn()} />;
    }
    render(<Harness />);
    fireEvent.change(screen.getByRole('textbox', { name: '操作后装备文本' }), { target: { value: '上一次操作的旧文本' } });
    fireEvent.click(screen.getByRole('button', { name: '重新设定锚点' }));
    expect(capture).toHaveBeenLastCalledWith(null);
    expect(screen.getByRole('combobox', { name: '计划使用的通货' })).toHaveValue('剥离石');
    expect(screen.queryByRole('button', { name: '设置制作锚点' })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: '操作后装备文本' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: /允许移除：.*冰冷抗性/ }));
    fireEvent.click(screen.getByRole('button', { name: '锁定本步目标' }));
    const next = capture.mock.calls[capture.mock.calls.length - 1]![0] as CraftCheckpoint;
    expect(next.id).not.toBe(previous.id);
    expect(next.before).not.toBe(current);
    expect(screen.getByRole('textbox', { name: '操作后装备文本' })).toHaveValue('');
    expect(screen.getByRole('button', { name: '校验本步结果' })).toBeDisabled();
  });
});
