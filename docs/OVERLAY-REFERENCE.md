# PoE Overlay II 参考记录

核对日期：2026-10-22。参考产品流程，在工坊中独立实现；本次没有复制安装包的打包代码、私有模型或美术资源。

## 本机确认

`OverwolfLauncher.exe` 是平台启动器。已从扩展的静态 `manifest.json` 确认安装了 **PoE Overlay II 1.68.0**，扩展 ID 为 `pieipbjakjgegggfdahpmlifmenkeiaobikdldin`。Overwolf 进程正在运行；平台运行本身不能证明插件的每个游戏功能都处于启用状态。

该版本清单包含独立的游戏内估价、市场、交易、仓库追踪和会话窗口。默认 Evaluate 快捷键为 **Alt+E**，与工坊默认按键相同；这属于默认值，不是对用户当前自定义按键的读取。工坊注册失败时现在指出具体冲突按键，提示在 PoE Overlay II 的快捷键设置中修改 Evaluate，或退出其中一个助手。没有擅自改变用户的 Overwolf 设置。

## 值得借鉴的流程

| 参考功能 | 对工坊的用途 | 当前状态 |
|---|---|---|
| 快速估价后切换查询方案、调整词缀 | 普通查价、底材、综合升级、全 T1 可以连续比较 | 已有，保留 |
| 市场搜索收藏 | 保留完整词缀门槛、预算、权重、赛季，免于重建查询 | 本次新增分组收藏，最多 40 条 |
| 历史回看 | 找回刚查过的物品及原查询，区分失败与零结果 | 本次新增本地历史，总计最多 80 条，优先保留收藏 |
| ML 即时估价 | 有充足成交训练数据时改善首轮估值 | 未实现；当前为官方挂牌样本统计 |
| 交易与会话收益 | 与个人确认的成交及资产估值分别对账 | 已有手工账本；本次未新增自动成交识别 |
| 独立游戏内窗口 | 减少切出游戏，调整条件、比较候选 | 已有原生快捷摘要；完整交互仍在工坊页面 |

历史记录只保存查询、物品文本、时间和结果摘要，不保存卖家账号或私聊。重新打开不会自动请求市场。普通查询可按原条件重新获取参考；加权升级收藏保留完整官网查询，使用官网查看候选，不把加权靠前的价格当作低价估值。重新载入原物品进入默认编辑条件，原收藏保持不变。删除历史保留已收藏条目。不同赛季默认分开显示。

## 可公开参考的来源

- [PoE Overlay 官方功能概览](https://www.poeoverlay.com/)：市场查询收藏、仓库与价格历史功能。
- [官方 Price Checker 说明](https://www.poeoverlay.com/features/price-checker)：按物品种类设置起始条件，调整比较方案，数值方向，ML 估价与挂牌核对的区别。
- [PoE Overlay II 商店页](https://www.overwolf.com/app/kyusung4698-poe_overlay_ii)：插件身份、发布版本和功能介绍。
- [旧版 PoE-Overlay 开源仓库](https://github.com/Kyusung4698/PoE-Overlay)及其 [MIT 许可证](https://github.com/Kyusung4698/PoE-Overlay/blob/master/LICENSE.md)：可参考架构，但不能据此将当前 II 安装包视为同一份开源代码或套用旧许可证。
- [Exiled Exchange 2](https://github.com/Kvan7/Exiled-Exchange-2)：已有本项目使用的语言与物品数据参考，仍按现有归属说明保留。

## 验证

`src/workbench/tradeMemory.test.ts`、`TradeMemoryPanel.test.tsx` 检查精确条件、加权排序与预算、存储容量、跨赛季隔离、失败记录和刷新恢复。`scripts/workbench-search-memory-regression.mjs` 使用明确模拟的市场响应验证实际页面：六方向 T1 条件收藏后修改编辑器，重新查询仍使用原门槛，刷新可恢复，制作会话不被覆盖，并检查 390px 布局。模拟结果不能用于证明真实市场价格或存在挂单。
