import type { PatchData } from '../../packages/engine/src/types';
import type { Equipment } from './genericEquipment';
import { affixStructure } from './equipmentAffixes';

export default function AffixStructurePanel({ equipment, data }: { equipment: Equipment; data?: PatchData }) {
  const structure = affixStructure(equipment, data);
  return <details className="wb-fold" aria-label="词缀位与前后缀"><summary>{structure.title}</summary>
    <p className="wb-fine">按高级复制中的词缀块计数；一条复合词缀即使显示多行，也只占一个位置。固定、附魔和符文效果另列。</p>
    {equipment.rarity === 'unique' ? <p className="wb-fine">传奇只能在自身定义的词缀与范围内选择，不能添加普通稀有词缀。要补本件没有的属性，可检索同部位稀有替代，但须重新核对传奇机制。</p>
      : !structure.complete && <p className="wb-fine">当前文字不足以确认是否满词缀。请在游戏按 Ctrl+Alt+C 高级复制；不把“六行文字”当成“六条词缀”。上限按底座规则；特殊符文改变上限的装备需另行核对。</p>}
  </details>;
}
