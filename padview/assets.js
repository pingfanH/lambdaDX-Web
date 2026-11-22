'use strict';

// The build writes regular files in a deterministic USTAR archive. HTTP
// Content-Encoding handles Brotli before these bytes reach the parser.
globalThis.PadviewAssets = class PadviewAssets {
  constructor(files) {
    this.files = files;
    this.packs = new Map();
    const profile = files.get('padview_profile.json');
    this.loadedPacks = new Set(profile ? JSON.parse(new TextDecoder().decode(profile)).bundled_packs : []);
  }

  get(name) { return this.files.get(name.replace(/^(\.\/)+/, '')); }

  // Only the standalone SDK sets bundledSettings. Full-site profiles and
  // their on-demand resources pass through unchanged.
  presentation(view) {
    const limits = PadviewAssets.bundledSettings, params = view?.params;
    if (!limits || !params) return view;
    const next = {...params};
    if (params.sdez) next.sdez = {...params.sdez, values: {...params.sdez.values, ...limits.sounds}};
    if (Array.isArray(params.info_blocks?.blocks)) next.info_blocks = {...params.info_blocks,
      blocks: params.info_blocks.blocks.map(b => ({...b, typeface: limits.font.value}))};
    return {...view, params: next};
  }

  patch(patch) {
    const limits = PadviewAssets.bundledSettings;
    if (!limits) return patch;
    const result = {...patch};
    for (const [name, value] of Object.entries(limits.sounds)) {
      const key = 'params.sdez.values.' + name;
      if (Object.hasOwn(result, key)) result[key] = value;
    }
    const blocks = 'params.info_blocks.blocks';
    if (Array.isArray(result[blocks])) result[blocks] = result[blocks].map(b => ({...b, typeface: limits.font.value}));
    return result;
  }

  catalogue(data) {
    const limits = PadviewAssets.bundledSettings;
    if (!limits) return data;
    const fixed = new Set(Object.keys(limits.sounds).map(name => 'params.sdez.values.' + name));
    return {...data, items: data.items.filter(item => !fixed.has(item.key)),
      component_fonts: [limits.font], component_default: {...data.component_default, typeface: limits.font.value}};
  }

  async loadPacks(names, fetcher = fetch) {
    names = [...new Set(names)].filter(name => !this.loadedPacks.has(name));
    if (!names.length) return { files: new Map(), flags: 0 };
    const version = globalThis.document?.querySelector('meta[name="padview-build"]')?.content || 'native3';
    this.options ||= fetcher('options.json?v=' + encodeURIComponent(version), { cache: 'no-cache' }).then(async response => {
      if (!response.ok) throw new Error('无法读取可选音效与皮肤列表');
      return response.json();
    }).catch(error => { this.options = null; throw error; });
    const options = await this.options;
    const results = await Promise.all(names.map(async name => {
      if (this.packs.has(name)) { const result = await this.packs.get(name); return this.loadedPacks.has(name) ? null : { ...result, name }; }
      const option = options[name];
      if (!option || !/^options\/[a-z0-9-]+\.tar\.br$/.test(option.url)) throw new Error('缺少可选资源：' + name);
      const promise = (async () => {
        let response;
        try { response = await fetcher(option.url); }
        catch { throw new Error('音效或皮肤下载失败，请重试：' + name); }
        if (!response.ok) throw new Error('音效或皮肤下载失败，请重试：' + name);
        return { files: PadviewAssets.fromTar(new Uint8Array(await response.arrayBuffer())).files, flags: option.flags };
      })();
      this.packs.set(name, promise);
      try { return { ...await promise, name }; } catch (error) { this.packs.delete(name); throw error; }
    }));
    const files = new Map(); let flags = 0;
    for (const result of results) if (result && !this.loadedPacks.has(result.name)) {
      flags |= result.flags;
      for (const [name, bytes] of result.files) { this.files.set(name, bytes); files.set(name, bytes); }
      this.loadedPacks.add(result.name);
    }
    return { files, flags };
  }

  static fromTar(bytes) {
    const files = new Map(), decoder = new TextDecoder('utf-8', { fatal: true });
    const text = (start, length) => {
      const value = bytes.subarray(start, start + length);
      const end = value.indexOf(0);
      return decoder.decode(end < 0 ? value : value.subarray(0, end));
    };
    const octal = (start, length) => {
      const value = text(start, length).trim();
      if (!/^[0-7]+$/.test(value)) throw new Error('预览资源包数字格式无效');
      const number = Number.parseInt(value, 8);
      if (!Number.isSafeInteger(number)) throw new Error('预览资源包文件过大');
      return number;
    };
    let offset = 0, ended = false;
    while (offset + 512 <= bytes.length) {
      const header = bytes.subarray(offset, offset + 512);
      if (header.every(byte => byte === 0)) { ended = true; break; }
      if (text(offset + 257, 6) !== 'ustar') throw new Error('预览资源包格式无效');
      let checksum = 0;
      for (let index = 0; index < 512; index++) checksum += index >= 148 && index < 156 ? 32 : header[index];
      if (checksum !== octal(offset + 148, 8)) throw new Error('预览资源包校验失败');
      const prefix = text(offset + 345, 155);
      const name = (prefix ? prefix + '/' : '') + text(offset, 100);
      if (!name || name.startsWith('/') || name.includes('\\') || name.split('/').some(part => !part || part === '..' || part === '.')) {
        throw new Error('预览资源包路径无效');
      }
      if (header[156] !== 0 && header[156] !== 48) throw new Error('预览资源包包含不支持的文件类型');
      if (files.has(name)) throw new Error('预览资源包包含重复文件');
      const size = octal(offset + 124, 12), start = offset + 512;
      const next = start + Math.ceil(size / 512) * 512;
      if (!Number.isSafeInteger(next) || next > bytes.length) throw new Error('预览资源包不完整');
      files.set(name, bytes.subarray(start, start + size));
      offset = next;
    }
    if (!ended) throw new Error('预览资源包不完整');
    return new PadviewAssets(files);
  }
};

PadviewAssets.bundledSettings = {"sounds": {"TapSe": 0, "CriticalSe": 0, "BreakSe": 0, "ExSe": 0, "SlideSe": 0}, "font": {"value": "original", "label": "系统字体"}};
