// ezSPclient 启动器前端。
//
// 没有构建步骤：Tauri 直接加载本目录的静态文件，后端命令通过 window.__TAURI__.core.invoke 调用
// （tauri.conf.json 里 withGlobalTauri: true）。所有状态由后端持有，前端只负责渲染快照。

'use strict';

// ---------------------------------------------------------------------------
// 文案
// ---------------------------------------------------------------------------

const STRINGS = {
  zh: {
    brandSub: '卫戍协议：盟约 · 多平台客户端',
    servers: '服务器',
    add: '添加',
    save: '保存',
    cancel: '取消',
    copy: '复制',
    apply: '导入',
    settings: '设置',
    probeAll: '全部测速',
    export: '导出',
    import: '导入',
    reset: '清空数据',
    emptyHint: '还没有服务器。点右上角「添加」，填一个地址就行 —— 例如 192.168.1.10:3000，或者只写 IP 让它自动探测端口。',
    fieldName: '名称（留空就用地址）',
    fieldAddress: '地址',
    fieldNote: '备注',
    addressHint: '支持 192.168.1.10、192.168.1.10:3000、http://game.example.com/。不写端口时会依次探测 3000 / 80 / 54321。',
    setProbePorts: '自动探测的端口顺序',
    setProbePortsHint: '逗号分隔；地址里没写端口时按这个顺序试，命中即停。',
    setAutoProbe: '启动后自动探活上次使用的服务器',
    setFullscreen: '打开游戏时全屏',
    setIsolate: '每个服务器使用独立缓存',
    setIsolateHint: '房间密钥、缓存和登录状态互不影响；关闭时共用一个缓存，首次加载更快。',
    setMinimize: '打开游戏后最小化启动器',
    addTitle: '添加服务器',
    editTitle: '编辑服务器',
    exportTitle: '导出地址簿',
    exportHint: '把下面这段 JSON 发到别的电脑，用「导入」即可带过去（不含任何密码）。',
    importTitle: '导入地址簿',
    importHint: '把之前导出的 JSON 粘进来。按 地址:端口 去重，已有的条目不会被改动。',
    noSelection: '从左边选一台服务器，或者先添加一台。',
    addr: '地址',
    portAuto: '自动探测',
    status: '状态',
    latency: '延迟',
    lastSeen: '上次在线',
    note: '备注',
    room: '房间密钥',
    play: '进入游戏',
    probe: '测速',
    edit: '编辑',
    del: '删除',
    confirmDel: '确认删除',
    closeGame: '关闭游戏窗口',
    online: '在线',
    offline: '离线',
    unknown: '未检测',
    probing: '检测中',
    never: '从未',
    justNow: '刚刚',
    minutesAgo: '{0} 分钟前',
    hoursAgo: '{0} 小时前',
    daysAgo: '{0} 天前',
    detectingPort: '正在探测端口…',
    unreachable: '连不上，检查地址或服务器是否已启动',
    gameOpened: '已打开游戏窗口（{0}）',
    saved: '已保存',
    deleted: '已删除',
    copied: '已复制到剪贴板',
    copyFailed: '复制失败，请手动全选文本框内容',
    imported: '已导入 {0} 台服务器',
    resetDone: '已清空本地数据',
    confirmReset: '确认清空？',
    errEmpty: '请填写地址',
    errPort: '端口要在 1–65535 之间',
    errHttps: 'v0.1 只支持 http，请去掉 https://',
    errSpace: '地址里不能有空格',
    probeSummary: '测速完成：{0} 在线 / {1} 离线',
    backToLauncher: '返回启动器',
    back: '‹ 返回列表',
    pillTapHint: '单击展开',
    pillExitHint: '再次点击返回启动器',
    pillDragHint: '可拖动',
    noTauri: '这个界面需要在 ezSPclient 窗口里打开。',
  },
  en: {
    brandSub: 'Stronghold Protocol · multi-platform client',
    servers: 'Servers',
    add: 'Add',
    save: 'Save',
    cancel: 'Cancel',
    copy: 'Copy',
    apply: 'Import',
    settings: 'Settings',
    probeAll: 'Test all',
    export: 'Export',
    import: 'Import',
    reset: 'Reset data',
    emptyHint: 'No servers yet. Hit “Add” and enter an address — e.g. 192.168.1.10:3000, or just the IP and let it detect the port.',
    fieldName: 'Name (blank = address)',
    fieldAddress: 'Address',
    fieldNote: 'Note',
    addressHint: 'Accepts 192.168.1.10, 192.168.1.10:3000, http://game.example.com/. Without a port it tries 3000 / 80 / 54321.',
    setProbePorts: 'Port probe order',
    setProbePortsHint: 'Comma separated; used when the address has no port. First hit wins.',
    setAutoProbe: 'Probe the last used server on startup',
    setFullscreen: 'Open the game fullscreen',
    setIsolate: 'Isolate cache per server',
    setIsolateHint: 'Room keys, cache and session stay separate per server; off shares one cache and loads faster the first time.',
    setMinimize: 'Minimize the launcher after opening the game',
    addTitle: 'Add server',
    editTitle: 'Edit server',
    exportTitle: 'Export address book',
    exportHint: 'Send this JSON to another machine and use “Import” (no passwords inside).',
    importTitle: 'Import address book',
    importHint: 'Paste a previously exported JSON. Entries are merged and de-duplicated by address:port.',
    noSelection: 'Pick a server on the left, or add one first.',
    addr: 'Address',
    portAuto: 'auto',
    status: 'Status',
    latency: 'Latency',
    lastSeen: 'Last seen',
    note: 'Note',
    room: 'Room key',
    play: 'Play',
    probe: 'Test',
    edit: 'Edit',
    del: 'Delete',
    confirmDel: 'Confirm',
    closeGame: 'Close game window',
    online: 'Online',
    offline: 'Offline',
    unknown: 'Unknown',
    probing: 'Checking',
    never: 'never',
    justNow: 'just now',
    minutesAgo: '{0} min ago',
    hoursAgo: '{0} h ago',
    daysAgo: '{0} d ago',
    detectingPort: 'Detecting port…',
    unreachable: 'Unreachable — check the address or whether the server is running',
    gameOpened: 'Game window opened ({0})',
    saved: 'Saved',
    deleted: 'Deleted',
    copied: 'Copied to clipboard',
    copyFailed: 'Copy failed — select the text and copy manually',
    imported: 'Imported {0} server(s)',
    resetDone: 'Local data cleared',
    confirmReset: 'Confirm reset?',
    errEmpty: 'Enter an address',
    errPort: 'Port must be 1–65535',
    errHttps: 'v0.1 only supports http — drop the https://',
    errSpace: 'Address cannot contain spaces',
    probeSummary: 'Done: {0} online / {1} offline',
    backToLauncher: 'Back to launcher',
    back: '‹ Servers',
    pillTapHint: 'Tap to expand',
    pillExitHint: 'Tap again to go back',
    pillDragHint: 'drag to move',
    noTauri: 'This UI must run inside the ezSPclient window.',
  },
};

let lang = 'zh';

/** 取文案并替换 {0} {1} 占位符。 */
function t(key, ...args) {
  const table = STRINGS[lang] || STRINGS.zh;
  let text = table[key] ?? STRINGS.zh[key] ?? key;
  args.forEach((value, index) => {
    text = text.replace(`{${index}}`, String(value));
  });
  return text;
}

// ---------------------------------------------------------------------------
// 后端
// ---------------------------------------------------------------------------

/** 调后端命令；无参数的命令也显式传 `{}`，避免个别 Tauri 版本对 undefined 的处理差异。 */
const invoke = (command, args = {}) => window.__TAURI__.core.invoke(command, args);

// ---------------------------------------------------------------------------
// 状态
// ---------------------------------------------------------------------------

let snap = null; // 后端快照
let selectedId = null;
let editingId = null; // null = 新增
let ioMode = null; // 'export' | 'import'
let roomKey = '';
/** 移动端的游戏内嵌状态：{ id, name, url }；null = 没在内嵌。 */
let embedded = null;
const probing = new Set();
let confirmTimer = null;
let pendingDeleteId = null;

const $ = (id) => document.getElementById(id);
const esc = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

// ---------------------------------------------------------------------------
// 工具函数
// ---------------------------------------------------------------------------

/**
 * 解析用户输入的地址。
 * @returns {{host: string, port: number|null} | {error: string}}
 */
function parseAddress(raw) {
  let text = String(raw ?? '').trim();
  if (!text) return { error: 'errEmpty' };

  let explicitScheme = false;
  const scheme = text.match(/^([a-z][a-z0-9+.-]*):\/\//i);
  if (scheme) {
    explicitScheme = true;
    if (scheme[1].toLowerCase() === 'https') return { error: 'errHttps' };
    text = text.slice(scheme[0].length);
  }

  text = text.split(/[/?#]/)[0];
  let host = '';
  let portText = null;

  if (text.startsWith('[')) {
    const end = text.indexOf(']');
    if (end < 0) return { error: 'errEmpty' };
    host = text.slice(1, end);
    const rest = text.slice(end + 1);
    if (rest.startsWith(':')) portText = rest.slice(1);
  } else {
    const parts = text.split(':');
    // 两个以上冒号视为裸 IPv6，不拆分端口
    if (parts.length > 2) {
      host = text;
    } else {
      host = parts[0];
      portText = parts[1] ?? null;
    }
  }

  host = host.trim().replace(/\.$/, '');
  if (!host) return { error: 'errEmpty' };
  if (/\s/.test(host)) return { error: 'errSpace' };

  let port = null;
  if (portText !== null && portText !== '') {
    if (!/^\d+$/.test(portText)) return { error: 'errPort' };
    port = Number(portText);
    if (port < 1 || port > 65535) return { error: 'errPort' };
  } else if (explicitScheme) {
    port = 80; // 明确写了 http:// 就按 80
  }
  return { host, port };
}

const findServer = (id) => snap?.servers?.find((server) => server.id === id) ?? null;

/** 窄屏（手机竖屏）：列表与详情分两屏显示，靠 `#layout` 的 data-view 切换。 */
const isNarrow = () => window.matchMedia('(max-width: 760px)').matches;

/** 切到列表 / 详情视图（宽屏下这两个值不起作用，双栏一直显示）。 */
function setView(view) {
  $('layout').dataset.view = view;
}

/** 展示用的地址：没有端口时标成"自动探测"。 */
function displayAddress(server) {
  const authority = server.host.includes(':') ? `[${server.host}]` : server.host;
  return server.port == null ? `${authority} · ${t('portAuto')}` : `${authority}:${server.port}`;
}

function relativeTime(ms) {
  if (!ms) return t('never');
  const diff = Date.now() - ms;
  if (diff < 60_000) return t('justNow');
  if (diff < 3_600_000) return t('minutesAgo', Math.floor(diff / 60_000));
  if (diff < 86_400_000) return t('hoursAgo', Math.floor(diff / 3_600_000));
  return t('daysAgo', Math.floor(diff / 86_400_000));
}

// ---------------------------------------------------------------------------
// 渲染
// ---------------------------------------------------------------------------

/** 静态文案（data-i18n 元素）。 */
function applyStaticText() {
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  for (const node of document.querySelectorAll('[data-i18n]')) {
    node.textContent = t(node.dataset.i18n);
  }
  document.title = `ezSPclient · ${lang === 'zh' ? '卫戍协议' : 'Stronghold Protocol'}`;
}

function render() {
  if (!snap) return;
  renderList();
  renderDetail();
  $('config-path').textContent = snap.configDir;
  $('config-path').title = snap.configDir;
  $('version').textContent = `v${snap.appVersion}`;
}

function renderList() {
  const list = $('server-list');
  const servers = snap.servers ?? [];
  $('empty-hint').hidden = servers.length > 0;

  list.innerHTML = servers
    .map((server) => {
      const isProbing = probing.has(server.id);
      const dotClass = isProbing ? 'probing' : server.lastLatencyMs != null ? 'online' : server.lastSeenAt ? 'offline' : '';
      const status = isProbing
        ? t('probing')
        : server.lastLatencyMs != null
          ? `${server.lastLatencyMs} ms`
          : server.lastSeenAt
            ? t('offline')
            : t('unknown');
      const classes = ['server-card'];
      if (server.id === selectedId) classes.push('selected');
      if (server.id === snap.activeId) classes.push('active');
      return `
        <li class="${classes.join(' ')}" data-id="${esc(server.id)}">
          <div class="server-row">
            <span class="server-name">${esc(server.name)}</span>
          </div>
          <div class="server-addr">${esc(displayAddress(server))}</div>
          <div class="server-meta">
            <span class="dot ${dotClass}"></span>
            <span class="server-status">${esc(status)}</span>
            <span class="grow"></span>
            <span>${esc(relativeTime(server.lastSeenAt))}</span>
          </div>
        </li>`;
    })
    .join('');

  for (const card of list.querySelectorAll('.server-card')) {
    card.addEventListener('click', () => {
      selectedId = card.dataset.id;
      if (isNarrow()) setView('detail');
      render();
    });
  }
}

function renderDetail() {
  const panel = $('detail');
  const server = findServer(selectedId);
  if (!server) {
    panel.innerHTML = `<p class="empty">${esc(t('noSelection'))}</p>`;
    return;
  }

  const isProbing = probing.has(server.id);
  const status = isProbing
    ? `<span class="dot probing"></span> ${esc(t('probing'))}`
    : server.lastLatencyMs != null
      ? `<span class="dot online"></span> ${esc(t('online'))}`
      : server.lastSeenAt
        ? `<span class="dot offline"></span> ${esc(t('offline'))}`
        : `<span class="dot"></span> ${esc(t('unknown'))}`;

  panel.innerHTML = `
    <div class="detail-title">
      <div class="detail-heading">
        <button class="ghost small mobile-back" id="d-back">${esc(t('back'))}</button>
        <h2>${esc(server.name)}</h2>
      </div>
      <div class="play-row">
        <button class="ghost small" id="d-probe" ${isProbing ? 'disabled' : ''}>${esc(t('probe'))}</button>
        <button class="ghost small" id="d-edit">${esc(t('edit'))}</button>
        <button class="ghost small danger" id="d-del">${esc(t('del'))}</button>
      </div>
    </div>
    <div class="detail-addr">${esc(displayAddress(server))}</div>
    <dl class="kv">
      <dt>${esc(t('status'))}</dt><dd>${status}</dd>
      <dt>${esc(t('latency'))}</dt><dd>${server.lastLatencyMs != null ? server.lastLatencyMs + ' ms' : '—'}</dd>
      <dt>${esc(t('lastSeen'))}</dt><dd>${esc(relativeTime(server.lastSeenAt))}</dd>
      ${server.note ? `<dt>${esc(t('note'))}</dt><dd>${esc(server.note)}</dd>` : ''}
    </dl>
    <div class="play-row">
      <input id="d-room" class="room-input" maxlength="4" placeholder="${esc(t('room'))}" value="${esc(roomKey)}" />
      <button class="primary big" id="d-play" ${isProbing ? 'disabled' : ''}>${esc(t('play'))}</button>
      <button class="ghost small" id="d-close">${esc(t('closeGame'))}</button>
    </div>
  `;

  $('d-back').addEventListener('click', () => setView('list'));
  $('d-probe').addEventListener('click', () => probeOne(server.id));
  $('d-edit').addEventListener('click', () => openServerModal(server));
  $('d-del').addEventListener('click', (event) => requestDelete(server.id, event.currentTarget));
  $('d-play').addEventListener('click', () => connect(server.id));
  $('d-close').addEventListener('click', () => {
    if (embedded?.id === server.id) {
      exitEmbed();
      return;
    }
    invoke('close_game', { id: server.id }).catch((error) => toast(String(error), true));
  });
  $('d-room').addEventListener('input', (event) => {
    roomKey = event.target.value.trim().toUpperCase();
  });
}

// ---------------------------------------------------------------------------
// 后端交互
// ---------------------------------------------------------------------------

async function refresh(next) {
  if (next) snap = next;
  render();
}

async function probeOne(id, { quiet = false } = {}) {
  const server = findServer(id);
  if (!server) return null;
  const ports = server.port != null ? [server.port] : snap.settings.probePorts?.length ? snap.settings.probePorts : [3000, 80, 54321];

  probing.add(id);
  render();
  let lastError = null;
  try {
    for (const port of ports) {
      let result;
      try {
        result = await invoke('probe_server', { host: server.host, port });
      } catch (error) {
        lastError = String(error);
        continue;
      }
      if (result?.ok) {
        await refresh(await invoke('record_probe', { id, port, latencyMs: result.latencyMs, ok: true }));
        if (!quiet) toast(`${server.host}:${port} · ${result.latencyMs} ms`);
        return result;
      }
      lastError = result?.error ?? null;
    }
    await refresh(await invoke('record_probe', { id, port: ports[0], latencyMs: 0, ok: false }));
    if (!quiet) toast(lastError || t('unreachable'), true);
    return { ok: false, error: lastError };
  } finally {
    probing.delete(id);
    render();
  }
}

async function probeAll() {
  const servers = snap?.servers ?? [];
  if (!servers.length) return;
  const results = await Promise.all(servers.map((server) => probeOne(server.id, { quiet: true })));
  const online = results.filter((result) => result?.ok).length;
  toast(t('probeSummary', online, results.length - online));
}

async function connect(id) {
  const server = findServer(id);
  if (!server) return;

  if (server.port == null) {
    toast(t('detectingPort'));
    const result = await probeOne(id, { quiet: true });
    if (!result?.ok) {
      toast(result?.error || t('unreachable'), true);
      return;
    }
  }

  try {
    await refresh(await invoke('set_active', { id }));
    const target = await invoke('open_game', {
      id,
      room: roomKey || null,
      fullscreen: snap.settings.gameFullscreen,
      isolate: snap.settings.isolateStorage,
    });

    if (target.mode === 'embed') {
      // 移动端没有多窗口：内嵌到当前界面，随时能退回来。
      embedded = { id, name: server.name, address: displayAddress(server), url: target.url };
      pill.expanded = false; // 每次进入都从折叠态开始
      renderEmbed();
      toast(t('gameOpened', server.name));
    } else {
      toast(t('gameOpened', target.label));
    }
  } catch (error) {
    toast(String(error), true);
  }
}

// ---------------------------------------------------------------------------
// 移动端：游戏内嵌层
// ---------------------------------------------------------------------------

/** 浮标位置存在 localStorage：这是纯界面的偏好，不值得为它改配置结构。 */
const PILL_POS_KEY = 'ezsp.embedPillPos';

/** 浮标状态：`expanded` 单击切换（展开后再点就是返回启动器），`pos` 是拖动后的位置。 */
const pill = { expanded: false, pos: readPillPos() };

function readPillPos() {
  try {
    const pos = JSON.parse(localStorage.getItem(PILL_POS_KEY) || 'null');
    return Number.isFinite(pos?.x) && Number.isFinite(pos?.y) ? pos : null;
  } catch {
    return null;
  }
}

function savePillPos(pos) {
  try {
    localStorage.setItem(PILL_POS_KEY, JSON.stringify(pos));
  } catch {
    /* 存不上就算了，下一次重新拖 */
  }
}

/** 把浮标放到记忆的位置，并夹在视口内（展开/旋转屏幕后可能超出）。 */
function applyPillPos(node) {
  if (!pill.pos) return;
  const rect = node.getBoundingClientRect();
  const maxX = Math.max(0, window.innerWidth - rect.width);
  const maxY = Math.max(0, window.innerHeight - rect.height);
  const x = Math.round(Math.min(Math.max(0, pill.pos.x), maxX));
  const y = Math.round(Math.min(Math.max(0, pill.pos.y), maxY));
  node.style.left = `${x}px`;
  node.style.top = `${y}px`;
  node.style.right = 'auto';
  node.style.bottom = 'auto';
}

/** 渲染 / 更新内嵌的游戏层（没有内嵌时移除它）。 */
function renderEmbed() {
  const existing = $('embed-layer');
  if (!embedded) {
    if (existing) existing.remove();
    return;
  }

  let layer = existing;
  let node = existing?.querySelector('#embed-pill');
  if (!layer) {
    layer = document.createElement('div');
    layer.id = 'embed-layer';
    // 只有一个小浮标：全屏下空间都留给游戏
    layer.innerHTML = `
      <iframe id="embed-frame" allow="fullscreen; autoplay; gamepad" allowfullscreen></iframe>
      <div id="embed-pill" class="embed-pill" data-expanded="false" role="button" tabindex="0">
        <span class="embed-pill-title"></span>
        <span class="embed-pill-meta"></span>
        <span class="embed-pill-hint"></span>
      </div>`;
    document.body.appendChild(layer);
    node = layer.querySelector('#embed-pill');
    wirePill(node);
  }

  const frame = layer.querySelector('#embed-frame');
  if (frame.getAttribute('src') !== embedded.url) frame.setAttribute('src', embedded.url);

  const server = findServer(embedded.id);
  node.dataset.expanded = String(pill.expanded);
  node.querySelector('.embed-pill-title').textContent = embedded.address;
  node.querySelector('.embed-pill-meta').textContent =
    server?.lastLatencyMs != null ? `${t('online')} · ${server.lastLatencyMs} ms` : t('unknown');
  node.querySelector('.embed-pill-hint').textContent = `${t('pillExitHint')} · ${t('pillDragHint')}`;
  node.title = pill.expanded ? t('pillExitHint') : t('pillTapHint');
  applyPillPos(node);
}

/**
 * 浮标交互：拖动移动位置（位置记忆），不拖动才算点击 —— 折叠时点击展开，
 * 展开后点击才返回启动器（避免对局中误触直接退出）。
 */
function wirePill(node) {
  const TAP_SLOP = 6; // 位移小于这个像素数仍视为点击
  let active = false;
  let moved = false;
  let pointerId = null;
  let startX = 0;
  let startY = 0;
  let originX = 0;
  let originY = 0;

  node.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const rect = node.getBoundingClientRect();
    active = true;
    moved = false;
    pointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    originX = rect.left;
    originY = rect.top;
    node.classList.add('dragging');
    try {
      node.setPointerCapture(pointerId);
    } catch {
      /* 个别环境不支持，忽略 */
    }
    event.preventDefault();
  });

  node.addEventListener('pointermove', (event) => {
    if (!active || event.pointerId !== pointerId) return;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (!moved && Math.hypot(dx, dy) < TAP_SLOP) return;
    moved = true;
    pill.pos = { x: originX + dx, y: originY + dy };
    applyPillPos(node);
  });

  const finish = (event, cancelled) => {
    if (!active || event.pointerId !== pointerId) return;
    active = false;
    node.classList.remove('dragging');
    try {
      node.releasePointerCapture(pointerId);
    } catch {
      /* 忽略 */
    }

    if (moved) {
      const rect = node.getBoundingClientRect();
      pill.pos = { x: rect.left, y: rect.top };
      savePillPos(pill.pos);
      applyPillPos(node);
      return;
    }
    if (cancelled) return;

    if (!pill.expanded) {
      pill.expanded = true;
      renderEmbed();
    } else {
      exitEmbed();
    }
  };

  node.addEventListener('pointerup', (event) => finish(event, false));
  node.addEventListener('pointercancel', (event) => finish(event, true));
  // 键盘可达（桌面调试时用）
  node.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    if (!pill.expanded) {
      pill.expanded = true;
      renderEmbed();
    } else {
      exitEmbed();
    }
  });
  // 屏幕旋转 / 窗口变化后重新夹住位置
  window.addEventListener('resize', () => applyPillPos(node));
}

function exitEmbed() {
  if (!embedded) return;
  embedded = null;
  pill.expanded = false;
  renderEmbed();
  render();
}

/** 删除做成两步确认，避免误触（两步必须落在同一台服务器上）。 */
function requestDelete(id, button) {
  if (confirmTimer && pendingDeleteId === id) {
    clearTimeout(confirmTimer);
    confirmTimer = null;
    pendingDeleteId = null;
    invoke('remove_server', { id })
      .then((next) => {
        if (selectedId === id) selectedId = null;
        return refresh(next);
      })
      .then(() => toast(t('deleted')))
      .catch((error) => toast(String(error), true));
    return;
  }
  if (confirmTimer) {
    clearTimeout(confirmTimer);
    confirmTimer = null;
  }
  pendingDeleteId = id;
  const original = button.textContent;
  button.textContent = t('confirmDel');
  button.classList.add('primary');
  confirmTimer = setTimeout(() => {
    confirmTimer = null;
    pendingDeleteId = null;
    button.textContent = original;
    button.classList.remove('primary');
  }, 3000);
}

// ---------------------------------------------------------------------------
// 弹窗
// ---------------------------------------------------------------------------

function openModal(id) {
  $(id).hidden = false;
}

function closeModal(id) {
  $(id).hidden = true;
}

function openServerModal(server = null) {
  editingId = server?.id ?? null;
  $('server-modal-title').textContent = server ? t('editTitle') : t('addTitle');
  $('f-name').value = server?.name ?? '';
  $('f-address').value = server ? (server.port == null ? server.host : `${server.host}:${server.port}`) : '';
  $('f-note').value = server?.note ?? '';
  $('form-error').hidden = true;
  openModal('server-modal');
  $('f-address').focus();
}

async function submitServerForm(event) {
  event.preventDefault();
  const parsed = parseAddress($('f-address').value);
  const error = $('form-error');
  if (parsed.error) {
    error.textContent = t(parsed.error);
    error.hidden = false;
    return;
  }

  const payload = {
    name: $('f-name').value.trim(),
    host: parsed.host,
    port: parsed.port,
    note: $('f-note').value.trim(),
  };

  try {
    const next = editingId
      ? await invoke('update_server', { id: editingId, input: payload })
      : await invoke('add_server', { input: payload });
    await refresh(next);
    if (!editingId) selectedId = next.servers[next.servers.length - 1].id;
    closeModal('server-modal');
    if (isNarrow()) setView('detail');
    toast(t('saved'));
    render();
  } catch (message) {
    error.textContent = String(message);
    error.hidden = false;
  }
}

function openSettings() {
  const settings = snap.settings;
  $('s-ports').value = (settings.probePorts ?? []).join(', ');
  $('s-auto-probe').checked = !!settings.autoProbe;
  $('s-fullscreen').checked = !!settings.gameFullscreen;
  $('s-isolate').checked = !!settings.isolateStorage;
  $('s-minimize').checked = !!settings.minimizeOnConnect;
  openModal('settings-modal');
}

async function submitSettings(event) {
  event.preventDefault();
  const ports = $('s-ports')
    .value.split(/[,\s]+/)
    .map((part) => Number(part))
    .filter((port) => Number.isInteger(port) && port > 0 && port <= 65535);

  const settings = {
    probePorts: ports,
    autoProbe: $('s-auto-probe').checked,
    gameFullscreen: $('s-fullscreen').checked,
    isolateStorage: $('s-isolate').checked,
    minimizeOnConnect: $('s-minimize').checked,
    language: lang,
  };

  try {
    await refresh(await invoke('update_settings', { settings }));
    closeModal('settings-modal');
    toast(t('saved'));
  } catch (message) {
    toast(String(message), true);
  }
}

function openIo(mode) {
  ioMode = mode;
  $('io-title').textContent = mode === 'export' ? t('exportTitle') : t('importTitle');
  $('io-hint').textContent = mode === 'export' ? t('exportHint') : t('importHint');
  $('io-error').hidden = true;
  $('io-copy').hidden = mode !== 'export';
  $('io-apply').hidden = mode !== 'import';
  $('io-text').value = '';
  $('io-text').readOnly = mode === 'export';
  openModal('io-modal');

  if (mode === 'export') {
    invoke('export_state')
      .then((json) => {
        $('io-text').value = json;
        $('io-text').select();
      })
      .catch((error) => {
        $('io-error').textContent = String(error);
        $('io-error').hidden = false;
      });
  } else {
    $('io-text').focus();
  }
}

async function applyImport() {
  try {
    const before = snap.servers.length;
    const next = await invoke('import_state', { json: $('io-text').value });
    await refresh(next);
    closeModal('io-modal');
    toast(t('imported', next.servers.length - before));
  } catch (message) {
    $('io-error').textContent = String(message);
    $('io-error').hidden = false;
  }
}

function copyExport() {
  const text = $('io-text').value;
  const done = () => toast(t('copied'));
  const fallback = () => {
    $('io-text').select();
    if (document.execCommand('copy')) done();
    else toast(t('copyFailed'), true);
  };
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(done, fallback);
  } else {
    fallback();
  }
}

/** 清空数据同样两步确认。 */
function requestReset(button) {
  if (confirmTimer) {
    clearTimeout(confirmTimer);
    confirmTimer = null;
    invoke('reset_state')
      .then((next) => {
        selectedId = null;
        roomKey = '';
        return refresh(next);
      })
      .then(() => toast(t('resetDone')))
      .catch((error) => toast(String(error), true));
    button.textContent = t('reset');
    button.classList.remove('primary');
    return;
  }
  button.textContent = t('confirmReset');
  button.classList.add('primary');
  confirmTimer = setTimeout(() => {
    confirmTimer = null;
    button.textContent = t('reset');
    button.classList.remove('primary');
  }, 3000);
}

// ---------------------------------------------------------------------------
// 提示条
// ---------------------------------------------------------------------------

let toastTimer = null;
function toast(message, bad = false) {
  const node = $('toast');
  node.textContent = message;
  node.classList.toggle('bad', !!bad);
  node.hidden = false;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    node.hidden = true;
  }, bad ? 4200 : 2600);
}

// ---------------------------------------------------------------------------
// 启动
// ---------------------------------------------------------------------------

async function toggleLanguage() {
  lang = lang === 'zh' ? 'en' : 'zh';
  applyStaticText();
  render();
  try {
    await refresh(await invoke('update_settings', { settings: { ...snap.settings, language: lang } }));
  } catch {
    /* 语言没存上不影响使用 */
  }
}

async function init() {
  if (!window.__TAURI__) {
    document.body.innerHTML = `<p style="padding:24px">${esc(t('noTauri'))}</p>`;
    return;
  }

  snap = await invoke('load_state');
  lang = snap.settings.language === 'en' ? 'en' : 'zh';
  selectedId = snap.activeId ?? snap.servers[0]?.id ?? null;

  applyStaticText();
  render();

  $('btn-add').addEventListener('click', () => openServerModal(null));
  $('btn-probe-all').addEventListener('click', () => probeAll());
  $('btn-settings').addEventListener('click', openSettings);
  $('btn-lang').addEventListener('click', () => toggleLanguage());
  $('btn-export').addEventListener('click', () => openIo('export'));
  $('btn-import').addEventListener('click', () => openIo('import'));
  $('btn-reset').addEventListener('click', (event) => requestReset(event.currentTarget));
  $('server-form').addEventListener('submit', submitServerForm);
  $('settings-form').addEventListener('submit', submitSettings);
  $('io-copy').addEventListener('click', copyExport);
  $('io-apply').addEventListener('click', applyImport);
  for (const node of document.querySelectorAll('[data-close]')) {
    node.addEventListener('click', () => {
      for (const modal of document.querySelectorAll('.modal')) modal.hidden = true;
    });
  }
  for (const modal of document.querySelectorAll('.modal')) {
    modal.addEventListener('click', (event) => {
      if (event.target === modal) modal.hidden = true;
    });
  }
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (embedded) {
      exitEmbed();
      return;
    }
    for (const modal of document.querySelectorAll('.modal')) modal.hidden = true;
  });

  // 启动后自动探活上次用的服务器（只探活，不自动开窗）。
  if (snap.settings.autoProbe && selectedId) {
    probeOne(selectedId, { quiet: true });
  }
}

init().catch((error) => {
  const node = $('toast') ?? document.body;
  if (node === document.body) {
    document.body.innerHTML = `<p style="padding:24px">${esc(String(error))}</p>`;
  } else {
    toast(String(error), true);
  }
});
