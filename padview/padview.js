/* global miniquad_add_plugin, register_plugins, init_plugins, plugins,
          importObject, wasm_exports, wasm_memory, version, FS, PadviewAssets */
'use strict';
(() => {
  const host = window.padviewHost;
  const options = host || window.padviewOptions || {};
  const base = new URL(host ? '/padview/' : './', location.href);
  const build = options.build || document.querySelector('meta[name="padview-build"]')?.content || '';
  const resource = name => {
    const url = new URL(name,base);
    url.searchParams.set('v',build || 'native3');
    if (options.snapshot) url.searchParams.set('snapshot',options.snapshot);
    return url.href;
  };
  const fetchStartup = (url, init={}) => (options.fetch || fetch)(url, {cache: options.snapshot?'default':'no-cache', ...init});
  const fetchPack = (name,init) => fetchStartup(resource(name),init);
  const pack = (options.assetPack ?? new URLSearchParams(location.search).get('assets')) === 'player' ? 'player' : 'viewer';
  let assets, core = true;
  let renderFailure = '', standaloneFailure;
  (host?.surface || document.querySelector('#glcanvas')).addEventListener('padview-render-failed', ({detail}) => {
    renderFailure = detail.reason + '，请重新载入预览。';
    console.error('[Padview 播放]', detail.reason, {build, panes:host?.panes.size ?? 1,
      chartTime:host?.panes.get(0)?.chartTime, cause:detail.cause});
    if (host) for (const pane of host.panes.values()) {
      if (pane.failRender) pane.failRender(renderFailure);
      else pane.emit({type:'padview:error',message:renderFailure,runtime:true});
    }
    else standaloneFailure?.(renderFailure);
  }, {once:true});
  function start(pane) {
  const surface = pane?.canvas || document.querySelector('#glcanvas');
  const status = pane?.status || document.querySelector('#status');
  const origin = location.origin, expectedBuild = build, id = pane?.id || 0;
  const beginning = pane?.mounted ?? 0;
  if (renderFailure) { pane?.emit({type:'padview:error',message:renderFailure,runtime:true}); return; }
  const startup = {
    build, pane: pane?.element.title || window.frameElement?.title || 'Padview',
    phases: [], current: pane ? '等待页面预览器' : 'iframe 文档与脚本', status:'loading', readyMs:null, totalMs:null,
    shared: Boolean(id), operations: [], chartMs:null,
  };
  if (pane) pane.startup = startup;
  if (!id) window.padviewStartup = startup;
  let phaseStart = beginning, details;
  const calls = new Map();
  // Select a destination for each call, including continuations after await.
  // Rust tags queued commands; synchronous replies route through the same view.
  const api = new Proxy({}, {get(_,key) {
    if (!wasm_exports?.[key]) return undefined;
    if (!calls.has(key)) calls.set(key,(...args) => {
      if (pane && host.panes.get(id)!==pane) return;
      if (host && key.startsWith('padview_') && !key.startsWith('padview_audio_')) {
        // A chart or settings command must see the preceding transport state.
        if (key !== 'padview_set_time' && clockDirty) flushTime();
        host.dirty = true;
      }
      const previous = host?.active;
      if (host) {host.active=id; wasm_exports.padview_select_view(id);}
      try { return wasm_exports[key](...args); }
      finally {if (host) host.active=previous;}
    });
    return calls.get(key);
  }});
  const ms = value => Math.round(value * 10) / 10;
  function log(row) {
    console.info(`[Padview 启动] ${startup.pane} #${id} · ${row.phase}：${row.ms} ms`, row);
  }
  function operation(label, since, extra) {
    const row={phase:label, startMs:ms(since-beginning), ms:ms(performance.now()-since), ...extra};
    startup.operations.push(row); log(row);
  }
  async function timed(label, work) {
    const since=performance.now();
    try {return await work();}
    finally {operation(label,since);}
  }
  function phase(next) {
    if (startup.status !== 'loading') return;
    const now = performance.now();
    const row = { phase: startup.current, ms: ms(now - phaseStart), ...details };
    startup.phases.push(row); log(row);
    phaseStart = now;
    startup.current = next;
    details = undefined;
  }
  function reportStartup(error) {
    if (startup.status !== 'loading') return;
    const last = error?.startupStep || startup.current;
    phase(null);
    startup.totalMs = ms(phaseStart-beginning);
    startup.status = error === undefined ? 'complete' : 'failed';
    if (error !== undefined) startup.error = String(error);
    const slowest = startup.phases.reduce((a, b) => a.ms >= b.ms ? a : b);
    const result = startup.error ? `失败于 ${last}：${startup.error}` : `最慢：${slowest.phase} ${slowest.ms} ms`;
    console.groupCollapsed(`[Padview 启动] ${startup.pane} · ${startup.build} · 引擎 ${startup.totalMs} ms · ${result}`);
    console.table(startup.phases);
    console.groupEnd();
  }
  async function readStartupFile(name, label) {
    const since=performance.now();
    const url = resource(name);
    try {
      const response = await fetchStartup(url);
      if (!response.ok) throw new Error(`${label}尚未部署（HTTP ${response.status}）`);
      const bytes = await response.arrayBuffer();
      // MaiRis adds a snapshot query and may retry. Use the final response for
      // sizes; the enclosing stage includes all attempts and HTTP decompression.
      const pathname = new URL(url, location.href).pathname;
      const entry = performance.getEntriesByType('resource').filter(e =>
        e.startTime >= since-1 && new URL(e.name, location.href).pathname === pathname).at(-1);
      const sizes = { decodedKiB: Math.round(bytes.byteLength / 1024) };
      if (entry) Object.assign(sizes, {
        encodedKiB: Math.round(entry.encodedBodySize / 1024), transferKiB: Math.round(entry.transferSize / 1024),
      });
      operation(label+'：请求并读取',since,sizes);
      return bytes;
    } catch (error) {
      const wrapped=new Error(label+'：'+(error.message || error),{cause:error});
      wrapped.startupStep=label+'：请求并读取';
      operation(wrapped.startupStep,since,{error:wrapped.message});throw wrapped;
    }
  }
  let ready = false;
  let pendingChart = null;
  let pendingSource = null;
  let waitingCover;
  function submitCover(bytes) {
    if (!ready) { waitingCover=bytes; return; }
    api.padview_cover(allocate(bytes),bytes.length);
  }
  const media = PadviewMedia.create({container:pane?.element || document.body,cover:submitCover,dirty:()=>{if(host)host.dirty=true;},
    error:(kind,e)=>emit({type:'padview:media-error',kind,message:String(e?.message || e)})});
  let pendingTime = { time: 0, playing: false };
  let clockDirty = true;
  let autoplay = true;
  function applyInputMode(requested) {
    const playable = !id && core && requested;
    autoplay = !playable;
    if (surface.dataset.playable !== String(playable)) {
      surface.dataset.playable=String(playable);
      surface.dispatchEvent(new Event('padview-input-mode'));
    }
    if (ready) api.padview_set_mode(autoplay ? 1 : 0);
    profiles?.mode(playable);
    emit({type:'padview:input-mode', playable});
  }


  let tasks = Promise.resolve(), generation = 0, requestId = 0, currentProfile = null, chartProfile = null;
  const settingRequests = new Map();
  const appliedRequests = new Map();
  let pendingTasks = 0;
  if (pane) {
    pane.flushClock = () => { if (clockDirty) flushTime(); };
    pane.needsFrame = () => !ready || pendingTasks > 0 || pendingTime.playing;
  }
  const readJson = (pointer, length) => JSON.parse(new TextDecoder().decode(new Uint8Array(wasm_memory.buffer, pointer, length)));
  function allocate(bytes) {
    const pointer = api.allocate_vec_u8(bytes.length);
    new Uint8Array(wasm_memory.buffer, pointer, bytes.length).set(bytes); return pointer;
  }
  function sendJson(method, value) {
    const bytes = new TextEncoder().encode(JSON.stringify(value)); method(allocate(bytes), bytes.length);
  }
  function prepareProfile(presentation) {
    return new Promise((resolve, reject) => {
      const request = ++requestId; settingRequests.set(request, { resolve, reject });
      sendJson(api.padview_prepare_profile, { request, presentation: assets.presentation(presentation) });
    });
  }
  function preparePatch(patch, reset) {
    return new Promise((resolve, reject) => {
      const request = ++requestId; settingRequests.set(request, { resolve, reject });
      sendJson(api.padview_configure, { request, patch: assets.patch(patch), reset });
    });
  }
  function enqueue(operation, fatal = false) {
    pendingTasks++;
    tasks = tasks.then(operation).catch(error => fatal ? fail(error) : emit({ type: 'padview:settings-error', message: String(error.message || error) }))
      .finally(() => { if (--pendingTasks === 0) emit({ type: 'padview:settings-idle' }); });
    return tasks;
  }
  function installAssets(files) {
    const names = new TextEncoder().encode(JSON.stringify([...assets.files.keys()]));
    const allocateAsset = bytes => {
      const ptr=wasm_exports.allocate_vec_u8(bytes.length);
      new Uint8Array(wasm_memory.buffer,ptr,bytes.length).set(bytes);
      return ptr;
    };
    wasm_exports.padview_asset_manifest(allocateAsset(names), names.length);
    for (const [name, bytes] of files) {
      // Sound decoding also reads the Rust cache. Optional sounds reach this
      // loop only after their selected pack has been downloaded.
      const filename = new TextEncoder().encode(name);
      const namePtr = allocateAsset(filename), dataPtr = allocateAsset(bytes);
      wasm_exports.padview_asset(namePtr, filename.length, dataPtr, bytes.length);
    }
  }
  async function applyProfile(plan, epoch, measure=false) {
    const packStart=performance.now();
    const extra = await assets.loadPacks(plan.packs || [],fetchPack);
    if (extra.files.size) { installAssets(extra.files); wasm_exports.padview_select_view(0); wasm_exports.padview_resources_changed(extra.flags); }
    if(measure)operation('准备可选配置素材',packStart,{packs:plan.packs||[],installed:extra.files.size});
    if (epoch !== generation) return false;
    await new Promise(resolve => {
      const request = ++requestId; appliedRequests.set(request, resolve);
      sendJson(api.padview_presentation, { request, presentation: plan.prepared });
    });
    return epoch === generation;
  }
  // Only the primary owns voices and the media clock. Comparisons never decode or schedule audio.
  const audio = id ? {play(){},schedule(){},stop(){},setPreferences(){},setTransport(){}} : (host?.audio || new PadviewAudio());
  if (pane) pane.audio = id ? null : audio;
  if (!id) { window.padviewAudio=audio; if(host) host.audio=audio; }

  let disposed = false;
  const emit = message => {
    if (disposed) return;
    if (pane) pane.emit(message);
    else if (window.parent !== window) window.parent.postMessage(message, origin);
    else queueMicrotask(() => window.dispatchEvent(new CustomEvent('padview-message',{detail:message})));
  };
  const query = new URLSearchParams(location.search);
  const transparent = pane ? pane.transparent : (query.get('transparent') ?? '1') === '1';
  if (!pane && transparent) {
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';
  }
  if (!pane) document.body.dataset.padviewLayout=transparent?'overlay':'flow';
  const info=pane?.info || document.querySelector('.padview-info');
  const hud = PadviewHud.create(info, pack === 'viewer' || PadviewAssets.bundledSettings ? null : async (name,pack) => {
    if (!assets.get(name)) await timed('按需读取 HUD 字体 '+pack,()=>assets.loadPacks([pack],fetchPack));
    return assets.get(name);
  },
    {flow:!transparent, board:surface.parentElement, blocksContainer:pane?.blocksContainer,
      commit:id?null:patch=>receive({type:'padview:configure',patch})});
  const sharedConfig=options.sharedConfig ?? (pack==='player'), readOnlyConfig=sharedConfig==='read-only';
  const profiles=id || !sharedConfig ? null :PadviewProfiles.create({container:info,transparent,readOnly:readOnlyConfig,canPlay:pack==='player',
    apply:m=>receive({type:'padview:configure',...m}),
    notify:message=>emit({type:'padview:sync-status',message})});
  // The first comparison can receive its chart before the primary. Both wait
  // for the same backend read instead of momentarily applying packaged defaults.
  let initialConfig, initialPlayable=false;
  if (!id) {
    initialConfig=timed('读取统一配置',async()=>await profiles?.load() || await options.defaultProfile?.()).then(saved=>{
      initialPlayable=saved?.playable===true; return saved;
    });
    if(host)host.initialConfig=initialConfig;
  } else initialConfig=host.initialConfig;
  const channelName = pane ? pane.hudChannel : (query.get('hud') ?? 'stage');
  const channel = channelName && typeof BroadcastChannel !== 'undefined'
    ? new BroadcastChannel('padview.hud.' + channelName) : null;
  let layoutMessage, stateMessage, layoutKey, chartSettingsDone, chartSubmitted = false;
  function publish(message) { emit(message); channel?.postMessage(message); }
  function replay(send) {
    if (layoutMessage) send(layoutMessage);
    if (stateMessage) send(stateMessage);
  }
  if (channel) channel.onmessage = e => {
    if (e.data?.type === 'padview:get-state') replay(m => channel.postMessage(m));
  };
  function clearHud() {
    chartSettingsDone?.(); chartSettingsDone=null;
    chartSubmitted=false; profiles?.chart(false); layoutKey=layoutMessage=stateMessage=null; hud.clear(); publish({type:'padview:clear'});
  }
  function fail(error) {
    if (disposed) return;
    clearHud();
    reportStartup(error ?? '未知错误');
    audio.stop();
    ready = false;
    const message = error instanceof Error ? error.message : String(error);
    status.hidden = false;
    status.textContent = renderFailure || `预览载入失败：${message}`;
    status.setAttribute('role', 'alert');
    emit({ type: 'padview:error', message, runtime: Boolean(renderFailure) });
  }
  if (pane) pane.failRender=fail; else standaloneFailure=fail;
  function sendChart(chart, chartJson, presentation, viewerProfile) {
    audio.stop();
    if (!ready) { pendingChart = { chart, chartJson, presentation, viewerProfile }; return; }
    const epoch = ++generation;
    const initialChart=startup.chartMs===null;
    if(initialChart)operation('引擎就绪至收到谱面',beginning+startup.readyMs);
    clearHud();
    emit({ type: 'padview:settings-busy' });
    enqueue(async () => {
    const params = JSON.parse(new TextDecoder().decode(assets.get('note_params.json')));
    chartProfile = presentation || { params: options.defaultNoCore ? {...params,no_core:true} : params, note_speed: params.note_speed_default, touch_speed: params.touch_speed_default, slide_fade_in: params.slide_fade_in };
    let profile = chartProfile;
    const saved=readOnlyConfig && presentation ? await initialConfig :
      await (initialConfig || profiles?.load()) || await options.defaultProfile?.();
    initialConfig=null;
    if(epoch!==generation)return;
    if(saved){profile=((!profiles || readOnlyConfig) && !id && presentation) || saved.presentation;if(!id)applyInputMode(saved.playable);}
    if(viewerProfile && (!saved||id))profile=viewerProfile;
    let plan;
    const profileStart=performance.now();
    try { plan = await prepareProfile(profile); }
    catch { if (epoch !== generation) return; plan = await prepareProfile(chartProfile); }
    if(initialChart)operation('校验当前谱面配置',profileStart);
    const applyStart=performance.now();
    if (!await applyProfile(plan, epoch, initialChart)) return;
    if(initialChart)operation('应用当前配置（含可选素材）',applyStart);
    const bytes = new TextEncoder().encode(typeof chartJson === 'string' ? chartJson : JSON.stringify(chart));
    if (bytes.length > 32 * 1024 * 1024) throw new Error('预览谱面不能超过 32 MiB');
    const pointer = api.allocate_vec_u8(bytes.length);
    new Uint8Array(wasm_memory.buffer, pointer, bytes.length).set(bytes);
    // Rust consumes the allocation once, including on invalid JSON.
    chartSubmitted=true;profiles?.chart(true);
    chartQueued=performance.now();
    // Both calls enqueue commands. Hosts enable playback on settings-idle;
    // keep this task busy until Rust reports the effective chart settings.
    await new Promise(resolve => {
      chartSettingsDone=resolve;
      api.padview_load_chart(pointer, bytes.length);
      api.padview_get_settings();
    });
    }, true);
  }
  function flushTime() {
    if (!ready) return;
    clockDirty = false;
    api.padview_set_time(pendingTime.time, pendingTime.playing ? 1 : 0);
  }
  function parseSource(message) {
    audio.stop();
    if (!ready) { pendingSource = message; return; }
    if (!Number.isSafeInteger(message.request) || message.request <= 0 || message.request > 0xffffffff
        || typeof message.name !== 'string' || typeof message.source !== 'string'
        || (message.diff !== undefined && !Number.isInteger(message.diff))) throw new Error('源谱面参数无效');
    const bytes = new TextEncoder().encode(JSON.stringify({ request: message.request, name: message.name, source: message.source, diff: message.diff }));
    const pointer = api.allocate_vec_u8(bytes.length);
    new Uint8Array(wasm_memory.buffer, pointer, bytes.length).set(bytes);
    const since=performance.now();
    api.padview_parse_source(pointer, bytes.length);
    if(startup.chartMs===null)operation('解析谱面源文件',since);
  }
  let chartQueued=0;
  const plugin = {
    name: 'padview', version: 1,
    register_plugin(imports) {
      imports.env.padview_startup_phase = (ptr, len) =>
        phase(new TextDecoder().decode(new Uint8Array(wasm_memory.buffer, ptr, len)));
      imports.env.padview_first_frame = () => {
        if(!chartSubmitted || disposed)return;
        surface.style.visibility='visible'; status.hidden=true;
        if(startup.chartMs===null) {
          startup.chartMs=ms(performance.now()-beginning);
          operation('装载谱面并绘制首帧',chartQueued);
          console.info(`[Padview 启动] ${startup.pane} #${id} · 当前配置首帧：${startup.chartMs} ms`);
        }
      };
      // Keep miniquad's generic file API backed by the same archive.
      imports.env.fs_load_file = (pointer, length) => {
        const name = new TextDecoder().decode(new Uint8Array(wasm_memory.buffer, pointer, length));
        const id = FS.unique_id++;
        FS.loaded_files[id] = assets?.get(name) ?? null;
        queueMicrotask(() => wasm_exports.file_loaded(id));
        return id;
      };
      imports.env.padview_sound_buffer = (id, pointer, length, channels, rate) =>
        audio.register(id, new Float32Array(wasm_memory.buffer, pointer, length), channels, rate);
      imports.env.padview_sound_release = (id) => audio.release(id);
      imports.env.padview_sound_play = (id, gain, offset, duration, speed, bus) =>
        audio.play(id, gain, offset, duration, speed, bus);
      imports.env.padview_sound_schedule = (id, gain, at, offset, duration, speed) =>
        audio.schedule(id, gain, at, offset, duration, speed);
      imports.env.padview_sound_stop = (bus) => audio.stop(bus < 0 ? undefined : bus);
      imports.env.padview_error = (pointer, length) => {
        fail(new TextDecoder().decode(new Uint8Array(wasm_memory.buffer, pointer, length)));
      };
      imports.env.padview_parsed_source = (pointer, length) => {
        const response = JSON.parse(new TextDecoder().decode(new Uint8Array(wasm_memory.buffer, pointer, length)));
        emit({ type: 'padview:parsed-chart', ...response });
      };
      imports.env.padview_cover_error = (ptr,len)=>emit({type:'padview:media-error',kind:'cover',message:new TextDecoder().decode(new Uint8Array(wasm_memory.buffer,ptr,len))});
      imports.env.padview_backdrop_radius = media.setRadius;
      imports.env.padview_video_size = media.size;
      imports.env.padview_video_upload = media.upload;
      imports.env.padview_transparent = () => Number(transparent);
      imports.env.padview_state_result = (pointer,length) => {
        if (!chartSubmitted || !layoutMessage) return;
        stateMessage = {type:'padview:state', ...readJson(pointer,length)};
        hud.update(stateMessage); publish(stateMessage);
      };
      imports.env.padview_settings_result = (pointer, length) => {
        const result = readJson(pointer, length);
        if (result.catalogue) result.catalogue = assets.catalogue(result.catalogue);
        if (result.presentation) result.presentation = assets.presentation(result.presentation);
        if (result.applied) {
          const resolve = appliedRequests.get(result.applied);
          if (resolve) { appliedRequests.delete(result.applied); resolve(); }
        } else if (result.request) {
          const request = settingRequests.get(result.request);
          if (request) { settingRequests.delete(result.request); result.error ? request.reject(new Error(result.error)) : request.resolve(result); }
        } else if (result.presentation && !chartSubmitted && requestedSettings) {
          requestedSettings=false;
          emit({type:'padview:settings',...result,busy:pendingTasks>0});
        } else if (result.presentation && chartSubmitted) {
          currentProfile = result.presentation;
          media.configure(currentProfile.params.canvas_background);
          profiles?.set(result,!autoplay);
          const settings = currentProfile.params.info_blocks;
          const key = JSON.stringify(settings);
          if (key !== layoutKey) {
            layoutKey = key; layoutMessage = {type:'padview:hud-layout',settings};
            hud.layout(settings,result.catalogue); publish(layoutMessage);
          }
          audio.setPreferences(currentProfile.params);
          emit({ type: 'padview:settings', ...result, busy: pendingTasks > 0 });
          chartSettingsDone?.(); chartSettingsDone=null;
        }
      };
      imports.env.padview_ready = () => {
        startup.readyMs = ms(performance.now()-beginning);
        reportStartup();
        ready = true;
        if(waitingCover){submitCover(waitingCover);waitingCover=undefined;}
        if (host && !id && !host.running) host.ready();
        if(!pane)status.hidden = true;
        applyInputMode(initialPlayable || !autoplay);
        if (pendingChart) { const item = pendingChart; pendingChart = null; sendChart(item.chart, item.chartJson, item.presentation, item.viewerProfile); }
        if (pendingSource) { const item = pendingSource; pendingSource = null; parseSource(item); }
        flushTime();
        emit({ type: 'padview:ready', capabilities: { playable: !id && core, htmlHud: true, backgroundMedia:true }, build: { id: (api.padview_build_id?.() >>> 0).toString(16).padStart(8, '0') || null } });
      };
    },
  };
  if (pane) { const imports={env:{}}; plugin.register_plugin(imports); pane.hooks=imports.env; }
  let requestedSettings=false;
  function receive(message) {
    if (renderFailure) return;
    try {
      if (message.type === 'padview:load') {
        if (!message.chart || typeof message.chart !== 'object' || !Array.isArray(message.chart.notes)) throw new Error('谱面内容无效');
        void media.setCover(message.cover);media.setVideo(message.video);
        sendChart(message.chart, message.chartJson, message.presentation, message.viewerProfile);
      } else if (message.type === 'padview:edit-info') { hud.edit();
      } else if (message.type === 'padview:templates') { profiles?.open();
      } else if (message.type === 'padview:get-state') {
        replay(emit);
      } else if (message.type === 'padview:get-settings') {
        if (ready) {requestedSettings=!chartSubmitted;api.padview_get_settings();}
      } else if (message.type === 'padview:configure') {
        const epoch = generation;
        emit({ type: 'padview:settings-busy' });
        return enqueue(async () => {
          const defaults=message.reset && options.defaultProfile ? await options.defaultProfile() : null;
          const plan = defaults ? await prepareProfile(defaults.presentation) : message.presentation ? await prepareProfile(message.presentation) : message.restoreChart ? await prepareProfile(chartProfile) : await preparePatch(message.patch || {}, message.reset === true);
          if (epoch !== generation) return;
          if (message.reset && !id) applyInputMode(defaults?.playable===true);
          if (plan.audioChanged !== false) audio.stop();
          if (!await applyProfile(plan, epoch)) return;
          if(typeof message.templatePlayable==='boolean')applyInputMode(message.templatePlayable);
          if(!message.remote && chartSubmitted && currentProfile)void profiles?.saveProfile(currentProfile,!autoplay);
        });
      } else if (message.type === 'padview:save-settings') {
        enqueue(async () => {
          if(currentProfile&&await profiles?.saveProfile(currentProfile,!autoplay))emit({type:'padview:settings-saved'});
        });
      } else if (message.type === 'padview:parse-source') {
        try { parseSource(message); }
        catch (error) { emit({ type: 'padview:parsed-chart', request: message.request, error: String(error.message || error) }); }
      } else if (message.type === 'padview:cover') {
        void media.setCover('source' in message?message.source:message.url);
      } else if (message.type === 'padview:video') {
        media.setVideo('source' in message?message.source:message.url);
      } else if (message.type === 'padview:time') {
        if (!Number.isFinite(message.time) || Math.abs(message.time) >= 1e8 || typeof message.playing !== 'boolean') return;
        media.transport(message.time,message.playing,message.rate,message.seek===true);
        if (!message.playing && !pendingTime.playing && message.time === pendingTime.time && !message.seek) return;
        if (message.seek === true || message.time < pendingTime.time - 0.01 || message.time - pendingTime.time > 0.5) audio.stop();
        audio.setTransport(message.time, message.playing, message.sentAt, message.seek === true, message.clockSource, message.audioBoundary, message.rate);
        pendingTime = { time: message.time, playing: message.playing };
        clockDirty = true;
        if (pane) pane.chartTime=message.time;
        if (!host?.beforeFrame) flushTime();
        if (!id) updateAudioPump();
      } else if (message.type === 'padview:playable' || message.type === 'padview:mode') {
        const manual = message.type==='padview:playable' ? message.playable :
          typeof message.autoplay==='boolean' ? !message.autoplay : undefined;
        if (typeof manual !== 'boolean' || (!id && core && manual) === !autoplay) return;
        audio.stop(); applyInputMode(manual);
        if(chartSubmitted&&currentProfile)void profiles?.saveProfile(currentProfile,!autoplay);
      }
    } catch (error) { fail(error); }
  }
  const lifetime = new AbortController(), listen={signal:lifetime.signal};
  if (pane) pane.send=receive;
  else window.addEventListener('message', event => {
    if(event.source===window.parent && event.origin===origin && event.data && typeof event.data==='object') receive(event.data);
  },listen);
  // Keyboard events belong to the canvas after a pointer/touch interaction.
  if (!id) surface.addEventListener('pointerdown', () => { if (!autoplay) {surface.focus({preventScroll:true}); void audio.unlock().catch(fail);} },listen);
  if (!id) surface.addEventListener('keydown', (event) => {
    if (autoplay) return;
    void audio.unlock().catch(fail);
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
  },listen);
  if (!pane) window.addEventListener('error', (event) => fail(event.error || event.message));
  if (!pane) window.addEventListener('unhandledrejection', (event) => fail(event.reason));
  document.addEventListener('visibilitychange', () => {
    media.sync();
    if (document.hidden) audio.setTransport(pendingTime.time, false);
    if (!id) updateAudioPump();
  },listen);
  let sampling = false, audioTimer = 0;
  function stopSampling() {
    if (sampling) { api.padview_audio_stop(); sampling = false; }
  }
  function updateAudioPump() {
    if (!pendingTime.playing || document.hidden) {
      clearInterval(audioTimer); audioTimer = 0;
      stopSampling();
      return;
    }
    if (!audioTimer) audioTimer = setInterval(pumpAudio, 10);
    pumpAudio();
  }
  function pumpAudio() {
    if (renderFailure || !ready) return;
    if (document.hidden || audio.time() === null || !api.padview_audio_ready?.()) {
      stopSampling(); return;
    }
    const from = audio.time(), clock = audio.clock;
    if (audio.needsReset) {
      api.padview_audio_stop(); audio.needsReset = false;
      // The clock can already be a few ms past the first click on the Play gesture.
      clock.clickUntil = Math.max(from - .025 * clock.rate, clock.start - 0.000001);
    }
    if (from < 0 && currentProfile?.params.preview_count_in !== false) {
      const end = Math.min(0, clock.boundary, from + .15 * clock.rate);
      const begin = Math.max(clock.clickUntil ?? from, from - .025 * clock.rate);
      if (end > begin) { api.padview_audio_count_in(begin, end); clock.clickUntil = end; }
    }
    if (!autoplay) { stopSampling(); return; }
    const to = Math.min(from + 0.15 * audio.clock.rate, audio.clock.boundary - 0.000002);
    if (to >= from) { api.padview_audio_tick(from, to); sampling = true; }
  }
  const dispose=() => {
    if (disposed) return;
    surface.dataset.playable='false';surface.dispatchEvent(new Event('padview-input-mode'));
    clearHud(); disposed=true; channel?.close(); hud.remove(); profiles?.remove();
    generation++; lifetime.abort(); clearInterval(audioTimer); audio.stop(); media.dispose();
    if(id && !renderFailure) api.padview_detach_view?.();
    for (const entry of settingRequests.values()) entry.reject(Error('预览已关闭'));
    for (const resolve of appliedRequests.values()) resolve();
  };
  if (pane) pane.dispose=dispose;
  window.addEventListener('pagehide',event => { if (!event.persisted) dispose(); },listen);
  if (id || host?.running) {
    surface.dataset.padviewBuild=expectedBuild;
    if(id) api.padview_attach_view();
    else pane.hooks.padview_ready();
    return;
  }
  miniquad_add_plugin({name:plugin.name,version:plugin.version,register_plugin(imports) {
    plugin.register_plugin(imports);
    imports.env.padview_output_view = key => {if(host) host.active=key;};
    imports.env.padview_view_aspect = key => host ? host.aspect(key) : (key === 0 ? 1 : 0);
    imports.env.padview_present_view = (key,w,h) => {
      host.present(key,w,h);
    };
    if(host) for (const key of Object.keys(pane.hooks)) {
      if(['fs_load_file','padview_sound_buffer','padview_sound_release'].includes(key)) continue;
      imports.env[key]=(...args) => (host.panes.get(host.active)?.hooks || (host.active===0 && pane.hooks))?.[key]?.(...args);
    }
  }});


  // Use the pinned miniquad loader's imports and callbacks while propagating
  // instantiation/fetch errors to the containing player instead of logging only.
  (async () => {
    phase('注册加载器');
    register_plugins(plugins);
    phase('并行加载程序、素材与配置');
    const [module,archive,saved]=await Promise.all([
      readStartupFile('padview.wasm.br','WASM').then(bytes=>timed('WASM 编译',()=>WebAssembly.compile(bytes))),
      readStartupFile('assets-'+pack+'.tar.br','基础素材包'), initialConfig,
    ]);
    phase('WASM 导入检查与实例化');
    for (const item of WebAssembly.Module.imports(module)) {
      if (!(item.name in (importObject[item.module] || {}))) throw new Error(`预览程序与加载脚本版本不一致：${item.name}`);
    }
    const instance = await WebAssembly.instantiate(module, importObject);
    phase('校验版本并初始化插件');
    wasm_memory = instance.exports.memory;
    wasm_exports = instance.exports;
    const actualBuild = (wasm_exports.padview_build_id?.() >>> 0).toString(16).padStart(8, '0');
    if (expectedBuild && actualBuild !== expectedBuild) throw new Error('预览程序与页面版本不一致，请刷新页面后重试。');
    surface.dataset.padviewBuild = actualBuild || 'unversioned';
    core = pack==='player' && Boolean(wasm_exports.padview_has_gameplay_core?.() ?? true);
    if (wasm_exports.crate_version() !== version) throw new Error('miniquad 加载脚本版本不一致');
    init_plugins(plugins);
    phase('素材 TAR 解包');
    assets = PadviewAssets.fromTar(new Uint8Array(archive));
    details = { files: assets.files.size };
    if(saved?.presentation) {
      phase('准备已保存配置的素材');
      // Use the same Rust validation and resource selection as a live change.
      let plan;
      try {plan=await prepareProfile(saved.presentation);} catch { /* sendChart falls back to the chart profile */ }
      if(plan) {
        await assets.loadPacks(plan.packs || [],fetchPack);
        assets.files.set('padview_boot_profile.json',new TextEncoder().encode(JSON.stringify(plan.prepared)));
      }
    }
    phase('安装素材到 WASM');
    installAssets(assets.files);
    phase('创建 WebGL 上下文与启动主循环');
    wasm_exports.main();
  })().catch(error => {
    if(host) host.error=error;
    fail(error);
    if(host) for(const other of host.panes.values()) if(other!==pane) other.emit({type:'padview:error',message:String(error.message||error)});
  });
  }
  if(host) host.initialize(start); else start(null);
})();
