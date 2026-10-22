import { useState } from 'react';
import { parseEquipment, localizeEquipmentName } from './genericEquipment';
import { rememberTrade, type TradeMemoryInput } from './tradeMemory';

export function TradeMemoryActions(input: TradeMemoryInput) {
  const item = input.raw ? parseEquipment(input.raw) : null;
  const fallback = input.title || (item ? localizeEquipmentName(item.name) : input.query.query.name || input.query.query.type || '物品搜索');
  const [title, setTitle] = useState(fallback);
  const [folder, setFolder] = useState('');
  const [message, setMessage] = useState('');
  return <details className="wb-search-save"><summary>收藏当前搜索条件</summary>
    <div className="wb-actions">
      <label className="wb-form-label">收藏名称<input aria-label="收藏搜索名称" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} /></label>
      <label className="wb-form-label">分组<input aria-label="收藏搜索分组" value={folder} maxLength={40} placeholder="如：冰法升级、做装底材" onChange={(e) => setFolder(e.target.value)} /></label>
      <button type="button" className="wb-button" onClick={() => setMessage(rememberTrade({ ...input, title: title || fallback }, { save: true, folder }) || '已收藏完整条件，可在上方“查价历史与收藏”重新打开。')}>保存搜索</button>
    </div>{message && <p role="status">{message}</p>}
  </details>;
}
