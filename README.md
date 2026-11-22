# LambdaDX Web SDK

将整个 `ldx-web` 目录作为站点根目录。运行时、Viewer / Player 资源、默认击打音和可选皮肤、类型声明与示例都在包内。接入方不需要 Rust、Node.js、MaiRis 或 lambdaDX 后端。

第三方包只分发外框、音符皮肤与 FiNALE 可选资源。两种基础包都保留默认击打音，HTML 信息组件使用系统字体。从原项目导入配置时，额外音色和源泉圆体会回退到这些默认值，不会触发下载。

## License

使用本 SDK 时，只需在任意位置（如预览器旁、关于页面或项目 README 中）任选一种方式署名：

- 写上 `Viewer powered by LambdaDX websdk`。
- 用自己的话说明预览器使用了正在内测的 LambdaDX 项目的 Web SDK。

## 运行示例

```sh
cd ldx-web
python3 serve.py
```

用浏览器打开 `http://127.0.0.1:8000/`。首页本身就是一个可以查看源码的最小接入示例。需要从手机访问时使用 `python3 serve.py --bind 0.0.0.0 --port 8000`，在同一网络打开电脑的局域网 IP 和端口。

- [八个示例](./padview/demo/index.html)：播放、加载本地 Simai / 文件夹、封面 / PV、透明盘面、信息组件和手动试玩。示例使用[随包配置](./padview/demo/profile.json)，设置修改只在本页生效。
- [API 与设置目录](./padview/demo/api.html)：控制器、事件、媒体输入、多盘面、时钟、判定、HUD、设置和可选的服务端接口。
- [TypeScript 声明](./padview/embed.d.ts) 与 [可运行的最小示例](./index.html)。

## 嵌入到自己的页面

把本包的整个 `padview/` 复制到站点的公共资源目录，使它可以通过同源的 **`/padview/`** 访问。在页面内直接导入 ES 模块：

```html
<div id="stage"></div>
<script type="module">
  import {mountPadview} from '/padview/embed.js';
  const view = mountPadview(document.getElementById('stage'), {
    assetPack: 'viewer', sharedConfig: false
  });
  const response = await fetch('/padview/demo/chart.json');
  if (!response.ok) throw Error('HTTP ' + response.status);
  const chartJson = await response.text();
  await view.ready;
  view.load(JSON.parse(chartJson), {chartJson});
  view.setTime(2, {seek: true});
</script>
```

默认 `viewer` 自动演奏；需要手动判定时选 `player`，无配置后端时同样传 `sharedConfig: false`。播放时由宿主持续传入谱面秒数，见[音乐同步示例](./padview/demo/original.js)。同页多个盘面复用引擎，组件卸载时调用 `view.dispose()`。若要在多设备之间同步配置，实现 [GET / PUT 配置协议](./padview/demo/api.html#http) 后可启用 `sharedConfig`。

## 部署到现有静态服务器

`serve.py` 是仅依赖 Python 3.9+ 标准库的本地示例服务器。部署到自己的服务器或 CDN 时，保持 `/padview/` 路径，并按如下规则处理压缩文件；普通的 `python3 -m http.server` 不会为这些 URL 设置所需的响应头。

| 浏览器请求的 URL | 响应 Content-Type | 响应体 |
| --- | --- | --- |
| `/padview/padview.wasm.br` | `application/wasm` | 支持 Brotli 时发送原文件及 `Content-Encoding: br`；只支持 gzip 时发送同名 `.gz` 文件及 `Content-Encoding: gzip` |
| `/padview/assets-*.tar.br`、`/padview/options/*.tar.br` | `application/x-tar` | 同上；均不支持时返回解压后的字节，不设 `Content-Encoding` |

响应加 `Vary: Accept-Encoding`，不要再次压缩已有的压缩流。JS 模块以 JavaScript MIME 类型提供，更新时整套替换运行时和清单。Viewer 和 Player 共用一个 WASM；浏览器只请求所选基础包，额外素材按设置下载。生产环境不需要示例时，可移除 `padview/demo/`，并将自己的谱面和默认配置传给控制器。
