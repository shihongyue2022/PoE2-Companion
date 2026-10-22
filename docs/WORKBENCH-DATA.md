# 本地工作台的数据与适用范围

## 官方装备图标

装备图标来自 Grinding Gear Games 的 `https://web.poecdn.com/gen/image/` 签名地址，编码的资源路径属于 `realm: poe2`。映射提取自 [Exiled Exchange 2 的固定版本物品数据](https://github.com/Kvan7/Exiled-Exchange-2/blob/572c1925e4737d2c5f79143d03280df9660c1d8f/renderer/public/data/en/items.ndjson)。映射数据沿用 Exiled 的 MIT 许可，游戏图片本身的权利属于 GGG。

2026-10-22 对 41 个不同图片地址逐一核验 HTTP 200、PNG 格式、尺寸与 SHA256，覆盖目录中 44 个具体底座。完整记录见 `src/workbench/data/item-icons.json`，装备卡片提供原始 GGG 图片链接。

未找到可靠映射的 5 个名称是 `Abyssal Signet`、通用 `Ring`、带变体的 `Two-Stone Ring`、`Veridical Chain` 和 `Runemastered Veridical Chain`。界面对这些名称显示明确的占位提示，不会给它们分配另一个底座的图片。图片加载失败时同样显示占位说明。图片表示底座外观，不表示装备随机名称、词缀或稀有度有独立的对应美术。

## 制作规则版本

工作台使用上游 POE2_HTC 随仓库提供的 `data/patches/0.5.0/`。这是一份明确版本的离线快照，**不能因赛季列表更新而声称制作规则已更新至当前游戏**。界面应始终显示快照版本。

`mods.json` 的来源说明：普通词缀结构来自 RePoE，普通权重来自 PoE2DB；精华与特殊池由上游刷新脚本整理。亵渎词缀的权重是上游假设值 2500，符文附加池的权重是假设值 1000，均不是测量结果。因此解析概率精确并不代表所有输入权重都已被真实游戏验证。涉及这些池的结果必须保留上游不确定性说明。详见上游 `docs/validation.md`。

可选词缀必须从当前物品类别的规则池读取，再结合物品等级、词缀互斥组、前后缀槽位与所用制作动作过滤。中文目录只负责名称映射，不能代替规则池。

## 底座与中文名称

`src/workbench/catalog.ts` 的英文目录与离线快照中的戒指、项链底座完全一致。繁体名称于 2026-10-22 对照以下页面核验；简体名称为界面使用的转换别名，不声称是国服官方名称：

- https://poe2db.tw/tw/Rings
- https://poe2db.tw/us/Rings
- https://poe2db.tw/tw/Amulets
- https://poe2db.tw/us/Amulets

已知会改变前后缀上限的 Dusk、Gloam、Penumbra、Tenebrous 底座，以及 Lament、Portent、Absent、Twisted、Distorted 项链，在当前 3 前缀 / 3 后缀模型下标记为不支持计算。Grasping Ring、Corona Amulet 的跨部位插槽效果尚未建模，同样标记为不支持。它们仍可用于官方交易搜索。

通用名称 `Ring / 戒指` 不足以确认可制作底座，不能直接当成普通底座规划。PoE2DB 新增但尚未出现在此快照中的底座不会被悄悄加入相同概率池。

## 价格

价格元信息直接读取 `data/patches/0.5.0/prices.json`：规则版本 0.5.0，更新时间 2026-10-18，赛季来源为 Forbidden Rites，计价为 exalt-equivalent。`OFFLINE_MARKET.league` 表示这份价格表的来源赛季，**不表示最新赛季**。

它提供制作材料参考价格，不提供装备成交价。装备估价功能另按用户当前筛选条件读取官方挂单，不把挂牌价当成已成交价格。

主动查价最多取价格升序中的 20 条，以卖家去重后按币种分别计算四分位区间和中位数，因此明确称为“低价挂牌样本参考”；没有全市场分布、成交量或售出时间模型。代码流程参考 Exiled Exchange 2 的 [pathofexile-trade.ts](https://github.com/Kvan7/Exiled-Exchange-2/blob/master/renderer/src/web/price-check/trade/pathofexile-trade.ts) 与 [trade-api.ts](https://github.com/Kvan7/Exiled-Exchange-2/blob/master/renderer/src/web/price-check/trade/trade-api.ts)。本地代理不读取账户凭证；动态限流处理依据 [GGG 开发文档](https://www.pathofexile.com/developer/docs)。

## 官方交易链接

交易词缀映射复用 `data/trade/gear-stats.json`，上游由 Exiled Exchange 2 的 MIT 数据生成。工坊的 `tradeSearch.ts` 提供逐行选取和可编辑上下限，沿用真实 stat ID。若同一属性存在 explicit、fractured 等多种映射，按“任选一种”处理，不要求所有命名空间同时存在。部分匹配按可见属性行计数，不让同一行的多个映射重复计数。

高级复制中的实际值经 `tradeActualValues.ts` 提取，只有当前词缀及阶层与原文一致、且未经过编辑或模拟时才采用。附加伤害过滤值为两个端点的平均数；修正旧映射中模板写死一个端点、只计算一个 `#` 的情形。阶层范围提示不是装备实际数值，品质不会再次相乘。

合计属性来自 [固定版本 Exiled Exchange 2 的 stats.ndjson](https://github.com/Kvan7/Exiled-Exchange-2/blob/572c1925e4737d2c5f79143d03280df9660c1d8f/renderer/public/data/en/stats.ndjson)，使用 `pseudo.pseudo_total_elemental_resistance` 和 `pseudo.pseudo_total_attributes`。计算只包含已识别显式属性，按全元素抗性乘 3、双元素抗性乘 2 等规则合计。缺少实际值时不会把阶层参考值冒充装备合计。

国际服链接使用 `www.pathofexile.com/trade2/search/poe2/`。中文底座被转换为英文底座名称。成品查询默认不附加具体底座或物等；底材查询默认保留当前稀有度、具体底座与最低物等，全部条件均可调整。用户确认的赛季始终保留。未映射、语义歧义或数值方向未核验的属性明确提示。

交互参考 [PoE Overlay 官方价格检查说明](https://www.poeoverlay.com/features/price-checker)和[Overlay II 更新记录](https://www.poeoverlay.com/changelog/poe-overlay-ii)：按用途切换配置、挑选有用属性、放宽区间、使用抗性与属性合计。当前实现采用公开数据和本地启发式预设，不声称复刻 Overlay 的内部评分或机器学习估价。

同类顶配预设由 `tradeTopGear.ts` 读取完整词缀阶层表，使用所选 T2 下限、T1 下限、T1 区间 80% 位置或 T1 上限；不会因原装备物等较低而排除市场上的高物等词缀。已确认实际值更高时默认保留原值，品质不重复相乘。总抗性与总能力值对组成词缀的相应参考值加权合计。该预设只改变搜索门槛，仍用价格升序展示满足门槛的官网挂单，不构造市场排名。

## 全装备交易词典与属性比较

`src/workbench/data/equipment-index.json` 独立于制作词池，包含 2426 个装备／传奇名称记录和 2476 个可交易属性记录。来源为固定提交 `572c1925e4737d2c5f79143d03280df9660c1d8f` 的 [Exiled Exchange 2](https://github.com/Kvan7/Exiled-Exchange-2/tree/572c1925e4737d2c5f79143d03280df9660c1d8f/renderer/public/data) 英文及 `cmn-Hant` 的 `items.ndjson`、`stats.ndjson`，并按 2026-10-22 取得的 [官方 filters](https://www.pathofexile.com/api/trade2/data/filters) 与 [官方 stats](https://www.pathofexile.com/api/trade2/data/stats) 过滤可用类别和 ID。简繁字符转换使用既有 OpenCC 许可来源。缺少翻译时保留英文名称；未匹配效果不猜成其他属性。

生成命令：`node tools/refresh/equipment_index.mjs`；`--refresh` 重新获取来源。原始响应缓存位于忽略提交的 `artifacts/`，清单保留固定提交与元数据日期。新增数据仍适用已附带的 MIT／Apache 来源许可，官方游戏图像权属不变。

高级复制范围先去除区间参考，再读取实际显示值。物品伤害区间分隔符不作为负号；双端伤害按均值查询，其他未核验多值公式仅查是否存在。装备比较只加总直接属性，局部防御／伤害修正已包括在物品显示属性里，不重复计算。无法确认的条件效果单列，不将其收益当作零。

## 全物品查价索引

`src/workbench/data/trade-item-index.json` 补充 1589 条非装备物品名称记录，覆盖官方目录中的地图／终局物品、宝石、通货／材料与胎赠；支持 63 个官方类别，并对没有类别筛选的物品使用准确官方类型查询。数据于 2026-10-22 读取 [GGG items](https://www.pathofexile.com/api/trade2/data/items) 和 [GGG filters](https://www.pathofexile.com/api/trade2/data/filters)，繁体名称及原图引用沿用上文相同固定版本 EE2 MIT 词库。

生成脚本 `node tools/refresh/trade_item_index.mjs`，`--refresh` 更新官方目录；缓存位于忽略提交的 `artifacts/all-items-official-*.json`。查价与穿戴／制作范围独立，新增物品不会自动加入制作引擎。翻译同名但英文类型不同的宝石要求手动选择，官方名称无法确定时停止估价。

地图阶级使用 `map_filters.map_tier`，宝石等级使用 `misc_filters.gem_level`，品质使用 `type_filters.quality`；未识别的真实地图词缀继续保留。堆叠数量仅显示背包持有数，不作为通货单件估价的倍数。原生助手接受不含物品等级的通货和宝石文本。

## 官方通货图标映射

通货图标清单 `src/workbench/data/currency-icons.json` 于 2026-10-22 从 [GGG 官方 trade2 static 接口](https://www.pathofexile.com/api/trade2/data/static)按英文 `text` 精确匹配获取，并与上述固定版本 Exiled Exchange 2 的 `items.ndjson` 交叉核对。包含模拟器的 15 种通货、高阶／完美混沌石及神圣石，共 18 项、8 张不同原图。全部 URL 为 `web.poecdn.com` 的 PoE2 图片，逐张验证 HTTP 200、PNG 签名、尺寸、内容类型及 SHA-256，并保存核验元数据。

官方接口为部分普通、高阶和完美通货提供同一图片路径；每个名称分别精确匹配，没有自行用低阶图兜底。通货名称继续显示阶位。图像权利归 GGG，交叉核对索引的 MIT 许可不改变游戏图片的权利归属。未知材料不猜图；加载失败会显示提示。

## 当前赛季

### 2026-10-22 官方公告核验

本次核验确认最近开始的新经济赛季为 **Forbidden Rites**，于 2026-09-04 开始，官方说明将持续至 1.0 发布，并与 Runes of Aldur 并行。官方 0.5.5 补丁公告明确列出其普通、专家和独狼变体；个人普通交易模式应选择 `Forbidden Rites`，而不是 `HC Forbidden Rites` 或 SSF。

- [Forbidden Rites 官方 FAQ](https://www.pathofexile.com/forum/view-thread/4000430)：开始日期、全新经济、与 Runes of Aldur 并行至 1.0。
- [0.5.5 官方补丁说明](https://www.pathofexile.com/forum/view-thread/4000864)：赛季各模式。
- [官方抢先体验补丁索引](https://www.pathofexile.com/forum/view-forum/2212)：核验时最新有版本号的补丁为 0.5.5e。
- [0.5.5e 官方补丁说明](https://www.pathofexile.com/forum/view-thread/4009785)：2026-10-05 发布。

这份日期明确的公告核验可以作为本地初始赛季选择的依据；不意味着离线 `0.5.0` 制作数据已经完整核验适配 `0.5.5e`。后续新赛季发布后必须重新核验，不应无限期把这个名字标成“最新”。

用户明确选择赛季或手动输入官方名称。`fetchTradeLeagues()` 通过本地 Vite 代理 `/api/poe/leagues` 读取官方 PoE2 赛季列表，接受官方 trade2 的 `result` 包装或 main-leagues 数组。排除明确的 PoE1 realm 与 SSF / 无交易赛季，并标记专家与标准模式。

列表没有可靠开始时间时，不根据数组次序或写死名字猜测“最新”。接口失败时显示原因并保留手动输入。更新列表不会自动更新词缀、制作机制和价格快照。
