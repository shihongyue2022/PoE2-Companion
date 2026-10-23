import { useEffect, useRef, useState } from 'react';
import type { LocalGameData } from './gameData';
import { translatePobLabel } from './localization';
import { BUILD_FAMILIES, isBuildMainSkill, profileForSkill, type BuildAnalysis, type BuildProfile } from './buildProfile';
import { localizeEquipmentName, localizeEquipmentStat } from './genericEquipment';
import PresetNumberInput, { budgetPresets } from './PresetNumberInput';
import { HOSTED_WORKBENCH, LOCAL_SERVICE_MESSAGE } from './workbenchRuntime';

export default function LocalGameDataPanel(props: Parameters<typeof LocalGameDataClient>[0]) {
  return HOSTED_WORKBENCH ? <p className="lo-footnote">{LOCAL_SERVICE_MESSAGE}</p> : <LocalGameDataClient {...props} />;
}
function LocalGameDataClient({ characterLevel, onBuild }: { characterLevel?: number; onBuild?: (profile: BuildProfile) => void }) {
  const [data, setData] = useState<LocalGameData | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  const [analysis, setAnalysis] = useState<BuildAnalysis | null>(null), [mainKey, setMainKey] = useState('');
  const [level, setLevel] = useState(''), [weaponSet, setWeaponSet] = useState(1);
  useEffect(() => () => request.current?.abort(), []);
  async function inspect() {
    if (busy) return;
    setAnalysis(null);
    const controller = new AbortController(); request.current = controller; setBusy(true); setError('');
    try {
      const response = await fetch('/api/workbench/game-data', { signal: controller.signal });
      if (!response.ok) throw new Error('本机游戏配置接口未就绪，请重新启动工坊。');
      const value = await response.json() as LocalGameData & { ok?: boolean };
      if (!value.ok || !Array.isArray(value.plans) || !Array.isArray(value.warnings)) throw new Error('游戏配置摘要格式无效。');
      setData(value);
    } catch (reason) { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : '游戏配置读取失败。'); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }
  async function readBuild(id: string) {
    if (busy) return;
    const controller = new AbortController(); request.current?.abort(); request.current = controller;
    setBusy(true); setError(''); setAnalysis(null);
    try {
      const response = await fetch('/api/workbench/game-build', { method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, level: level ? Number(level) : characterLevel ?? 100, weaponSet }) });
      const result = await response.json() as { ok: boolean; analysis?: BuildAnalysis; error?: { message?: string } };
      if (!response.ok || !result.ok || !result.analysis) throw new Error(result.error?.message ?? '无法分析此 BD，请刷新游戏目录后重试。');
      setAnalysis(result.analysis);
      setMainKey(result.analysis.skills.find(isBuildMainSkill)?.key ?? '');
    } catch (reason) { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'BD 分析失败。'); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }
  const profile = analysis ? profileForSkill(analysis, mainKey) : undefined;
  const config = data?.configuration;
  return <details className="lo-backup"><summary>本机游戏目录联动</summary>
    <section className="lo-local-game" aria-label="本机游戏目录联动">
      <p className="lo-footnote">读取文档／OneDrive 文档中 Path of Exile 2 的显示、语言、按键配置和 BuildPlanner 摘要。点击检查时才读取，不修改游戏文件。</p>
      <button className="wb-button" disabled={busy} onClick={() => { void inspect(); }}>{busy ? '正在检查…' : '检查本机游戏配置'}</button>
      {error && <p role="alert" className="lo-alert">{error}</p>}
      {data && !data.found && <p role="status">没有找到可读取的游戏配置。请先启动游戏并正常退出以保存设置；支持本机和 OneDrive 的 Documents／文档目录。</p>}
      {config && <div>
        <p>已连接：{data.location} · My Games / Path of Exile 2</p>
        <p>语言：{({ 'zh-TW': '繁体中文', 'zh-CN': '简体中文', en: '英文' } as Record<string, string>)[config.language ?? ''] ?? config.language ?? '未知'} · 操作：{{ wasd: 'WASD 移动', mouse: '鼠标移动', unknown: '未确定' }[config.controls]}</p>
        <p>显示：{{ exclusive: '独占全屏', borderless: '无边框窗口', windowed: '窗口', unknown: '未确定' }[config.mode]}{config.width && config.height ? ` · ${config.width} × ${config.height}` : ''}{config.renderer ? ` · ${config.renderer}` : ''}</p>
        {config.mode === 'exclusive' && <p className="lo-alert">当前配置为独占全屏。Alt+E 的桌面查价面板若无法出现在游戏上方，请在游戏显示设置中改为无边框窗口，再试快捷键。</p>}
        <p className="lo-footnote">配置反映游戏上次保存的设置；游戏中尚未保存的修改可能未体现在这里。</p>
        {config.altHighlight && <p>游戏 Alt 键用于显示物品标签{config.eActions.length ? `；E 绑定了${config.eActions.join('、')}` : ''}。Alt+E 查价由工坊桌面助手处理；若与其他插件冲突，需在其中一个工具里调整快捷键。</p>}
        {config.activeFilter && <p>当前掉落过滤器：{config.activeFilter}（只读配置，不修改过滤规则或音效）。</p>}
      </div>}
      {!!data?.plans.length && <div><h4>游戏内保存的规划方案</h4><p className="lo-footnote">这些是参考天赋／技能方案，不能当作当前已穿戴装备或角色实时状态；整套装备仍从 PoB2 导入。</p>
        <div className="lo-actions"><PresetNumberInput label="BD 分析等级" value={level} min={1} max={100} disabled={busy} automaticLabel={characterLevel ? `跟随当前角色 · ${characterLevel} 级` : '参考完整 100 级规划'} presets={budgetPresets([80, 85, 90, 95, 100])} onChange={(value) => { setLevel(value); setAnalysis(null); }} />
          <label>分析武器组<select aria-label="BD 分析武器组" value={weaponSet} disabled={busy} onChange={(event) => { setWeaponSet(Number(event.target.value)); setAnalysis(null); }}><option value={1}>第一组</option><option value={2}>第二组</option></select></label></div>
        <ul>{data.plans.map((plan) => <li key={plan.fileName}>
        <strong>{plan.fileName}</strong> · {plan.name}{plan.author ? ` · 作者 ${plan.author}` : ''}{plan.ascendancy ? ` · ${translatePobLabel(plan.ascendancy)}` : ''}<br />
        {plan.passiveCount} 条天赋记录 · {plan.skillCount} 条技能记录 · 保存于 {new Date(plan.modifiedAt).toLocaleString('zh-CN')}
        {plan.id && <div><button className="wb-button" disabled={busy} onClick={() => { void readBuild(plan.id!); }}>读取 BD 用于配装建议</button></div>}
      </li>)}</ul></div>}
      {analysis && <section aria-label="BD 分析预览">
        <h4>{analysis.fileName} · BD 分析预览</h4>
        <p>等级 {analysis.level}／武器组 {analysis.weaponSet}：{analysis.matchedPassives} / {analysis.totalPassives} 条天赋 ID 已匹配。</p>
        <p className="lo-footnote">节点映射固定于 PoB2 v0.23.1／0.5 天赋数据；不同版本、阶段和武器组可能改变效果。这里只生成配装方向，不运行完整 PoB 伤害模型。</p>
        <label>选择主攻技能<select aria-label="BD 主攻技能" value={mainKey} disabled={busy} onChange={(event) => setMainKey(event.target.value)}>
          {!mainKey && <option value="">没有可识别的攻击／法术技能</option>}
          {analysis.skills.filter(isBuildMainSkill).map((skill) => <option key={skill.key} value={skill.key}>{skill.label} · {skill.key.replace('skill:', '组合 ')}</option>)}
        </select></label>
        {profile && <><p>辅助组合：{profile.main.supports.map((support) => support.label).join('、') || '未记录'}</p>
          <p>配装侧重：{profile.priorities.map((priority) => `${BUILD_FAMILIES[priority.family]} ${priority.weight}`).join(' · ')}</p>
          <button className="wb-button primary" disabled={busy || !onBuild} onClick={() => onBuild?.(profile)}>采用此 BD 配装方向</button>
          <p className="lo-footnote">采用后更新角色优先属性与升级搜索权重；保留当前装备、抗性最低目标和账本。</p></>}
        <details><summary>全部技能与辅助组合（{analysis.skills.length} 组）</summary><ul>{analysis.skills.map((skill) => <li key={skill.key}><strong>{skill.label}{skill.known ? '' : '（ID 未识别）'}</strong>：{skill.supports.map((support) => support.label).join('、') || '未记录辅助'}</li>)}</ul></details>
        {!!analysis.keystones.length && <details><summary>关键天赋原始效果核对</summary><ul>{analysis.keystones.map((node, index) => <li key={index}>{node.name}<ul>{node.text.map((line, i) => <li key={i}>{localizeEquipmentStat(line)}</li>)}</ul></li>)}</ul></details>}
        {!!analysis.hints.length && <details><summary>BD 保存的装备备注</summary><ul>{analysis.hints.map((hint, index) => <li key={index}>{hint.slot}：{hint.unique ? localizeEquipmentName(hint.unique) : ''}<pre>{hint.text}</pre></li>)}</ul></details>}
        {!!analysis.warnings.length && <ul className="lo-warnings">{analysis.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>}
      </section>}
      {data?.savedTradeSearchFile && <p className="lo-footnote">检测到 ETrade 搜索缓存文件。它不是成交账本，不能据此计算买卖利润。</p>}
      {!!data?.warnings.length && <ul className="lo-warnings">{data.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>}
    </section>
  </details>;
}
