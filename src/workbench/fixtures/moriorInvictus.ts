/** Actual Traditional Chinese clipboard text supplied in the comparison bug report. */
export const MORIOR_INVICTUS_SAMPLE = `物品種類: 胸甲
稀有度: 傳奇
不敗亡者
宏偉華服
--------
品質: +25% (augmented)
護甲值: 1532 (augmented)
閃避值: 1409 (augmented)
能量護盾: 433 (augmented)
--------
需求: 等級 65, 39 (augmented) 力量, 39 (augmented) 敏捷, 39 (augmented) 智慧
--------
插槽: S S S S S
--------
物品等級: 84
--------
+30護甲值 (rune)
+30閃避值 (rune)
+10最大能量護盾 (rune)
增加80%護甲值、閃避和能量護盾 (rune)
--------
{ 傳奇詞綴 — 護甲,閃避,能量護盾 }
增加398(300-400)%護甲值、閃避和能量護盾
{ 傳奇詞綴 — 元素,火焰,冰冷,閃電,抗性 }
每個鑲嵌的插槽使全元素抗性+10(8-10)%
{ 傳奇詞綴 }
每個鑲嵌的插槽每秒具有8.2(8-12)生命回復
{ 傳奇詞綴 }
每鑲嵌一個插槽，增加12(9-12)%全域護甲、閃備與能量護盾
--------
無光之眼未曾退縮和哀泣。
他們挺身對抗終結。
--------
已汙染
--------
備註: ~b/o 2000 divine`;

/** Second supplied game copy: lower local defence, more regeneration, 9 all-res per socket. */
export const MORIOR_INVICTUS_CANDIDATE = MORIOR_INVICTUS_SAMPLE
  .replace('品質: +25%', '品質: +20%').replace('護甲值: 1532', '護甲值: 1366')
  .replace('閃避值: 1409', '閃避值: 1257').replace('能量護盾: 433', '能量護盾: 387')
  .replace('增加398(300-400)%', '增加357(300-400)%')
  .replace('+10(8-10)%', '+9(8-10)%').replace('8.2(8-12)', '11.8(8-12)')
  .replace(/\n--------\n備註:[\s\S]*$/, '');
