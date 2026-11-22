// One engine and WebGL surface per page; each mount is a distinct chart session.
const canvas = () => {
  const node = document.createElement('canvas');
  node.tabIndex = 0;
  node.setAttribute('aria-label', '谱面预览');
  node.style.cssText = 'display:block;width:100%;height:100%;outline:none';
  return node;
};
function script(url) {
  return new Promise((resolve,reject) => {
    const node = document.createElement('script'); node.async = false; node.src = url;
    node.onload = resolve; node.onerror = () => reject(Error('预览脚本加载失败：' + url));
    document.head.append(node);
  });
}
const createHost = () => ({
  panes: new Map(), sequence: 0, active: 0,
  dirty: true,
  beforeFrame() {
    // Commit only the final playhead for each pane before this display frame.
    // Keep polling Rust futures during startup and settings changes.
    let active = false;
    for (const pane of panes.values()) {
      pane.flushClock?.();
      if (!pane.needsFrame || pane.needsFrame()) active = true;
    }
    const draw = this.dirty || active;
    this.dirty = false;
    return draw;
  },
  initialize(start) {
    this.start = start;
    if(panes.has(0)) { this.started=true; start(panes.get(0)); }
  },
  ready() {
    this.running = true;
    for (const pane of panes.values()) if (!pane.send) this.start(pane);
  },
  aspect(id) {
    const pane = panes.get(id);
    if (!pane || (!pane.visible && pane.presented)) return 0;
    if (id === 0) return 1; // Primary only queries visibility, never aspect.
    const c = pane.canvas;
    return c?.clientHeight ? c.clientWidth / c.clientHeight : 0;
  },
  present(id, width, height) {
    const pane = panes.get(id); if (!pane) return;
    const src = this.surface, dst = pane.canvas;
    const w = Math.max(1,Math.round(src.width * width)), h = Math.max(1,Math.round(src.height * height));
    if (dst.width !== w) dst.width = w;
    if (dst.height !== h) dst.height = h;
    pane.context.globalCompositeOperation = 'copy';
    pane.context.drawImage(src,0,0,w,h,0,0,w,h);
    pane.presented = true;
  },
});
// A bundled React import and an independently imported /padview/embed.js must
// discover the same running engine when both are used in one document.
const hostKey = Symbol.for('lambdadx.padview.host');
const host = typeof window === 'undefined' ? createHost() : (window[hostKey] ||= createHost());
const panes = host.panes;
async function load(host) {
  const manifest = await host.fetch('/padview/host.json', {cache:'no-cache'}).then(r => {
    if (!r.ok) throw Error('无法读取预览器版本：HTTP ' + r.status);
    return r.json();
  });
  host.build = manifest.build;
  // Fetch concurrently; ordered dynamic scripts still execute in manifest order.
  await Promise.all(manifest.scripts.map(file => script('/padview/' + file)));
}
/** Full-chart start in chart seconds. Music offset affects the media cursor only. */
export function previewStartTime(chart, countIn = true) {
  const count = countIn ? Math.min(256, chart.clock_count ?? 4) : 0;
  if (!count) return 0;
  // Same measure-to-seconds conversion as the Editor, including pre-bar BPM changes.
  const measure = 1 - count / 4, bpms = chart.bpms || [];
  let previous = bpms[0]?.measure ?? 1, bpm = bpms[0]?.bpm ?? chart.bpm ?? 120, seconds = 0;
  for (let i = 1; i < bpms.length && bpms[i].measure < measure; i++) {
    seconds += (bpms[i].measure - previous) * 240 / bpm;
    ({measure:previous, bpm} = bpms[i]);
  }
  return Math.min(0, Math.fround(seconds + (measure - previous) * 240 / bpm));
}
export function mountPadview(element, {comparison=false, snapshot='', fetcher=fetch, defaultNoCore=false,
  assetPack='viewer', sharedConfig=assetPack==='player', defaultProfile, blocksContainer=null,
  transparent=(new URLSearchParams(location.search).get('transparent') ?? '1')==='1',
  hudChannel=comparison?'':(new URLSearchParams(location.search).get('hud') ?? 'stage')}={}) {
  if (!['player','viewer'].includes(assetPack)) throw Error('未知的 Padview 资源包：'+assetPack);
  if (!comparison && host.assetPack && host.assetPack!==assetPack) throw Error('同一引擎不能更换资源包，请重新载入页面');
  const id = comparison ? ++host.sequence : 0;
  if (!comparison && panes.has(0)) throw Error('此页面已有主预览器');
  // The two sites link the layout in their page head; standalone embeds may not.
  if (getComputedStyle(element).containerName !== 'padview' && !document.querySelector('link[data-padview-layout-css]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet'; link.href = '/padview/layout.css'; link.dataset.padviewLayoutCss = '';
    document.head.append(link);
  }
  const surface = !comparison && host.surface || canvas();
  surface.style.visibility='hidden';
  const status = document.createElement('div');
  const board = document.createElement('div'), info = document.createElement('section');
  board.className='padview-board'; info.className='padview-info'; info.setAttribute('aria-label','谱面信息');
  board.append(surface,status);
  element.dataset.padviewLayout=transparent?'overlay':'flow';
  status.style.cssText='position:absolute;inset:0;align-content:center;text-align:center;pointer-events:none;color:white';
  status.setAttribute('role','status'); status.textContent = '正在准备预览…';
  element.style.position='relative';
  element.toggleAttribute('data-padview-transparent',transparent);
  element.replaceChildren(board,info);
  let resolveReady, rejectReady;
  const ready = new Promise((resolve,reject) => { resolveReady=resolve; rejectReady=reject; });
  // Existing hosts can still listen exclusively to padview-message.
  ready.catch(() => {});
  let pending = [], closed = false, cover = null, video = null;
  function closeCommands(error) {
    closed = true; pending = cover = video = null;
    rejectReady(error);
  }
  const pane = {id, element, transparent, hudChannel, board, info, blocksContainer, canvas:surface, status, visible:true, presented:!comparison, mounted:performance.now(),
    emit(data) { queueMicrotask(() => {
      if (panes.get(id) !== pane) return;
      if (pending && data.type === 'padview:ready') {
        const commands = pending; pending = null;
        for (const command of commands) pane.send(command);
        resolveReady(data);
      } else if (pending && data.type === 'padview:error') closeCommands(Error(data.message));
      element.dispatchEvent(new CustomEvent('padview-message',{bubbles:true,detail:data}));
    }); }};
  if (comparison) {
    pane.context = surface.getContext('2d',{alpha:true});
  }
  const observer = typeof IntersectionObserver !== 'undefined' && new IntersectionObserver(entries => {
    pane.visible = entries[entries.length - 1].isIntersecting;
    host.dirty = true;
  });
  if (observer) observer.observe(surface);
  const resize = comparison && new ResizeObserver(() => { host.dirty = true; });
  if (resize) resize.observe(surface);
  host.dirty = true;
  panes.set(id,pane);
  const controller = element.padview = {
    ready,
    load(chart, options) { controller.send({...options, type:'padview:load', chart}); },
    get cover() { return cover; },
    set cover(source) { controller.send({type:'padview:cover', source}); },
    get video() { return video; },
    set video(source) { controller.send({type:'padview:video', source}); },
    setTime(time, {playing=false, seek, rate, sentAt, clockSource, audioBoundary}={}) {
      controller.send({type:'padview:time', time, playing, seek, rate, sentAt, clockSource, audioBoundary});
    },
    parseSource(request) { controller.send({...request, type:'padview:parse-source'}); },
    setPlayable(playable) { controller.send({type:'padview:playable', playable}); },
    requestState() { controller.send({type:'padview:get-state'}); },
    requestSettings() { controller.send({type:'padview:get-settings'}); },
    configure(options) { controller.send({...options, type:'padview:configure'}); },
    saveSettings() { controller.send({type:'padview:save-settings'}); },
    openTemplates() { controller.send({type:'padview:templates'}); },
    editInfo() { controller.send({type:'padview:edit-info'}); },
    send(message) {
      if (closed) return;
      if (message.type === 'padview:load') {
        cover = message.cover ?? null; video = message.video ?? null;
      } else if (message.type === 'padview:cover' || message.type === 'padview:video') {
        const source = ('source' in message ? message.source : message.url) ?? null;
        if (message.type === 'padview:cover') cover = source; else video = source;
      }
      if (pending) {
        pending.push(message);
      } else pane.send(message);
    },
    get audio() { return pane.audio; },
    get startup() { return pane.startup; },
    dispose() {
      if (panes.get(id)!==pane) return;
      closeCommands(new DOMException('预览已关闭', 'AbortError'));
      if (observer) observer.disconnect();
      if (resize) resize.disconnect();
      pane.dispose?.(); panes.delete(id); element.replaceChildren(); element.removeAttribute('data-padview-transparent'); delete element.dataset.padviewLayout;
      delete element.padview;
      if (!id) host.audio?.pause();
    },
  };
  if (!comparison) {
    host.assetPack=assetPack; host.sharedConfig=sharedConfig; host.defaultProfile=defaultProfile;
    host.surface = surface; host.snapshot = snapshot; host.defaultNoCore = defaultNoCore;
    host.fetch = (url, init) => fetcher(url, init); window.padviewHost = host;
    if (host.start && (host.running || !host.started)) {
      host.started=true; host.start(pane);

    } else {
      host.loading ||= load(host).catch(error => {host.error=error; for (const p of panes.values()) p.emit({type:'padview:error',message:error.message});});
    }
    host.wake?.();
  } else if (host.running) host.start(pane);
  if (host.error) pane.emit({type:'padview:error',message:host.error.message});
  return controller;
}
