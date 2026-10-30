# 发光球与数据流模块归档

状态：已从主页面解除挂载，源码保留，可按本文重新添加。

## 模块A：第二层中央发光球
- 完整运行源码：`orb-core.js`
- 样式：`orb-core-module.css`
- 主页面原挂载节点：`<main class="main-grid"><section class="center-stage" aria-label="中央发光球核心区域"><canvas id="orb-core-canvas" aria-label="动态发光粒子球"></canvas></section></main>`
- 原脚本：`assets/js/orb-core.js`；归档源码为当前页面使用的完整版本。

恢复时：在 `.app` 内恢复挂载节点，并在 `v9-events.js`、`market-cards.js` 前加载 `orb-core.js`。若要让数据流与发光球共享投影点，必须先加载发光球。

## 模块B：第四层正式信号数据流
- 完整运行源码：`orb-dynamic-data-streams.js`
- 当前素材库文件即完整模块源码，未删改其逻辑。
- 原主页面脚本挂载：`<script src="./章鱼素材库/web-modules/orb-particle-lab/orb-dynamic-data-streams.js?v=20261030-10"></script>`

恢复时：在 `market-cards.js` 之后加载该脚本；若同时恢复发光球，需确保发光球先初始化并发布 `window.VegasOrbProjectedPoints`。数据流仅根据正式信号名单绘制。

## 本次页面调整范围
只移除发光球画布节点、发光球脚本和数据流脚本。最新事件、第三层行情卡片、第五层K线及其加载桥接保持不变。
