# Padview WASM 示例

[API 参考：接口、消息、设置和 HTTP](./api.html) · [打开示例目录](./index.html)。八个示例共用 [Jack-the-Ripper◆ 的 Simai 谱面](./jack-the-ripper/maidata.txt)、配套音乐、封面和 PV。目录页不下载引擎。每次打开示例都会优先读取服务器当前的统一配置；静态部署或服务器没有配置时使用随示例保存的 [服务器配置副本](./profile.json)。八页都能从盘面下方打开与 MaiRis 相同的「播放器设置」，可按分类跳转、搜索，或在面板末尾开启开发者模式。Player 示例可以写回设置，「恢复默认」使用随示例保存的服务器配置副本；七个 Viewer 页面可以试调设置、编辑信息组件、套用服务器模板，切换难度会保留本页修改，刷新后重新读取服务器配置。「恢复本页示例」找回该页的初始展示，「使用载入时的统一配置」去掉示例的展示覆盖。手动游玩、保存全局配置和管理模板请使用 Player 示例。完整站点入口为 `/padview/demo/index.html`，旧入口 `/padview/demo.html` 仍可打开原始预览器。

| 页面 | 用途 |
| --- | --- |
| [原始预览器](./original.html) | Viewer 自动演奏、本页设置、导入本地 Simai 或单曲文件夹 |
| [Player 手动试玩](./player.html) | 完整资源、手动判定、配置保存与模板管理 |
| [透明盘面](./transparent.html) | 在棋盘格、深色和浅色背景上查看透明合成 |
| [信息组件总览](./components.html) | 实时对照所有组件类型及 BPM、下一段 Simai、计分明细 |
| [原版中心组件总览](./center.html) | 同时查看全部中心读数，用播放和进度条观察数值变化 |
| [中心字母与数字](./labels.html) | 独立切换原版标题贴图、文字、数字样式与数值显隐 |
| [封面背景](./cover.html) | 在盘面底层铺满、完整显示或平铺封面 |
| [PV 背景](./pv.html) | 在同一位置显示视频并跟随音乐进度 |

八个示例各自提供 **画布比例**：默认 **4:3**，还可选 **1:1** 或 **16:9**。切换只改变当前页面的外框，盘面始终居中且保持正方形，音乐和进度继续。两个总览在宽屏把实时组件列在盘面右侧，窄屏移到播放控件下方。其他示例的组件和背景仍叠在画布内。

原始 PV 是 HEVC。示例在支持 HEVC 的浏览器中使用原文件，其他浏览器自动使用同源的 VP9 WebM 版本。

## 选择资源包

两个包使用同一 WASM。主盘面挂载时选择；同一页的对比盘面复用该选择。

| `assetPack` | 基础素材（Brotli） | 适用场景 |
| --- | --- | --- |
| `player` | `assets-player.tar.br` | 完整手动判定和自动演奏；可选皮肤按需下载；原项目还提供额外音色和字体 |
| `viewer`（默认） | `assets-viewer.tar.br` | 自动预览；含音符、外框、中心 HUD、成功判定与击打音（含烟花）。省去其他判定和手动游玩音色，HTML 使用系统字体 |

第三方 `ldx-web` 的两个基础包都内置全部 Note 设计及对应特效。切换 Tap、Hold、Slide 或星星颜色不会触发下载；非默认外框和 FiNALE 判定等仍需部署对应的可选包。

```js
import {mountPadview} from '/padview/embed.js';
const view = mountPadview(stage, {assetPack: 'viewer', transparent: true});
```

独立入口可用 `/padview/index.html?assets=viewer&transparent=1`。Viewer 默认不访问配置后端；若要读取统一配置和模板并仅在本页试调，传入 `sharedConfig: 'read-only'`。Player 如需独立示例可显式传 `sharedConfig: false`。只部署默认 Viewer 时，保留宿主脚本、布局、`host.json`、WASM 和 Viewer 资源包；需要原版中心组件时一并提供 `center-digits.png`、`center-labels/`。无需部署 Player 包；若配置选用了可选皮肤，也要提供对应资源包。原项目另有可选音效和两款源泉圆体；第三方 `ldx-web` 包使用默认音色和系统字体。独立入口如需手动游玩传 `?assets=player`；对象接口传 `assetPack: "player"`。

## 使用原始预览器

[打开原始预览器](./original.html)。点击 **播放** 即可播放 Jack-the-Ripper◆，也可以用盘面上方的按钮加载本地谱面。文件在浏览器内读取，不会上传。

- **加载 Simai**：选择完整的 UTF-8 编码 Simai 文件（如 `maidata.txt` 或 `.simai`）。只加载谱面，没有背景音乐；击打音效仍按播放器设置播放。
- **加载文件夹**：选择一首歌的目录，根目录须包含 `maidata.txt` 或 `chart.json`，两者都有时优先 Simai。会一起读取 `track.mp3`、`bg.jpg`、`pv.mp4` 等配套文件。媒体名不同或位于子目录时，可在根目录的 `project_assets.json` 中用 `audio`、`cover`、`pv` 指定相对路径。音乐、封面和 PV 均可省略。

有多个难度时，默认打开最高难度，可用按钮旁的「难度」切换，无需重新选文件。

点击盘面下方的 **播放器设置**，即可使用与 MaiRis 相同的设置面板。桌面端在右栏显示，窄屏在盘面下方显示。可以搜索流速、背景亮度或音效，在 Player 示例切换手动游玩，用配置模板切换外观，或点「编辑信息」在盘面上调整 BPM、达成率等组件。勾选面板末尾的「开发者模式」可查看校准项。

**播放器设置 → 音频 / 音色 → 播放启动拍** 默认开启。整谱按开头 BPM 和 Simai 的 `&clock_count` 提前起播，未写时为 4 拍，写 `0` 或关闭开关则从谱面 0 秒开始。例：120 BPM、4 拍，从 −2 秒起每半秒响一声，0 秒进入正拍。音乐仍按 `&first` 对齐；从中间继续播放不会补响已经过的拍子。

盘内读数以正方形盘面为准：数字居中，标题在上方，生命值按整个表盘居中。切换画布比例或在旁边显示谱面信息不会移动盘心。「中心字母与数字」示例只显示标题时，标题本身居中。

要把盘内连击移到别处，打开 **编辑信息 → ＋ 添加 → PAD CENTER**，在气泡的 **中心读数** 选择 **连击**，然后把组件拖到预览区内想要的位置。**播放器设置 → 信息组件 → 保留原位中心信息** 默认开启；关闭后只显示你放置的组件。可重复添加，例如同时显示连击、达成率和生命值，也可选 **跟随盘内中心显示**，跟随谱面和原版设置切换读数。

默认模板的「中心标题」可选择原版字母贴图、普通文字或隐藏；「显示数值」可独立关闭，例如只放置 COMBO 标题。盘心和默认模板共用 SDEZ 数字贴图：连击、达成率、DX 分数、DX 星级余量、生命值及各档差值。差值的正负号、整数、小数和百分号使用原版字形；生命值数字叠在 LIFE 表盘中。想改为自己的字体或文字，取消 **默认模板使用原版数字**，或直接编辑模板，例如 `连击：{center_value}`；`{center_label}` 是该读数的名称。组件随统一配置与模板保存，也会出现在独立透明 HUD 中。

音量可以边播边调；在面板中调整流速或播放倍率会暂停并保留当前位置。Player 手动试玩示例与同一服务的预览页共用 `/api/padview/config`，修改设置会自动同步；只有静态文件的部署可以预览调整，但无法跨刷新保存配置和自定义模板。

## 在本地运行

已有预览服务时，直接访问其 `/padview/demo/index.html`（lambdaDX 和 MaiRis 的入口相同）。从仓库首次运行，在已安装 Rust WASM 目标和 Node.js 22+ 的环境中执行：

```bash
python3 tools/build_padview.py
cd docs-site
npm ci
npm run dev
```

打开 `http://localhost:3000/padview/demo/index.html`。构建脚本同时准备引擎、素材和示例谱面（歌曲在 `docs-site/public/padview/demo/jack-the-ripper/`）；资源就绪后，只改宿主 JS 或示例 HTML 不需要重编 Rust。静态部署时需保留站点根目录下的 `/padview/`，并为 .br 提供正确的 Content-Encoding，局域网 HTTP 支持 gzip 或解压传输。

## 把盘面放进自己的页面

在同一个站点新建一个 HTML 文件，加入以下内容即可加载保留给 SDK 接入测试的最小 JSON 练习谱，并暂停在第 2.5 秒：

```html
<div id="stage"></div>
<script type="module">
  import { mountPadview } from '/padview/embed.js';

  const view = mountPadview(document.querySelector('#stage'));
  const [, chartJson] = await Promise.all([
    view.ready,
    fetch('/padview/demo/chart.json').then(r => {
      if (!r.ok) throw Error('谱面读取失败：' + r.status);
      return r.text();
    }),
  ]);
  view.load(JSON.parse(chartJson), {chartJson});
  view.setTime(2.5, {seek: true});
</script>
```

`view.ready` 表示本盘面可以接收谱面；启动失败时会拒绝。载谱及所需皮肤的准备另行完成，宿主可在容器收到 `padview:settings-idle` 后启用播放按钮。传入原始 `chartJson` 能保留超过 JavaScript 安全整数范围的音符 ID。外层尺寸由页面 CSS 决定；SDK 基础样式是 16:9，这八个示例默认是 4:3，里面的盘面始终是正方形。总览用 `mountPadview(stage, { blocksContainer: document.querySelector("#overview-blocks") })` 把只读组件网格放进指定元素，与盘面共享同一份实时数据。

## 更换背景、控制时间

| 操作 | 写法 |
| --- | --- |
| 加载谱面，同时设置背景 | `view.load(chart, {chartJson, cover, video})` |
| 替换封面，保留进度 | `view.cover = coverInput` |
| 替换或移除 PV | `view.video = file`；`view.video = null` 移除 |
| 暂停在指定位置 | `view.setTime(12.5, {seek: true})` |
| 回放当前状态给监听者 | `view.requestState()` |
| 移除盘面 | `view.dispose()` |

封面和 PV 接受 URL 字符串、URL 对象、文件输入框、File、Blob、ArrayBuffer 和二进制视图。重新 `load` 会清除未传入的背景；只换媒体时直接赋值即可。PV 静音；媒体读取或解码失败时，容器会发出 `padview:media-error`。

在 **播放器设置 → 画布背景** 分别选择背景来源和铺设方式。**自动**优先用 PV，其次是封面；明确选择 **曲目封面** 或 **PV 视频** 时只用指定素材，缺少时显示黑色。也可直接选 **纯黑**。

示例使用服务器保存的背景来源、亮度与铺设方式。选择 **等比铺满（裁切）**、**完整显示（留边）** 或 **重复平铺**，背景就会覆盖包括信息区在内的整个预览框。与 Editor 一样，平铺从左上角开始，素材保持宽高比；平铺大小为 0.5 时，每一块的高度是画布高度的一半。全画布背景亮度默认 40%，盘内亮度默认单独设为 65%。关闭「盘内单独设置亮度」即可让全画布使用同一亮度；音符和文字不受影响。

例如，同时传入两种素材，但只平铺封面：

```js
view.cover = coverFile;
view.video = pvFile;
view.configure({patch: {
  'params.canvas_background.source': 'cover',  // auto | cover | video | black
  'params.canvas_background.layout': 'tile',  // off | fill | fit | tile
  'params.canvas_background.tile_scale': 0.5,
  'params.canvas_background.brightness': 0.4,
}});
```

自定义宿主可从 `/padview/embed.js` 导入 `previewStartTime(chart, countInEnabled)`，用返回值作为进度条下限和重播位置。播放前先调用 `await view.audio.unlock(audio)`（无音乐时省略参数），然后从该位置推进时钟，启动音由主盘面调度。若起点已在音乐文件内，先将 `audio.currentTime` 设为 `start + (chart.audio_offset || 0)`；否则先推进静音时钟，到达 `-chart.audio_offset` 再从音乐 0 秒开始。

`setTime` 接受**谱面秒数**。播放时，宿主应持续推送时间；仅调用一次不会启动音乐。示例在没有音乐时使用浏览器时钟；加载带音乐的文件夹后，播放和拖动进度会与本地音乐同步。如果以音乐元素作为时钟，可在宿主的动画帧回调中这样写，暂停或跳转时也同步一次：

```js
function sync(seek = false) {
  view.setTime(audio.currentTime - (chart.audio_offset || 0), {
    playing: !audio.paused && !audio.ended && !audio.seeking && audio.readyState >= 3,
    clockSource: 'media', rate: audio.playbackRate, seek,
  });
}
```

## 读 BPM、分数和错误

在挂载容器上监听更新。每个盘面只回报自己的数据：

```js
stage.addEventListener('padview-message', ({detail}) => {
  if (detail.type === 'padview:state') {
    console.log(detail.bpm, detail.dxScore, detail.achievement);
  } else if (detail.type === 'padview:error' || detail.type === 'padview:media-error') {
    console.error(detail.message);
  }
});
view.requestState();
```

一页只挂一个主盘面；用 `mountPadview(otherElement, {comparison: true})` 增加对比盘面并复用引擎。同页调用无需 iframe 或 `postMessage`；已有的 `view.send(...)` 和独立 iframe 接口仍可使用。

## 谱面秒数与设置目录

在「播放器设置 → 编辑信息」新增 **SECONDS**。默认显示两位小数（如 `-1.25 s`），与启动拍、暂停、进度跳转使用同一个谱面时钟。数值靠组件右边缘对齐，过零时小数点不会横移；标题仍使用组件的对齐设置。自定义文字可写 `当前：{seconds} 秒`；自绘 HTML 可读取 `padview:state.time`。

[API 参考](./api.html) 的设置目录由 Rust 生成。在仓库根目录更新并校验：

```bash
cargo run --quiet --locked --example padview_api_catalogue > /tmp/padview-catalogue.json && cp /tmp/padview-catalogue.json docs-site/public/padview/demo/api-catalogue.json
cargo test --locked --example padview_api_catalogue
```
