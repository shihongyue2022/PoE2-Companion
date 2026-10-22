import { useEffect, useRef, useState } from 'react';
import { activeGems, damageComposition, gemInfo, mainGem, type PobCombat, type PobGem, type PobSkillGroup } from './pobCombat';
import { equipmentComposition, supplementPobCombat } from './characterAnalysis';
import { METRICS, type LoadoutSlot, type LoadoutState } from './loadout';
import { sourceIsCurrent } from './loadoutIntegration';
import { readOriginalLocalPob } from './pobRepair';
import { localizeEquipmentName } from './genericEquipment';
import Icon from './WorkbenchIcon';
import './characterAnalysis.css';

const format = (value: number) => value.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
const tagLabels: Record<string, string> = { attack: '攻击', spell: '法术', projectile: '投射物', melee: '近战', lightning: '闪电', fire: '火焰', cold: '冰冷', physical: '物理', chaos: '混沌', minion: '召唤物', area: '范围' };
function GemBadge({ gem, inactive = false }: { gem: PobGem; inactive?: boolean }) {
  const info = gemInfo(gem);
  return <span className={`ca-gem${info.support ? ' support' : ''}${inactive ? ' inactive' : ''}`} title={`${gem.name}\n${gem.id || gem.skillId}`}>
    <b>{info.label}</b><small>{info.support ? '辅助' : '技能'} · 等级 {gem.level}{gem.quality ? ` · 品质 ${gem.quality}%` : ''}{inactive ? ' · 未启用' : ''}</small>
  </span>;
}
function Group({ group, secondWeapons }: { group: PobSkillGroup; secondWeapons: boolean }) {
  const enabled = activeGems(group, secondWeapons);
  return <div className="ca-group"><span className="lo-footnote">#{group.index} · {group.source === 'item' ? '装备赋予' : group.source === 'tree' ? '天赋赋予' : '宝石配置'}{group.fullDps ? ' · 纳入全技能汇总' : ''}</span>
    <div className="ca-gems">{group.gems.map((gem, index) => <GemBadge key={index} gem={gem} inactive={!enabled.includes(gem)} />)}</div>
  </div>;
}
function Damage({ combat, current }: { combat: PobCombat; current: boolean }) {
  const gem = mainGem(combat), damage = damageComposition(combat);
  const parts = [{ label: '命中 DPS', value: damage.hit, className: 'hit' }, { label: '持续伤害 DPS（含异常）', value: damage.dot, className: 'dot' }];
  const knownTotal = (damage.hit ?? 0) + (damage.dot ?? 0);
  return <section aria-label="技能伤害构成">
    <h4>{gem ? gemInfo(gem).label : '主技能'} · 保存时伤害{!current ? '（快照待更新）' : ''}</h4>
    <div className="ca-stat-grid"><div><span>主技能综合 DPS</span><strong>{damage.combined === undefined ? '未保存' : format(damage.combined)}</strong></div>
      <div><span>平均命中伤害</span><strong>{combat.stats.AverageDamage === undefined ? '未保存' : format(combat.stats.AverageDamage)}</strong></div>
      <div><span>命中率 / 暴击率</span><strong>{combat.stats.HitChance === undefined ? '—' : `${format(combat.stats.HitChance)}%`} / {combat.stats.CritChance === undefined ? '—' : `${format(combat.stats.CritChance)}%`}</strong></div></div>
    <div className="ca-damage-parts">{parts.map((part) => <div key={part.label}><span>{part.label}</span><b>{part.value === undefined ? '未保存' : format(part.value)}</b>
      <div className="ca-bar-track"><span className={part.className} style={{ width: `${knownTotal > 0 ? (part.value ?? 0) / knownTotal * 100 : 0}%` }} /></div></div>)}</div>
    <p className="lo-footnote">{[['点燃', damage.ignite], ['流血', damage.bleed], ['中毒', damage.poison]].flatMap(([label, value]) => typeof value === 'number' && value > 0 ? [`${label} ${format(value)}`] : []).join(' · ') || '没有单独保存的异常伤害数值'}。异常已包含在持续伤害内，不重复相加。</p>
    {combat.stats.Speed !== undefined && <p className="lo-footnote">使用频率：{format(combat.stats.Speed)}/秒{combat.stats.CritMultiplier !== undefined ? ` · 暴击伤害倍率：${format(combat.stats.CritMultiplier)} 倍` : ''}</p>}
    <p className="lo-footnote">全技能汇总：{damage.full === undefined ? '未保存' : damage.full > 0 ? format(damage.full) : '未计入全技能汇总（保存值为 0，不表示角色伤害为零）'}。命中与持续伤害按各自保存值展示；综合值还可能包含扑杀、分身等效果。</p>
    {!!combat.fullSkills.length && <details><summary>纳入汇总的技能</summary>{combat.fullSkills.map((row, index) => <p key={index}>{localizeEquipmentName(row.name)}：{format(row.dps)}</p>)}</details>}
    <p className="lo-footnote">此文件未提供可核对的主技能物理／火焰／冰冷／闪电／混沌拆分，暂不显示元素占比。技能标签只代表类型，不代表伤害比例。</p>
    <p className="lo-footnote">PoB2 保存时的计算快照，受天赋、技能和配置影响；工坊换装不会重算技能伤害。请在 PoB2 更新角色、核对配置并保存后补读。</p>
  </section>;
}

export default function CharacterAnalysisPanel({ state, onSave, onSelectSlot }: { state: LoadoutState; onSave: (state: LoadoutState) => boolean; onSelectSlot: (slot: LoadoutSlot) => void }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [metricKey, setMetricKey] = useState('energyShield'), [viewSet, setViewSet] = useState('');
  const latest = useRef(state);
  useEffect(() => { latest.current = state; }, [state]);
  const source = state.source, combat = source?.combat, gem = combat && mainGem(combat);
  const current = !!combat?.matchesEquipment && sourceIsCurrent(state);
  const selectedSet = combat?.sets.find((set) => set.id === viewSet) ?? combat?.sets.find((set) => set.id === combat.activeSet);
  const mainGroup = selectedSet?.id === combat?.activeSet ? selectedSet?.groups.find((group) => group.index === combat?.mainGroup) : undefined;
  const rows = equipmentComposition(state), metrics = METRICS.filter((metric) => rows.some((row) => row.values[metric.key] !== undefined && row.values[metric.key] !== 0));
  const metric = metrics.find((entry) => entry.key === metricKey) ?? metrics[0];
  const contributions = metric ? rows.filter((row) => row.values[metric.key] !== undefined && row.values[metric.key] !== 0) : [];
  const maximum = metric ? Math.max(1, ...contributions.map((row) => Math.abs(row.values[metric.key]!))) : 1;
  async function read(xml?: string) {
    if (!source || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const input = xml ?? await readOriginalLocalPob(source, AbortSignal.timeout(15000));
      if (latest.current !== state) throw new Error('装备方案已变化，请重新补读。');
      const next = supplementPobCombat(state, input);
      if (onSave(next)) setNotice('已补读技能、辅助宝石和保存时伤害；当前装备与配装目标保持不变。');
    } catch (reason) { setError(reason instanceof Error ? reason.message : '读取失败，请选择原 XML 文件。'); }
    finally { setBusy(false); }
  }
  return <details className="lo-summary ca-panel"><summary><Icon name="chart" size={17} />技能与构成{gem ? ` · ${gemInfo(gem).label}` : ''}</summary>
    {source ? <div className="lo-actions"><button type="button" className="wb-button" disabled={busy || !source.fileName} onClick={() => { void read(); }}>{busy ? '正在补读…' : '补读原 PoB2 的技能与伤害'}</button>
      <label className="wb-button ca-file">选择原 XML<input type="file" accept=".xml" disabled={busy} aria-label="补读技能与伤害 XML" onChange={(event) => {
        const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
        if (file.size > 3_000_000) { setError('文件超过 3 MB。'); return; }
        void file.text().then((xml) => read(xml)).catch(() => setError('无法读取 XML 文件。'));
      }} /></label></div> : <p className="lo-footnote">先从上方整套导入 PoB2，即可读取主技能、辅助宝石和保存时伤害。</p>}
    {error && <p className="lo-alert" role="alert">{error}</p>}{notice && <p role="status" className="lo-notice">{notice}</p>}
    {combat ? <>
      <p className="lo-footnote">{current ? '装备与 PoB2 保存快照对应' : '装备或武器组与伤害快照不同，请更新 PoB2；以下保留原方案参考'} · 技能与伤害取自最近读取的 XML。</p>
      {mainGroup && <section aria-label="主技能与辅助宝石"><h4>主技能 · {gem ? gemInfo(gem).label : `第 ${combat.mainGroup} 组`}</h4>
        {gem && <p className="lo-footnote">{gemInfo(gem).tags.map((tag) => tagLabels[tag] ?? tag).join(' · ')}</p>}
        <Group group={mainGroup} secondWeapons={source?.secondWeapons ?? false} /></section>}
      <Damage combat={combat} current={current} />
      <details><summary>全部技能配置 · {selectedSet?.groups.length ?? 0} 组</summary>
        {combat.sets.length > 1 && <select aria-label="查看技能组方案" value={selectedSet?.id} onChange={(event) => setViewSet(event.target.value)}>{combat.sets.map((set, index) => <option key={set.id} value={set.id}>技能方案 {index + 1}{set.id === combat.activeSet ? '（保存时启用）' : ''}</option>)}</select>}
        <p className="lo-footnote">灰色为未启用或另一套武器专属。查看其他技能组不会重新计算伤害；上方伤害始终对应保存时主技能。</p>
        {selectedSet?.groups.map((group) => <Group key={group.index} group={group} secondWeapons={source?.secondWeapons ?? false} />)}
      </details>
    </> : source && <p className="lo-footnote">这条旧记录尚未包含技能资料，请点击补读；无需重新输入装备。</p>}
    <section aria-label="装备构成"><h4>装备构成 · {rows.length} 件</h4>
      <p className="lo-footnote">传奇 {rows.filter((row) => row.rarity === 'unique').length} 件 · 稀有 {rows.filter((row) => row.rarity === 'rare').length} 件 · 药剂／护符 {rows.filter((row) => row.consumable).length} 件（不计入常驻合计）</p>
      {metric && <><label>按属性查看来源<select aria-label="装备贡献属性" value={metric.key} onChange={(event) => setMetricKey(event.target.value)}>{metrics.map((entry) => <option key={entry.key} value={entry.key}>{entry.label}</option>)}</select></label>
        <div className="ca-contributions">{contributions.map((row) => <button type="button" key={row.slot} onClick={() => onSelectSlot(row.slot)} title={`${row.name} · 点击查看装备`}>
          <span>{row.label}</span><div className="ca-bar-track"><span style={{ width: `${Math.abs(row.values[metric.key]!) / maximum * 100}%` }} /></div><b>{format(row.values[metric.key]!)}{metric.unit}</b>
        </button>)}</div></>}
      <p className="lo-footnote">仅展示可读取的装备贡献。全域百分比单独列出；武器 DPS 分件展示，不能作为各装备对角色 DPS 的贡献比例。</p>
      <details><summary>影响伤害的装备词缀 · {rows.reduce((total, row) => total + row.offense.length, 0)} 项</summary>
        <p className="lo-footnote">按词缀原生英文归类，显示中文说明；列出伤害来源与机制，不把不同乘区和条件效果直接相加。</p>
        {rows.filter((row) => row.offense.length).map((row) => <div className="ca-group" key={row.slot}><button type="button" className="wb-text-button" onClick={() => onSelectSlot(row.slot)}>{row.label} · {row.name} →</button>
          {row.offense.map((affix, index) => <p className="lo-footnote" key={index}><b>{affix.family}</b> · {affix.label}</p>)}</div>)}
      </details>
      <details><summary>逐件装备与机制</summary>{rows.map((row) => <div className="ca-group" key={row.slot}><button type="button" className="wb-text-button" onClick={() => onSelectSlot(row.slot)}>{row.label} · {row.name} →</button>
        {!!row.effects.length && <p className="lo-footnote">{row.effects.join('；')}</p>}{row.uncounted > 0 && <small className="lo-footnote">{row.uncounted} 项效果尚不能直接加总，详情中核对。</small>}</div>)}</details>
    </section>
  </details>;
}
