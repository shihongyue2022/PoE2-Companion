# POE2 How To Craft

> **本地个人改版：PoE2 制作工坊**
>
> 双击 `start-workbench.cmd` 启动全物品查价、角色装备栏与中文戒指／项链制作工作台。支持装备、地图、碑牌、宝石、通货和材料查价，游戏内按 `Alt + E`。后台服务就绪后会打开网页和快捷键助手；关闭启动窗口不影响服务。使用说明、当前功能与数据版本边界请先阅读 [WORKBENCH.md](WORKBENCH.md)。下面保留原项目说明以记录上游来源；其中线上服务与长期功能不代表本地版本全部支持。
>
> 本地改版仓库：[shihongyue2022/PoE2-Craft-Workbench](https://github.com/shihongyue2022/PoE2-Craft-Workbench)。原作者仓库保留为 Git `upstream`，本仓库为 `origin`。
>
> 日常顺序：更新角色 → 点选装备 → 核心属性档位查价／按 BD 找升级 → 比较候选 → 确认替换。主导航保留角色装备、官方查价、制作策略、交易追踪，模拟和设置使用图标入口；来源历史和高级数据折叠。详见 [日常操作通路](docs/WORKFLOW.md)。
>
> 已提供官方成交浏览器同步桥：加载项目扩展后正常登录官网，同步可读取的近期成交，自动去重并按原币种统计；安装入口在交易追踪页。尚未验证用户账号的买入覆盖和历史长度，不保证完整流水。密语线索仍需成交确认；CSV 和资产涨跌保留独立入口。

<div align="center">

![CI](https://github.com/Dboire9/POE2_HTC/actions/workflows/ci.yml/badge.svg)
![Release](https://github.com/Dboire9/POE2_HTC/actions/workflows/build-release.yml/badge.svg)
![Version](https://img.shields.io/github/v/release/Dboire9/POE2_HTC?label=version)
![License](https://img.shields.io/badge/License-AGPL--3.0-blue)
![Platform](https://img.shields.io/badge/platform-Web-lightgrey)

![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-7-646CFF?logo=vite&logoColor=white)
![Vitest](https://img.shields.io/badge/Vitest-4-6E9F18?logo=vitest&logoColor=white)

![Stars](https://img.shields.io/github/stars/Dboire9/POE2_HTC?style=social)
![Issues](https://img.shields.io/github/issues/Dboire9/POE2_HTC)
![Last Commit](https://img.shields.io/github/last-commit/Dboire9/POE2_HTC)

</div>

A web app that works out **how to craft the item you want in Path of Exile 2**, and what it will cost.
It runs the probability math exactly — no simulation, no sampling — over the real 0.5.0 modifier pools,
prices every route from a daily poe.ninja sheet, and shows you the trade-off between the cheapest way
and the surest way. The crafting runs entirely in your browser, and there is nothing to install.

**Try it now at [poe2htc.com](https://poe2htc.com)** · **Join us on [Discord](https://discord.gg/RvxCWyFF3D)**

<a href="https://buymeacoffee.com/dboire" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" style="height: 40px !important;width: 145px !important;" ></a>

*If you find this tool helpful, consider supporting its development!*

## 📑 Table of Contents

- [✨ Features](#-features)
- [🚀 Quick Start](#-quick-start)
- [👤 About Me & the Project](#-about-me--the-project)
- [📖 How Does It Work?](#-how-does-it-work)
- [💻 Development](#-development)
- [🤝 Contributing](#-contributing)
- [📚 Documentation](#-documentation)
- [🐛 Known Issues](#-known-issues)
- [🗺️ Roadmap](#️-roadmap)
- [📄 License](#-license)
- [🙏 Acknowledgments](#-acknowledgments)
- [📞 Contact](#-contact)

## ✨ Features

- 🧠 **True expected cost, from an optimal policy** — the headline feature, and the one thing no other
  PoE2 crafting tool does. Most calculators price a *fixed* recipe: do these five steps, and if step
  three misses, start over. Real crafting isn't like that — after a bad roll you look at what you're
  holding and pick the best move from *there*. The engine solves that as a Markov decision process, so
  the cost it quotes is the cost of playing well, recovering in place, not of restarting.
- 🎯 **Optimal crafting paths** — the currency sequence to reach the mods and tiers you asked for, with
  exact per-step odds, cross-checked against Craft of Exile and a Monte-Carlo simulator
- 💰 **Cost ↔ success trade-off** — a Pareto frontier of plans, cheapest through surest, each priced in
  Exalted-Orb equivalents from [poe.ninja](https://poe.ninja)
- 🛒 **Start from an item you buy instead** — every craft from scratch also lists the items already
  carrying some of your targets, what finishing from each one costs, and what it is worth paying for.
  Type the trade prices you find and it tags the best buy, and draws the route from any of them.
- 🎥 **Streamer gear** — browse real endgame items from streamers' characters and hand any of them to
  the planner: craft it from scratch, aim at it from the item you hold, or load it as the item you own
- 🎒 **"I already have this item"** — enter what's actually on your item, mid-craft, and get the best
  move from where you are, not from a white base
- 🦴 **The currency that matters** — Basic, Greater and Perfect orbs, Essences and Perfect Essences,
  Desecration with every bone (Ancient included) and the Omen of Abyssal Echoes, omens, fractured mods
- 💸 **Budget mode** — say what you can spend and get the *closest item that money can actually finish*,
  with the probability of finishing it inside the budget
- 🚫 **Currency exclusions** — don't own Perfect Exalts, or refuse to use Omens? Tick them off and the
  planner routes around them
- 🔗 **Share a craft** — *Copy link* reproduces the exact base, mods, tiers and budget in anyone's
  browser, and your own workspace is kept between visits
- ⏱️ **Search effort** — Quick, Standard or Exhaustive. When a big craft doesn't settle, the app says so
  and offers to compute it again one level up, in one click
- ⚡ **Runs in your browser** — every solve runs client-side, in a Web Worker. What leaves the page:
  anonymous page-view counts, an error report if the app breaks (with a replay of that session, so the
  bug can be reproduced), and a rating if you choose to send one
- 💛 **Rate the app** — stars and a few words, straight to the maintainer, with no email and no account

## 🚀 Quick Start

**Visit [poe2htc.com](https://poe2htc.com)** — that's the whole install step. It works in desktop and
mobile browsers.

New here? The **[User Guide](docs/USER_GUIDE.md)** walks through a first craft end to end.
Used it before? **[What's new in 1.0](docs/WHATS-NEW.md)** is the tour of what the site does now.

### Running from source

**Prerequisites**: Node.js 20+ (no Java, no database)

```bash
git clone https://github.com/Dboire9/POE2_HTC.git
cd POE2_HTC
npm install      # .npmrc already sets legacy-peer-deps, which React 19 needs

npm run dev      # dev server on http://localhost:5173
npm run build    # or build the static site into dist/
```

Everything works locally except **Rate the app**, which posts to a Vercel server function that
`npm run dev` doesn't serve.

---

## 👤 About Me & the Project

Hi! I'm **Dorian**, a former student at **42 Paris**.

I built this project while actively searching for an internship, both to strengthen my skills and to add a meaningful, technical project to my portfolio. As someone passionate about both gaming and software development, combining Path of Exile 2's complex crafting system with algorithm optimization was the perfect challenge.

**Why this project?**
- 🎓 Demonstrates end-to-end product skills (React, TypeScript, Web Workers) — and a full engine rewrite from a Java backend to a pure-TS client-side engine
- 🧠 Showcases algorithm design (exact weight-pool probability, Pareto cost/success optimization, a Markov decision process solved by policy iteration, Monte-Carlo validation)
- 🎮 Solves a real problem for the PoE2 community
- 📈 Continuous learning through community feedback

**📘 For more about my journey, motivation, and project philosophy, see [About Me & the Project](docs/ABOUT.md).**

---

## 📖 How Does It Work?

Three ways in, depending on where you're starting from.

**From a white base** — *Plan from scratch*:

1. **Select** your base item type, item level, and the modifiers and tiers you want
2. **Compute** — the engine evaluates candidate plans with exact weight-pool probability math
3. **Review** a Pareto frontier, cheapest through likeliest, each with step-by-step instructions and
   per-step odds — plus the true expected cost of playing optimally rather than following one fixed
   script, and the items worth buying instead of a white base
4. **Craft** in-game following the currency sequence

**From an item you're holding** — *I have an item*: enter the mods already on it, say what you want it to
end up as, and the engine answers from that state. It will tell you when the best move is to keep going,
and when it's to stop.

**From someone else's item** — *Streamer gear*: pick an item a streamer actually built, and send it to
either tab. The gear is a dated snapshot, and the app names every modifier it could not carry over.

The engine accounts for item rarity transitions, modifier weights, currency behaviours and strengths
(Basic / Greater / Perfect), omens, family conflicts, item-level gates, fractured mods and slot limits.
Monte-Carlo simulation is used only to *validate* the analytic math, never to produce the numbers you see.

### Two solvers, two questions

Two solvers run on every craft, and the app shows both because they answer different questions.

**The step planner** returns a **Pareto frontier** — the set of plans where no other plan is both
cheaper *and* likelier. Each plan is a fixed sequence of currencies, and its probability is computed
**analytically** from the modifier weight pools at each step: exact math over the affix pools, not
sampling. That answers *"what's the recipe, and what are my odds per attempt?"*

**The policy solver** models the craft as a Markov decision process — every reachable item state, every
legal move from it — and solves it by policy iteration for the **true expected cost**: what the craft
costs if, after every roll good or bad, you make the best move from wherever you actually are. That
answers *"what will this really cost me?"*, and it is almost always cheaper than the frontier's number,
because the frontier can only restart where a real crafter would recover.

**Key properties:**
- Exact, sampling-noise-free probability for each step and the plan as a whole
- Costs in exalt-equivalents from a poe.ninja price sheet refreshed daily, so plans can be ranked by money
- Full PoE2 semantics: rarity transitions, orb strengths, omens, essences, desecration, family
  exclusion, item-level gates, currency tier floors, fractured mods
- Honest bounds: when a solve doesn't fully settle, the app prints "≥ x" or "≤ x" rather than a
  confident number
- Runs locally in a Web Worker — no network during a solve, cancellable, with a progress bar

**📘 For a walkthrough of every panel and what each number means, see the [User Guide](docs/USER_GUIDE.md).
For the maths, see [How it works](docs/ALGORITHM.md).**

---

## 💻 Development

**Architecture:**
- **App**: React 19 + TypeScript + Vite, a static site; the UI lives in `src/features/`, driven by the
  browser facade `src/lib/engine.ts`
- **Engine**: `packages/engine` — a pure-TS crafting engine (no I/O, no DOM) doing exact weight-pool
  probability math per currency
- **Optimizer**: `packages/optimizer` — the Pareto frontier, the from-item planner, and the MDP policy
  solver, with Monte-Carlo self-checks
- **Data**: `data/patches/<patch>/*.json` — versioned mod, base and price data (the app ships `0.5.0`);
  `data/streamers/` is the streamer-gear snapshot, built by `tools/streamers/`
- **Server**: `api/feedback.ts` is the one server function — the *Rate the app* endpoint, a Vercel
  Function behind Vercel's BotID. Nothing else runs on a server.
- **Automation**: a GitHub workflow refreshes the price sheet from poe.ninja every day and merges its own
  pull request when the market data passes a liquidity check

**The verify chain** — what CI runs on every push:

```bash
npm test -- --run
npm run type-check && npm run type-check:engine && npm run type-check:optimizer
npm run lint
npm run build && npm run test:e2e
```

**📘 For detailed setup instructions, project structure, and contribution guidelines, see the [Development Guide](docs/DEVELOPMENT.md).**

---

## 🤝 Contributing

We welcome contributions! Here's how you can help:

1. **Report Bugs** - Open an issue with reproduction steps, or use *Report a problem* in the app
2. **Suggest Features** - Share your ideas for improvements
3. **Submit Pull Requests** - Fix bugs or add features
4. **Update Data** - Help keep modifier data current with game patches

**📘 For detailed contribution guidelines, development setup, and code style, see the [Contributing Guide](docs/CONTRIBUTING.md).**

---

## 📚 Documentation

Everything in `docs/`, so nothing is only findable by knowing it exists.

**If you play the game**

| | |
|---|---|
| [What's new in 1.0](docs/WHATS-NEW.md) | What the site does now, and what changed. Start here if you've used it before. |
| [User Guide](docs/USER_GUIDE.md) | Every panel and every number, plus what to do when a result looks wrong. |
| [Running POE2HTC](docs/DOWNLOAD.md) | Short version: there is nothing to download. |

**If you want to know whether to trust it**

| | |
|---|---|
| [How it works](docs/ALGORITHM.md) | The maths — exact weight-pool probability and the decision model. |
| [Validation log](docs/validation.md) | Every measurement behind every claim, including the experiments that **failed**, kept on purpose. |
| [Copy audit](docs/copy-audit.md) | Every claim the app makes about the game, and what enforces it. Written because telling a player something is impossible when it isn't costs them real currency. |
| [Changelog](docs/CHANGELOG.md) | Release by release. |

**If you want to work on it**

| | |
|---|---|
| [Development guide](docs/DEVELOPMENT.md) | Setup, project structure, the verify chain. |
| [Contributing](docs/CONTRIBUTING.md) | How to propose a change. |
| [Data layer](docs/data-layer.md) | How the patch data is versioned, refreshed and shipped. |
| [0.5.0 refresh diff](docs/refresh-0.5.0-diff.md) | What changed between the Java-extracted baseline and the poe2db data the app ships. |
| [API examples](docs/API_EXAMPLES.md) | Calling the engine packages directly. |
| [Security policy](docs/SECURITY.md) · [Code of conduct](docs/CODE_OF_CONDUCT.md) | |

## 🐛 Known Issues

These are the real limits, named rather than hinted at. None of them make a shown number wrong — where
the engine is uncertain, it says so on screen.

- **The desecrated spawn weight is measured, not published.** poe2db reports a weight of 1 for every
  desecrated mod, which cannot be right. The shipped value (2500) comes from 40 bone offerings on one
  base — good enough to trust, not good enough to be sure it doesn't vary by item category. A plan that
  uses a Desecration **without** a boss omen says so in the app and marks those odds as an estimate;
  every other probability is exact.
- **The step planner has no concept of filler.** Every step it emits names a target mod, so it cannot
  express "roll junk, annul it off, then Desecrate" — a route that works in game. The policy solver
  *can* find those, which is one reason the two models' numbers differ.
- **Charms and Jewels are not supported.** Both are classed differently from ordinary gear (charms are
  flasks in the game data, jewels have their own affix model), so neither fits the 3-prefix/3-suffix
  rare that this optimizer plans for. Every equipment slot IS supported.
- **Big crafts need patience.** A six-mod target at top tiers can take the Exhaustive search effort and
  several minutes to settle; until it does, the app shows a bound rather than a guess.

`docs/copy-audit.md` is the full inventory of what the app claims and what actually enforces it.
See the [Issues](https://github.com/Dboire9/POE2_HTC/issues) page for reported bugs.

## 🗺️ Roadmap

### Completed
- [x] Pure-TypeScript engine (retired the Java/Maven backend — the crafting is now fully client-side)
- [x] Cost ↔ success Pareto optimizer with Monte-Carlo validation
- [x] "I already have this item" flow (per-currency odds + from-item planner)
- [x] Heavy solves moved off the main thread into a Web Worker
- [x] **Crafting cost estimation** — every plan priced in Exalted-Orb equivalents from a poe.ninja
      sheet, plus the MDP's true expected cost of playing optimally
- [x] **Budget mode** — the best item a given number of exalts can actually finish, with the
      probability of finishing it in budget
- [x] **Orb strengths** — Basic, Greater and Perfect are searched for every add currency, on both the
      step planner and the policy solver (Chaos strengths are searched by the step planner; the policy
      solver models Chaos at basic strength, which was measured in 2026-09 to change no answer)
- [x] **Currency exclusions** — plan around the currency and omens you don't have
- [x] **Belts** — every equipment slot is now supported
- [x] **Omen of Whittling** — the Chaos Orb that removes your lowest-level modifier
- [x] **Omen of Greater Exaltation** — one Exalted Orb landing two modifiers, searched by the step
      planner (the policy solver was measured in 2026-09 and never plays it: it re-decides after every
      orb, and this omen is a promise not to)
- [x] **Automated daily price refresh** — the sheet updates itself from poe.ninja and merges its own
      pull request when the market data passes a liquidity check
- [x] **Share links** — a craft travels as a URL, and the workspace survives a reload
- [x] **Streamer gear** — real endgame items from streamers' characters, sent straight to the planner
- [x] **Ancient bones and the Omen of Abyssal Echoes** — weighed on every Desecration, and Desecration
      offered in the Quick currency check
- [x] **Start from an item you buy instead** — which item to buy as a head start, with typed trade prices
      and the route from it
- [x] **Rate the app** — feedback with no email and no account, protected by an invisible bot check

### Short-Term (Next Release)
- [ ] A measured desecrated spawn weight, from players' own bone counts rather than one 40-bone sample

### Long-Term
- [ ] Integration with trade API for cost optimization
- [ ] Crafting simulator with step-by-step execution

## 📄 License

This project is licensed under the GNU Affero General Public License v3.0 (AGPL-3.0) - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Grinding Gear Games for creating Path of Exile 2
- The PoE community and POE2db for modifier data and crafting knowledge
- [@fZpHr](https://github.com/fZpHr) for the help and advices.
- [farmer](https://www.twitch.tv/xthefarmerx) for giving me this idea through his streams and his discord (Modikin, Bad Architect).
- **Morce Faster** for the tablet rolling data — 19,147 modifiers counted across Ritual, Overseer and
  Temple tablets. Every odds figure on the Tablets tab rests on it; nothing else publishes tablet weights.
- [Exiled Exchange 2](https://github.com/Kvan7/Exiled-Exchange-2) (MIT) for the trade-site stat ids the
  tablet and gear searches are built from, and the trade site's item categories.

## 📞 Contact

- **Discord**: [discord.gg/RvxCWyFF3D](https://discord.gg/RvxCWyFF3D)
- **Issues**: [GitHub Issues](https://github.com/Dboire9/POE2_HTC/issues)
- **Discussions**: [GitHub Discussions](https://github.com/Dboire9/POE2_HTC/discussions)

---

**Note**: This is a third-party tool and is not affiliated with or endorsed by Grinding Gear Games.

词缀资料已整合到装备页和查价页的「词缀资料」折叠区。展开后按英文物品名查询英文资料，界面映射为简体中文；可核对的缺失效果会作为未勾选的可选检索条件，不修改装备原有数值。详细行为见 [WORKBENCH.md](WORKBENCH.md)。

装备页的「技能与构成」可读取 PoB2 主技能、辅助宝石和保存时伤害，并按栏位查看装备属性来源。旧记录点击「补读原 PoB2 的技能与伤害」即可补充资料；换装不会自动重算技能 DPS。

「智能配装」按参考 BD、主输出与启用辅助生成升级方向，可切换主输出技能。稀有装备会从底座词池补充原装备没有的潜在伤害词缀，四抗封顶后排序；搜索与换装比较共用评分。评分是筛选参考，实际技能 DPS 仍需 PoB2 重算。

游戏换装后，在装备页点击「打开 PoB2」，在其 Import/Export Build 重新导入角色并 Ctrl+S 保存，再回工坊点「保存后重新读取」，预览确认后更新整套装备。工坊读取的是保存快照，不会自动把手动换装写回 PoB2。

PoB2 整套导入会同时保留武器组 I／II 的主手与副手，装备栏上方可直接切换；防具饰品共用，备用武器不叠加属性。修改或移除武器只作用于当前组，备份保留两组。旧导入可从保存时间与装备基准匹配的本机 XML 自动补读备用组；存档已更新时需重新预览确认。角色面板与保存伤害绑定对应武器组，不把另一组的天赋、技能和总抗性直接套用过来。

角色更新预览会逐件列出同名装备的数值、增删词缀、特殊机制、品质、插槽和腐化状态，以及可读取的单件武器 DPS 差值。武器组 I／II 分别与原组对照，切组本身不算换装；文字格式、词缀顺序和已识别词缀的语言差异不冒充数值变化。重复读取相同装备会更新来源信息并保留上次有变化的对照，保存更新前后两个快照，后续手动换装不改写这条记录。缺失旧字段只标为读取信息补齐，不当作从零提升。

日常参数默认自动带入或选档位：词缀 T3／T2／T1 与 roll、抗性上限和缓冲、预算、分析等级及锚点通货均可选择；精确数值放在高级更正中。档位只使用已核对的规则范围，成交金额沿用实际记录，不凭档位猜算。

升级检索会按整套面板扣除旧装备后的抗性缺口，补充该底座可出的抗性词缀，按前后缀分组展示所有已核对阶层与 roll 范围。搜索使用抗性合计门槛，允许不同合法词缀组合；未知面板不猜缺口，溢出抗性不计伤害分。传奇不会被套入普通稀有词池，可主动选择同部位非传奇替代并核对机制变化。满词缀判断按高级复制的词缀块计数，不把多行复合词缀重复计数。

「词缀价格影响」可逐档查询当前值／T1／高 roll／满 roll 的低价挂牌，保留其余硬条件、预算与币种；每档按价格升序独立取样，按币种对照，不把低价样本差异当作单词缀的确定价值。需要登录或限流时保留官网查询入口。
