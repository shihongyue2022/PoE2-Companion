# PoE2 Workbench · 配装与制作工坊

[![CI](https://github.com/shihongyue2022/PoE2-Workbench/actions/workflows/ci.yml/badge.svg)](https://github.com/shihongyue2022/PoE2-Workbench/actions/workflows/ci.yml)
[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue)](LICENSE)

面向《流放之路 2》国际服的本地工具：导入整套角色装备，按 BD 和主技能寻找升级，按核心词缀的相近数值档位查价，比较换装，再规划制作路线。

界面使用简体中文，接受繁体、简体和英文物品文本；交易检索使用原生英文与官方属性 ID。游戏内按 **Alt + E** 打开快捷查价。

## 启动

需要 Windows 与 Node.js 20.19+ 或 22.12+。

```powershell
git clone https://github.com/shihongyue2022/PoE2-Workbench.git
cd PoE2-Workbench
npm.cmd ci
.\start-workbench.cmd
```

也可安装 Node.js 后直接双击 `start-workbench.cmd`，首次会安装依赖。就绪后打开本地网页与快捷键助手，默认地址为 <http://127.0.0.1:5173/?companion=1>。双击 `stop-workbench.cmd` 停止本项目后台服务。

## 日常操作

**更新角色 → 点选装备 → 查价／找升级 → 比较候选 → 确认替换。**

| 页面 | 用途 |
| --- | --- |
| 角色装备 | 从 PoB2 代码／XML 或本机保存文件导入整套装备；查看 I／II 两套武器、角色抗性、技能与装备构成、更新前后差异 |
| 官方查价 | 支持装备、地图、宝石、通货与材料；装备按核心属性降序观察市场，再按相近数值档位比较挂牌 |
| 寻找升级 | 按 BD 与主技能方向推荐属性，在整套四抗约束下筛选；推荐补齐缺口的词缀与已核对 roll 档位 |
| 比较候选 | 候选直接送回对应角色栏，查看全身有效抗性与溢出、单件数值及机制变化，确认后才替换 |
| 制作策略 | 戒指／项链制作路线、成本、制作锚点与结果核对；自由模拟和详细数据按需展开 |
| 交易追踪 | 官方近期成交同步桥、密语交易线索确认、CSV 导入导出、按币种统计收支；持有资产估值涨跌独立展示 |

完整操作见 **[日常操作通路](docs/WORKFLOW.md)**，功能细节与数据边界见 [WORKBENCH.md](WORKBENCH.md)，后续事项见 [TODO.md](TODO.md)。

## 角色更新与官方成交同步

游戏换装后，需要在 PoB2 重新导入角色并保存，再回工坊读取、预览和确认。工坊会检查当前文件的保存时间，但不会直接读取游戏内存；仅保存旧文件不会获得最新装备。取下物品后应在 PoB2 勾选 **Delete equipment** 再导入，空栏会清除工坊旧物品。

官方成交同步需首次在 Chrome／Edge 加载项目自带扩展。入口在「交易追踪 → 官方成交同步 → 打开扩展安装入口与目录」，详见 [同步扩展说明](browser-extension/official-history/README.md)。登录在官网完成，工坊不读取或保存 Cookie、口令。

同步只覆盖官网实际返回的近期记录，显示每次读取的时间范围和买卖方向，不保证所有买入或完整历史。密语报价需核对实际成交后才计入收支；跨来源重复仍需核对。

## 当前边界

- 挂牌价是市场参考，不是成交价。核心属性不同的样本不混作同档估值，不混算不同币种。
- 角色抗性依据可追溯的 PoB2／游戏面板基准及换装差值计算；全元素抗性不包含混沌。
- 两套武器互斥计算装备贡献。专属天赋、持续增益、精魂预留和最终技能伤害尚不能完整重算，精确结果需 PoB2／游戏校准。
- 制作引擎与词缀范围使用仓库内规则快照，不代表已自动适配最新补丁。未识别内容保留原文，不按零收益处理。
- 装备方案、报价、历史和账本主要保存在当前浏览器；建议定期导出备份。本机 PoB2、个人角色文件、日志、凭据、依赖和构建产物不随仓库提供。

## 开发与检查

```powershell
npm.cmd run dev
npm.cmd run type-check
npm.cmd run test:workbench
npm.cmd run build
```

真实浏览器回归脚本位于 `scripts/workbench-*.mjs`。整合通路测试使用隔离样例，不读取用户浏览器登录态，运行方式见 [操作通路的验证说明](docs/WORKFLOW.md#验证)。开发服务器和项目预览提供本地 API，单独托管静态 `dist` 不能提供本机 PoB2、日志读取和后台查价能力。

问题与建议请提交到 [本仓库 Issues](https://github.com/shihongyue2022/PoE2-Workbench/issues)。

## 来源与许可证

本项目基于 [Dboire9/POE2_HTC](https://github.com/Dboire9/POE2_HTC) 改造，保留其制作引擎、相关代码与提交历史，并扩展了角色配装、查价、桌面快捷键及交易工作流。原作者及贡献者的署名保留，基础检出提交记录在 [UPSTREAM.txt](UPSTREAM.txt)。

项目沿用 **[GNU AGPL-3.0](LICENSE)**。历史项目说明保留在 [README.upstream.md](README.upstream.md)，其中旧站点、功能描述及支持入口不代表本工具的当前状态。

《流放之路》游戏名称、物品图像等资源归 Grinding Gear Games 等原权利方所有；本项目为社区工具，并非官方产品。
