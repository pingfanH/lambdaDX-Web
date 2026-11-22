import { mountPadview, previewStartTime } from '../embed.js';
import { ViewerSettings } from '../viewer-settings.js';

import {bundledProfile, exampleLayout, mountSettingsPanel} from './showcase.js';

const $ = id => document.getElementById(id);
const stage = $('stage'), seek = $('seek'), play = $('play'), notice = $('notice');
const music = $('music'), difficulty = $('difficulty');
const mode=document.body.dataset.example || 'original', full=mode==='player';
const sharedSettings=!document.documentElement.hasAttribute('data-standalone-demo');
mountSettingsPanel(full, Boolean($('overview-blocks')), sharedSettings);
const aspect=$('aspect');
aspect.onchange=()=>{stage.dataset.aspect=aspect.value;};
aspect.onchange();
const view=mountPadview(stage,{hudChannel:'',transparent:true,assetPack:full?'player':'viewer',
  blocksContainer:$('overview-blocks'),sharedConfig:sharedSettings && (full || 'read-only'),defaultProfile:bundledProfile});
let savedPresentation, examplePresentation;
let playing = false, frame = 0, last = 0, rate = 1, time = Number(seek.min), operation = 0;
let audioUrl = '', offset = 0, chartEnd = 14, loadedChart = null, countIn = true, hasChart = false, failed = false;
let current = null, generation = 0, pending = null;

function enableControls() {
  const disabled=failed || !hasChart || !settings.ready;
  if ($('background')) $('background').disabled=disabled;
  $('controls').disabled = disabled || (!!audioUrl && !Number.isFinite(music.duration));
}
function transport(profile) {
    syncQuickControls(profile.params);
    const bg=profile.params.canvas_background;
    if(!full && current?.bundledMedia && bg.layout!=='off'){
      const media=current.bundledMedia;
      if(!current.cover && bg.source!=='video')view.cover=current.cover=media.cover;
      if(!current.video && ['auto','video'].includes(bg.source))view.video=current.video=media.video;
    }
    rate = profile.params.play_speed_default || 1; music.playbackRate = rate;
    const enabled = profile.params.preview_count_in !== false;
    if (enabled !== countIn) {
      const oldStart = Number(seek.min); countIn = enabled; updateRange();
      if (hasChart && (time < Number(seek.min) || time === oldStart)) position(Number(seek.min));
    }
}
const settings=new ViewerSettings({frame:stage,stop:pause,changed:enableControls,transport});
if(!full){
  $('settings-restore').onclick=()=>settings.configure({presentation:examplePresentation});
  $('settings-reset').onclick=()=>settings.configure({presentation:savedPresentation});
}

function chartDuration(chart) {
  const bpms = chart.bpms?.length ? chart.bpms : [{measure: 1, bpm: chart.bpm}];
  let end = 1;
  for (const note of chart.notes) {
    let span = note.hold_duration || 0;
    for (const slide of note.slide || []) span = Math.max(span, slide.slide_duration || 0);
    end = Math.max(end, note.time + span);
  }
  let seconds = 0, previous = bpms[0];
  for (const change of bpms.slice(1)) {
    if (change.measure >= end) break;
    seconds += (change.measure - previous.measure) * 240 / previous.bpm;
    previous = change;
  }
  return Math.max(1, seconds + (end - previous.measure) * 240 / previous.bpm + 3);
}

function updateRange() {
  if (loadedChart) seek.min = previewStartTime(loadedChart, countIn);
  seek.max = Math.max(chartEnd, audioUrl && Number.isFinite(music.duration) ? music.duration - offset : 0);
}
function usesMusic() { return audioUrl && time >= -offset && time < music.duration - offset; }
function sync(jump = false) {
  const media = usesMusic();
  view.setTime(time, {playing: playing && (!media || (!music.paused && !music.seeking && music.readyState >= 3)),
    seek: jump, clockSource: media ? 'media' : 'silent', audioBoundary: audioUrl && time < -offset ? -offset : null, rate});
  seek.value = String(time);
  $('time').value = time.toFixed(2) + ' s';
  play.textContent = playing ? '暂停' : '播放';
}
function pause() {
  operation++; cancelAnimationFrame(frame); playing = false; music.pause(); sync();
}
function startMusic() {
  const op = operation;
  music.play().catch(error => {
    if (op === operation && error.name !== 'AbortError') { pause(); notice.textContent = '音乐未能播放：' + error.message; }
  });
}
function position(next) {
  time = next; last = performance.now();
  if (audioUrl && Number.isFinite(music.duration)) {
    music.currentTime = Math.min(music.duration, Math.max(0, time + offset));
    if (playing && usesMusic()) startMusic(); else music.pause();
  }
  sync(true);
}
function tick(now) {
  if (usesMusic()) {
    time = (music.ended ? music.duration : music.currentTime) - offset;
  } else {
    const before = audioUrl && time < -offset;
    time = Math.min(Number(seek.max), time + (now - last) / 1000 * rate);
    if (before && usesMusic()) { time = -offset; music.currentTime = 0; startMusic(); }
  }
  last = now;
  if (time >= Number(seek.max)) { pause(); return; }
  sync(); frame = requestAnimationFrame(tick);
}
function setAudio(file) {
  music.pause();
  if (audioUrl) {
    music.removeAttribute('src'); music.load();
    if (audioUrl.startsWith('blob:')) URL.revokeObjectURL(audioUrl); audioUrl = '';
  }
  if (file) {
    audioUrl = typeof file==='string' ? file : URL.createObjectURL(file); music.src = audioUrl;
    music.preservesPitch = false; music.playbackRate = rate;
  }
}
music.ondurationchange = () => { updateRange(); enableControls(); };
music.onerror = () => {
  if (!audioUrl || !music.error) return;
  pause(); setAudio(null); updateRange(); enableControls();
  notice.textContent = '无法解码这首歌的音乐，仍可播放谱面。';
};

async function readSong(files, folder) {
  let chart = files[0], label = chart.name, audio, cover, video;
  if (folder) {
    const relative = file => file.webkitRelativePath.split('/').slice(1).join('/').toLowerCase();
    const entries = new Map(files.map(file => [relative(file), file]));
    label = chart.webkitRelativePath.split('/')[0];
    chart = entries.get('maidata.txt') || entries.get('chart.json');
    if (!chart) throw Error('请选择根目录含 maidata.txt 或 chart.json 的单曲文件夹。');
    let project = {};
    const manifest = entries.get('project_assets.json');
    if (manifest && manifest.size <= 256 * 1024) {
      try { project = JSON.parse(await manifest.text()) || {}; } catch { /* use conventional names */ }
    }
    const find = (preferred, names) => {
      const path = typeof preferred === 'string' && preferred.replaceAll('\\', '/').split('/').filter(part => part !== '.').join('/').toLowerCase();
      return entries.get(path) || names.map(name => entries.get(name)).find(Boolean);
    };
    audio = find(project.audio, ['track.mp3','track.wav','demo.mp3','demo.wav','track.ogg','track.m4a','track.flac']);
    cover = find(project.cover, ['bg.jpg','bg.png','bg.jpeg','cover.jpg','cover.png','jacket.jpg','jacket.png','cover.jpeg','jacket.jpeg']);
    video = find(project.pv, ['pv.mp4','bg.mp4','movie.mp4','video.mp4','pv.webm','bg.webm','pv.mkv','bg.mkv']);
  }
  if (chart.size > 32 * 1024 * 1024) throw Error('谱面不能超过 32 MiB。');
  const name = folder && chart.name.toLowerCase() === 'chart.json' ? 'chart.json' : 'maidata.txt';
  return {name, label, source: await chart.text(), audio, cover, video};
}

function loadChart(chartJson, song, levels = [], selected = null) {
  const chart = JSON.parse(chartJson);
  pause();
  if (song !== current) {
    if($('cover')) $('cover').value = $('video').value = '';
    setAudio(song?.audio);
  }
  current = song;
  offset = chart.audio_offset || 0;
  loadedChart = chart;
  chartEnd = chartDuration(chart); updateRange();
  difficulty.replaceChildren(...levels.map(({label, diff}) => new Option(label, diff)));
  difficulty.value = String(selected);
  difficulty.dataset.active = difficulty.value;
  $('difficulty-label').hidden = levels.length < 2;
  hasChart = true;
  const viewerProfile=settings.beforeLoad(stage);
  view.load(chart, {chartJson, cover: song?.cover, video: song?.video,
    presentation:full?undefined:viewerProfile || examplePresentation, viewerProfile});
  position(Number(seek.min));
  const media = [song?.audio, song?.cover, song?.video].filter(Boolean).map(file => file.name || String(file).split('/').pop());
  notice.textContent = (song?.label || '练习谱') + '已载入' + (media.length ? ' · ' + media.join('、') : '');
}
function parse(song, request, diff) {
  pending = {song, request};
  view.parseSource({request, name: song.name, source: song.source, diff});
}
stage.addEventListener('padview-message', ({detail}) => {
  if (detail.type === 'padview:parsed-chart' && pending?.request === detail.request) {
    const {song, request} = pending; pending = null;
    queueMicrotask(() => {
      if (request !== generation) return;
      if (detail.error) { notice.textContent = '无法加载谱面：' + detail.error; return; }
      const {chart_json, levels, selected_diff} = detail.parsed;
      loadChart(chart_json, song, levels, selected_diff);
    });
  } else if (detail.type === 'padview:error') {
    failed = true; pause(); enableControls(); if($('imports')) $('imports').disabled = true;
    notice.textContent = detail.message;
  } else if (detail.type === 'padview:media-error') {
    if(detail.kind==='video' && current?.fallbackVideo && current.video===view.video){
      current.video=current.fallbackVideo;current.fallbackVideo=null;view.video=current.video;
    } else notice.textContent=detail.message;
  }
});
for (const [button, input, folder] of [['load-simai','simai-file',false], ['load-folder','song-folder',true]]) {
  if(!$(button))continue;
  $(button).onclick = () => $(input).click();
  $(input).onchange = async event => {
    const files = Array.from(event.target.files); event.target.value = '';
    if (!files.length) return;
    const request = ++generation; pending = null;
    try {
      const song = await readSong(files, folder);
      if (request === generation) parse(song, request);
    } catch (e) { if (request === generation) notice.textContent = e.message; }
  };
}
difficulty.onchange = () => {
  const diff = Number(difficulty.value);
  // Keep the active difficulty selected until the new chart parses successfully.
  difficulty.value = difficulty.dataset.active;
  parse(current, ++generation, diff);
};
play.onclick = async () => {
  if (playing) { pause(); return; }
  const op = ++operation;
  try { await view.audio?.unlock(audioUrl ? music : undefined); }
  catch (e) { if (op === operation) notice.textContent = e.message; return; }
  if (op !== operation || !settings.ready || failed || document.hidden) return;
  playing = true; position(time >= Number(seek.max) ? Number(seek.min) : time);
  frame = requestAnimationFrame(tick);
};
seek.oninput = () => { position(seek.valueAsNumber); };
for (const key of ['cover', 'video']) {
  if(!$(key))continue;
  $(key).onchange = () => {
    const file = $(key).files[0]; if (!file) return;
    if (current) {current[key] = file;if(key==='video')current.fallbackVideo=null;} view[key] = file;
  };
}
if($('clear')) $('clear').onclick = () => { $('video').value = ''; if (current) current.video = null; view.video = null; };
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
addEventListener('pagehide', e => { if (!e.persisted) { pause(); setAudio(null); view.dispose(); } });

function initialSettings(){
  return new Promise(resolve=>{
    function receive({detail}) {
      if(detail.type!=='padview:settings')return;
      stage.removeEventListener('padview-message',receive);resolve(detail);
    }
    stage.addEventListener('padview-message',receive);view.requestSettings();
  });
}
if($('backing')) $('backing').onchange=e=>{stage.dataset.backing=e.target.value;};
if($('layout')) $('layout').onchange=e=>settings.patch({'params.canvas_background.layout':e.target.value});
const centerControls=[['letter-style','center_label'],['sprite-digits','center_digits'],['show-value','center_show_value']];
function syncQuickControls(params){
  if($('layout')) $('layout').value=params.canvas_background.layout;
  if(!$('letter-style'))return;
  const centers=params.info_blocks.blocks.filter(b=>b.kind==='pad_center');
  for(const [id,key] of centerControls){
    const input=$(id), values=centers.map(b=>key==='center_label'?b[key]||'original':b[key]!==false);
    input.disabled=!values.length;
    const mixed=values.some(value=>value!==values[0]);
    if(key==='center_label') input.value=mixed?'':values[0];
    else {input.checked=values[0]===true;input.indeterminate=mixed;}
  }
}
for(const [id,key] of centerControls){
  if($(id)) $(id).onchange=({target})=>{
    const value=target.type==='checkbox'?target.checked:target.value;
    settings.patch({'params.info_blocks.blocks':settings.profile.params.info_blocks.blocks.map(
      b=>b.kind==='pad_center'?{...b,[key]:value}:b)});
  };
}
try {
  const media=name=>new URL('./jack-the-ripper/'+name,document.baseURI).href;
  const [source]=await Promise.all([fetch(media('maidata.txt')).then(r=>{
    if(!r.ok)throw Error('无法读取示例谱面：HTTP '+r.status);return r.text();
  }),view.ready]);
  if(!full) {
    const initial=await initialSettings();
    savedPresentation=initial.presentation;
    examplePresentation=exampleLayout(mode,savedPresentation,initial.catalogue);
  }
  const sourceMode=examplePresentation?.params.canvas_background.source;
  const wantsVideo=full || mode==='pv' || (mode!=='transparent' && ['auto','video'].includes(sourceMode));
  const hevc=!!document.createElement('video').canPlayType('video/mp4; codecs="hvc1.1.6.L93.B0"');
  const bundledMedia={cover:media('bg.png'),video:media(hevc?'pv.mp4':'pv.webm')};
  parse({name:'maidata.txt',label:'Jack-the-Ripper◆',source,audio:media('track.mp3'),
    bundledMedia,cover:mode!=='transparent' && mode!=='pv'?bundledMedia.cover:null,
    video:wantsVideo?bundledMedia.video:null, fallbackVideo:hevc?media('pv.webm'):null},++generation);
} catch (e) { notice.textContent = e.message; }
if($('imports')) $('imports').disabled = failed;
