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
    setAcceleration: '开启本地接管与渲染提速（实验性）',
    setAccelerationHint: '启用 60Hz 功耗锁、DPR 优化与核心战斗仿真本地拦截；关闭时完全走远端原始逻辑。',
    setRenderScale: '渲染倍率上限',
    setRenderScaleHint: '钳制游戏的 devicePixelRatio：倍率越低越省电（1.0 的像素量约为 1.5 的 44%），文字也会变软。「自动」按设备内存与核心数选 1.0 或 1.5。改完重启应用生效。',
    scaleAuto: '自动（按设备，默认）',
    scaleOff: '不限制（跟随设备）',
    scale1: '1.0×（最省电）',
    scale125: '1.25×',
    scale15: '1.5×',
    scale2: '2.0×（最清晰）',
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
    pillTuckHint: '再次点击收起',
    pillAutoDockHint: '{0} 秒后自动贴边',
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
    setAcceleration: 'Enable local takeover & render acceleration',
    setAccelerationHint: 'Locks 60Hz display, optimizes DPR and intercepts battle simulation locally; disable to use remote untouched scripts.',
    setRenderScale: 'Render scale cap',
    setRenderScaleHint: 'Caps the game devicePixelRatio: lower is cooler (1.0 draws ~44% of the pixels of 1.5) but softer text. "Auto" picks 1.0 or 1.5 from the device RAM and core count. Takes effect after restart.',
    scaleAuto: 'Auto (by device, default)',
    scaleOff: 'Uncapped (follow device)',
    scale1: '1.0× (coolest)',
    scale125: '1.25×',
    scale15: '1.5×',
    scale2: '2.0× (sharpest)',
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
    pillTuckHint: 'Tap again to tuck away',
    pillAutoDockHint: 'Docks in {0}s',
    noTauri: 'This UI must run inside the ezSPclient window.',
  },
};

let lang = 'zh';

/** 取文案并替换 {0} {1} 占位符。 */
function t(key, ...args) {
  const table = STRINGS[lang] || STRINGS.zh;
  let text = (table && table[key] !== undefined && table[key] !== null)
    ? table[key]
    : ((STRINGS.zh && STRINGS.zh[key] !== undefined && STRINGS.zh[key] !== null) ? STRINGS.zh[key] : key);
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
  String(value !== null && value !== undefined ? value : '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

// ---------------------------------------------------------------------------
// 工具函数
// ---------------------------------------------------------------------------

/**
 * 解析用户输入的地址。
 * @returns {{host: string, port: number|null} | {error: string}}
 */
function parseAddress(raw) {
  let text = String(raw !== null && raw !== undefined ? raw : '').trim();
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
      portText = parts[1] !== undefined && parts[1] !== null ? parts[1] : null;
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

const findServer = (id) => ((snap && snap.servers) ? snap.servers.find((server) => server.id === id) : null) || null;

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
  // 探活结果会刷新延迟，内嵌层的卡片跟着更新
  if (embedded) renderPill();
}

function renderList() {
  const list = $('server-list');
  const servers = (snap && snap.servers) || [];
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
    if (embedded && embedded.id === server.id) {
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
  const ports = server.port != null
    ? [server.port]
    : (snap && snap.settings && snap.settings.probePorts && snap.settings.probePorts.length
      ? snap.settings.probePorts
      : [3000, 80, 54321]);

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
      if (result && result.ok) {
        await refresh(await invoke('record_probe', { id, port, latencyMs: result.latencyMs, ok: true }));
        if (!quiet) toast(`${server.host}:${port} · ${result.latencyMs} ms`);
        return result;
      }
      lastError = result && result.error ? result.error : null;
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
  const servers = (snap && snap.servers) || [];
  if (!servers.length) return;
  // 控制并发数为 3，平滑底层 TCP 连接与 CPU 调度，避免瞬时风暴
  const queue = [...servers];
  const results = [];
  const workers = new Array(Math.min(3, queue.length)).fill(0).map(async () => {
    while (queue.length > 0) {
      const server = queue.shift();
      if (!server) break;
      const res = await probeOne(server.id, { quiet: true });
      results.push(res);
    }
  });
  await Promise.all(workers);
  const online = results.filter((result) => result && result.ok).length;
  toast(t('probeSummary', online, results.length - online));
}

async function connect(id) {
  const server = findServer(id);
  if (!server) return;

  if (server.port == null) {
    toast(t('detectingPort'));
    const result = await probeOne(id, { quiet: true });
    if (!result || !result.ok) {
      toast((result && result.error) || t('unreachable'), true);
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
      pill.expanded = false; // 每次进入都从贴边收起的状态开始
      clearAutoDock();
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
// 移动端：游戏内嵌层（游戏 + 贴边浮球）
// ---------------------------------------------------------------------------

/** 浮球尺寸；这几个值要和 styles.css 里的 `.embed-pill` / `.embed-card` 对上。 */
const PILL_SIZE = 40; // 收起时的圆球直径
const PILL_GAP = 6; // 圆球与屏幕边缘的间距
const CARD_GAP = 8; // 卡片与圆球之间的间隙
const CARD_INSET = 8; // 卡片与屏幕边缘的最小间距
const CARD_MAX_W = 320; // 卡片最大宽度
const AUTO_DOCK_MS = 4000; // 展开后多久自动贴边收起
const DOCK_EDGES = ['left', 'right', 'top', 'bottom'];

const PILL_STATE_KEY = 'ezsp.embedPillState';
const PILL_POS_KEY = 'ezsp.embedPillPos'; // 0.2.2 及以前的自由坐标，读到就迁移

/**
 * 浮球状态。位置只有两个值：贴着哪条边（`dock`）+ 沿那条边偏移多少（`along`），
 * 所以拖完松手、旋转屏幕、换设备尺寸都能算回画面里，不会跑到屏幕外找不回来。
 */
const pill = {
  expanded: false,
  dock: 'left',
  along: null,
  timer: null, // 自动收起的定时器
  dragging: false, // 拖动中：位置归手指管，别让刷新把球拽回去
};

/** 刘海 / 挖孔的安全区：横屏时在左或右边，贴边球不能钻到它底下。 */
const safeInsets = { top: 0, right: 0, bottom: 0, left: 0 };

// 恢复上次的贴边位置（读不到就用默认：贴左边、沿边居中）。
const savedPill = readPillState();
if (savedPill) {
  pill.dock = savedPill.dock;
  pill.along = savedPill.along;
}

/**
 * 读 `env(safe-area-inset-*)`：CSS 的环境变量在 JS 里读不到，
 * 就先在视口四边各摆一个 1px 探针量出位置，量完立刻删掉。桌面端全是 0。
 */
function measureSafeInsets() {
  const probe = document.createElement('div');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText = 'position:fixed;inset:0;visibility:hidden;pointer-events:none';
  probe.innerHTML = DOCK_EDGES.map(
    (side) => `<i style="position:absolute;width:1px;height:1px;${side}:env(safe-area-inset-${side},0px)"></i>`,
  ).join('');
  document.body.appendChild(probe);

  Array.from(probe.children).forEach((node, index) => {
    const side = DOCK_EDGES[index];
    const rect = node.getBoundingClientRect();
    if (side === 'top') safeInsets.top = Math.max(0, Math.round(rect.top));
    if (side === 'left') safeInsets.left = Math.max(0, Math.round(rect.left));
    if (side === 'right') safeInsets.right = Math.max(0, Math.round(window.innerWidth - rect.right));
    if (side === 'bottom') safeInsets.bottom = Math.max(0, Math.round(window.innerHeight - rect.bottom));
  });

  probe.remove();
  return safeInsets;
}

/** 离哪条边最近就贴哪条边；`along` 取这一侧的中心，收成球后就停在那儿。 */
function nearestDock(rect) {
  const distance = {
    left: rect.left,
    right: window.innerWidth - rect.right,
    top: rect.top,
    bottom: window.innerHeight - rect.bottom,
  };
  let dock = DOCK_EDGES[0];
  for (const edge of DOCK_EDGES) {
    if (distance[edge] < distance[dock]) dock = edge;
  }
  const horizontal = dock === 'left' || dock === 'right';
  const center = horizontal ? rect.top + rect.height / 2 : rect.left + rect.width / 2;
  return { dock, along: center - PILL_SIZE / 2 };
}

/** 圆球沿边能挪的范围（躲开安全区，也不出屏幕）。 */
function alongLimits(dock) {
  const horizontal = dock === 'left' || dock === 'right';
  const from = (horizontal ? safeInsets.top : safeInsets.left) + PILL_GAP;
  const to =
    (horizontal ? window.innerHeight - safeInsets.bottom : window.innerWidth - safeInsets.right) -
    PILL_GAP -
    PILL_SIZE;
  return [from, Math.max(from, to)];
}

function clampAlong(dock, along) {
  const [from, to] = alongLimits(dock);
  const value = Number.isFinite(along) ? along : (from + to) / 2;
  return Math.round(Math.min(Math.max(value, from), to));
}

/** 收起时圆球的左上角坐标。 */
function pillOrigin() {
  const along = clampAlong(pill.dock, pill.along);
  if (pill.dock === 'right') {
    return { x: window.innerWidth - safeInsets.right - PILL_GAP - PILL_SIZE, y: along };
  }
  if (pill.dock === 'top') return { x: along, y: safeInsets.top + PILL_GAP };
  if (pill.dock === 'bottom') {
    return { x: along, y: window.innerHeight - safeInsets.bottom - PILL_GAP - PILL_SIZE };
  }
  return { x: safeInsets.left + PILL_GAP, y: along };
}

/**
 * 把卡片摆在圆球旁边、朝画面里展开：球贴左边就往右开，球在底边就往上开。
 * 宽度显式算出来（高度随内容），所以不用"先渲染再量尺寸"，旋转屏幕也不会溢出画面。
 */
function layoutCard(node) {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const rightEdge = W - safeInsets.right;
  const bottomEdge = H - safeInsets.bottom;
  const { x, y } = pillOrigin();
  const fit = (space) => `${Math.max(160, Math.min(Math.min(CARD_MAX_W, Math.round(W * 0.6)), space))}px`;

  node.style.left = 'auto';
  node.style.right = 'auto';
  node.style.top = 'auto';
  node.style.bottom = 'auto';
  node.style.width = '';

  if (pill.dock === 'left' || pill.dock === 'right') {
    // 上下哪边空就往哪边长，卡片始终贴着球
    if (y + PILL_SIZE / 2 <= (safeInsets.top + bottomEdge) / 2) {
      node.style.top = `${Math.max(y, safeInsets.top + CARD_INSET)}px`;
    } else {
      node.style.bottom = `${Math.max(H - y - PILL_SIZE, safeInsets.bottom + CARD_INSET)}px`;
    }
    if (pill.dock === 'left') {
      const left = Math.max(safeInsets.left + CARD_INSET, x + PILL_SIZE + CARD_GAP);
      node.style.left = `${left}px`;
      node.style.width = fit(rightEdge - CARD_INSET - left);
    } else {
      const cardRight = x - CARD_GAP;
      const width = Math.min(Math.min(CARD_MAX_W, Math.round(W * 0.6)), cardRight - safeInsets.left - CARD_INSET);
      node.style.width = `${Math.max(160, width)}px`;
      node.style.left = `${Math.max(safeInsets.left + CARD_INSET, cardRight - Math.max(160, width))}px`;
    }
    return;
  }

  // 上/下贴边：卡片放在球的里侧，左右跟着球所在的半屏走
  if (pill.dock === 'top') {
    node.style.top = `${Math.max(y + PILL_SIZE + CARD_GAP, safeInsets.top + CARD_INSET)}px`;
  } else {
    node.style.bottom = `${Math.max(H - y + CARD_GAP, safeInsets.bottom + CARD_INSET)}px`;
  }
  if (x + PILL_SIZE / 2 <= (safeInsets.left + rightEdge) / 2) {
    const left = Math.max(safeInsets.left + CARD_INSET, x);
    node.style.left = `${left}px`;
    node.style.width = fit(rightEdge - CARD_INSET - left);
  } else {
    const cardRight = Math.min(rightEdge - CARD_INSET, x + PILL_SIZE);
    const width = Math.min(Math.min(CARD_MAX_W, Math.round(W * 0.6)), cardRight - safeInsets.left - CARD_INSET);
    node.style.width = `${Math.max(160, width)}px`;
    node.style.left = `${Math.max(safeInsets.left + CARD_INSET, cardRight - Math.max(160, width))}px`;
  }
}

/** 渲染 / 更新内嵌的游戏层（没有内嵌时移除它）。 */
function renderEmbed() {
  const existing = $('embed-layer');
  if (!embedded) {
    clearAutoDock();
    if (existing) {
      const frame = existing.querySelector('#embed-frame');
      if (frame) frame.src = 'about:blank';
      existing.remove();
    }
    // 回到启动器：把被隐藏的启动器 DOM 放回布局
    document.body.classList.remove('is-embedded');
    return;
  }

  let layer = existing;
  if (!layer) {
    layer = document.createElement('div');
    layer.id = 'embed-layer';
    // 全屏下空间都留给游戏，只留一颗贴边的浮球
    layer.innerHTML = `
      <iframe id="embed-frame" allow="fullscreen; autoplay; gamepad" allowfullscreen></iframe>
      <div id="embed-card" class="embed-card" role="group" hidden>
        <div class="embed-card-head">
          <span class="embed-card-dot"></span>
          <span class="embed-card-title"></span>
        </div>
        <span class="embed-card-meta"></span>
        <div class="embed-card-foot">
          <button type="button" class="embed-card-exit"></button>
          <span class="embed-card-hint"></span>
        </div>
        <span class="embed-card-timer" aria-hidden="true"></span>
      </div>
      <div id="embed-pill" class="embed-pill" role="button" tabindex="0">
        <img class="embed-pill-logo" src="icon.png" alt="" />
        <span class="embed-pill-dot"></span>
      </div>`;
    document.body.appendChild(layer);
    // 内嵌时把启动器自己的界面从布局里摘掉：它和游戏跑在同一个渲染进程/同一根主线程上，
    // 留着只会继续参与样式解析、布局与合成（还不会因被不透明层盖住就完全免掉层的维护）。
    document.body.classList.add('is-embedded');
    wirePill(layer.querySelector('#embed-pill'));
    wireCard(layer.querySelector('#embed-card'));
  } else {
    document.body.classList.add('is-embedded');
  }

  const frame = layer.querySelector('#embed-frame');
  if (frame.getAttribute('src') !== embedded.url) frame.setAttribute('src', embedded.url);

  renderPill();
}

let insetsDirty = true;
function ensureSafeInsets() {
  if (insetsDirty) {
    measureSafeInsets();
    insetsDirty = false;
  }
}

/** 刷新浮球 / 卡片的文案与位置（在线状态变了也走这里）。 */
function renderPill() {
  const layer = $('embed-layer');
  const ball = layer ? layer.querySelector('#embed-pill') : null;
  const card = layer ? layer.querySelector('#embed-card') : null;
  if (!ball || !card || !embedded) return;

  const server = findServer(embedded.id);
  const isProbing = probing.has(embedded.id);
  const state = isProbing
    ? 'probing'
    : (server && server.lastLatencyMs != null)
      ? 'online'
      : (server && server.lastSeenAt)
        ? 'offline'
        : 'unknown';
  const status = isProbing
    ? t('probing')
    : (server && server.lastLatencyMs != null)
      ? `${t('online')} · ${server.lastLatencyMs} ms`
      : (server && server.lastSeenAt)
        ? t('offline')
        : t('unknown');

  ensureSafeInsets();
  pill.along = clampAlong(pill.dock, pill.along);

  // 收起态：一颗贴边的圆球，只显示图标与在线状态
  const origin = pillOrigin();
  ball.dataset.dock = pill.dock;
  ball.dataset.expanded = String(pill.expanded);
  ball.setAttribute('aria-expanded', String(pill.expanded));
  ball.setAttribute('aria-label', `${embedded.address} · ${status}`);
  ball.title = pill.expanded ? t('pillTuckHint') : t('pillTapHint');
  // 拖动中位置归手指管：探活结果之类触发的重绘不能把球拽回贴边位置
  if (!pill.dragging) {
    ball.style.left = `${origin.x}px`;
    ball.style.top = `${origin.y}px`;
  }
  ball.querySelector('.embed-pill-dot').className = `embed-pill-dot ${state}`;

  // 展开态：卡片
  card.hidden = !pill.expanded;
  if (!pill.expanded) return;
  card.querySelector('.embed-card-title').textContent = embedded.address;
  card.querySelector('.embed-card-meta').textContent = status;
  card.querySelector('.embed-card-dot').className = `embed-card-dot ${state}`;
  card.querySelector('.embed-card-hint').textContent = t('pillAutoDockHint', AUTO_DOCK_MS / 1000);
  card.querySelector('.embed-card-exit').textContent = t('backToLauncher');
  layoutCard(card);
}

function expandPill() {
  if (!embedded || pill.expanded) return;
  pill.expanded = true;
  renderPill();
  armAutoDock();
}

/** 收起卡片（球本来就贴着边，所以收起来就是"贴边收起"）。 */
function tuckPill() {
  if (!pill.expanded) return;
  pill.expanded = false;
  clearAutoDock();
  renderPill();
}

/** 开始自动收起的倒计时，同时让卡片底部那条进度条走完。 */
function armAutoDock() {
  clearAutoDock();
  const card = $('embed-card');
  if (!pill.expanded || !card) return;

  const bar = card.querySelector('.embed-card-timer');
  if (bar) {
    bar.style.transition = 'none';
    bar.style.transform = 'scaleX(1)';
    void bar.offsetWidth; // 强制一次重排，进度条才会从头开始
    bar.style.transition = `transform ${AUTO_DOCK_MS}ms linear`;
    bar.style.transform = 'scaleX(0)';
  }
  pill.timer = setTimeout(() => {
    pill.timer = null;
    tuckPill();
  }, AUTO_DOCK_MS);
}

function clearAutoDock() {
  if (pill.timer) {
    clearTimeout(pill.timer);
    pill.timer = null;
  }
  const embedCard = $('embed-card');
  const bar = embedCard ? embedCard.querySelector('.embed-card-timer') : null;
  if (bar) {
    bar.style.transition = 'none';
    bar.style.transform = 'scaleX(1)';
  }
}

/** 浮球位置存 localStorage：纯界面偏好，不值得为它改配置结构。 */
function readPillState() {
  try {
    const saved = JSON.parse(localStorage.getItem(PILL_STATE_KEY) || 'null');
    if (saved && DOCK_EDGES.includes(saved.dock) && Number.isFinite(saved.along)) {
      return { dock: saved.dock, along: saved.along };
    }
    // 0.2.2 及以前只存绝对坐标：换算成最近的一条边
    const legacy = JSON.parse(localStorage.getItem(PILL_POS_KEY) || 'null');
    if (legacy && Number.isFinite(legacy.x) && Number.isFinite(legacy.y)) {
      return nearestDock({
        left: legacy.x,
        top: legacy.y,
        right: legacy.x + PILL_SIZE,
        bottom: legacy.y + PILL_SIZE,
      });
    }
  } catch {
    /* 坏数据当没有，用默认位置 */
  }
  return null;
}

function savePillState() {
  try {
    localStorage.setItem(PILL_STATE_KEY, JSON.stringify({ dock: pill.dock, along: pill.along !== null && pill.along !== undefined ? pill.along : 0 }));
    localStorage.removeItem(PILL_POS_KEY);
  } catch {
    /* 存不上就算了，下次重新拖 */
  }
}

/** 卡片上的按钮：返回启动器（退出这条路径做成显式按钮，对局中不会误触）。 */
function wireCard(card) {
  const exit = card.querySelector('.embed-card-exit');
  exit.addEventListener('click', () => exitEmbed());
  // 看一眼状态时点一下卡片：续一个倒计时，不打断对局
  card.addEventListener('click', (event) => {
    if (event.target.closest('.embed-card-exit')) return;
    if (pill.expanded) armAutoDock();
  });
}

/**
 * 浮球交互：拖动 = 挪位置（松手吸附到最近的边，上下左右都可以），
 * 不拖动 = 点击（展开 / 收起）。展开后闲置 AUTO_DOCK_MS 自动贴边收起。
 */
function wirePill(node) {
  const TAP_SLOP = 6; // 位移小于这个像素数仍视为点击
  let active = false;
  let moved = false;
  let pointerId = null;
  let start = null;

  node.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const rect = node.getBoundingClientRect();
    active = true;
    moved = false;
    pointerId = event.pointerId;
    start = { x: event.clientX, y: event.clientY, left: rect.left, top: rect.top };
    clearAutoDock(); // 按住时先别自动收起
    pill.dragging = true;
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
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (!moved && Math.hypot(dx, dy) < TAP_SLOP) return;
    if (!moved) {
      moved = true;
      tuckPill(); // 拖动时先把卡片收起来，免得跟着球一起飘
    }
    const x = Math.min(Math.max(start.left + dx, 0), window.innerWidth - PILL_SIZE);
    const y = Math.min(Math.max(start.top + dy, 0), window.innerHeight - PILL_SIZE);
    node.style.left = `${Math.round(x)}px`;
    node.style.top = `${Math.round(y)}px`;
  });

  // 松手吸附到最近的边：left / right / top / bottom 任意一条
  const dockToNearest = () => {
    const target = nearestDock(node.getBoundingClientRect());
    pill.dock = target.dock;
    pill.along = clampAlong(target.dock, target.along);
    savePillState();
    renderPill(); // left / top 有过渡，看上去就是"吸"过去
  };

  const finish = (event, cancelled) => {
    if (!active || event.pointerId !== pointerId) return;
    active = false;
    pill.dragging = false;
    node.classList.remove('dragging');
    try {
      node.releasePointerCapture(pointerId);
    } catch {
      /* 忽略 */
    }

    if (moved) {
      // 拖到一半被系统打断也要回到边上，不能停在半空
      dockToNearest();
      return;
    }
    if (cancelled) {
      // 手势被系统打断、又没拖动：卡片若还开着就把倒计时接回去
      if (pill.expanded) armAutoDock();
      return;
    }

    if (pill.expanded) tuckPill();
    else expandPill();
  };

  node.addEventListener('pointerup', (event) => finish(event, false));
  node.addEventListener('pointercancel', (event) => finish(event, true));
  // 键盘可达（桌面调试时用）
  node.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    if (pill.expanded) tuckPill();
    else expandPill();
  });
}

function exitEmbed() {
  if (!embedded) return;
  const existing = $('embed-layer');
  if (existing) {
    const frame = existing.querySelector('#embed-frame');
    if (frame) frame.src = 'about:blank';
    existing.remove();
  }
  embedded = null;
  pill.expanded = false;
  clearAutoDock();
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
  editingId = (server && server.id) ? server.id : null;
  $('server-modal-title').textContent = server ? t('editTitle') : t('addTitle');
  $('f-name').value = (server && server.name) ? server.name : '';
  $('f-address').value = server ? (server.port == null ? server.host : `${server.host}:${server.port}`) : '';
  $('f-note').value = (server && server.note) ? server.note : '';
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
  $('s-ports').value = ((settings && settings.probePorts) || []).join(', ');
  $('s-auto-probe').checked = !!(settings && settings.autoProbe);
  $('s-fullscreen').checked = !!(settings && settings.gameFullscreen);
  $('s-isolate').checked = !!(settings && settings.isolateStorage);
  $('s-minimize').checked = !!(settings && settings.minimizeOnConnect);
  $('s-acceleration').checked = settings && settings.performanceAcceleration !== undefined ? !!settings.performanceAcceleration : true;
  $('s-render-scale').value = (settings && settings.renderScale) || 'auto';
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
    performanceAcceleration: $('s-acceleration').checked,
    renderScale: $('s-render-scale').value || 'auto',
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
  if (navigator.clipboard && navigator.clipboard.writeText) {
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
// 系统返回键响应（Android / 键盘）
// ---------------------------------------------------------------------------

window.__EZSP_BACK_HANDLER = () => {
  // 1. 如果当前正在内嵌游戏中，返回键退出内嵌游戏回到启动器
  if (embedded) {
    exitEmbed();
    return true;
  }
  // 2. 如果当前有打开的模态弹窗，优先关闭模态弹窗
  const openModals = document.querySelectorAll('.modal:not([hidden])');
  if (openModals.length > 0) {
    for (const modal of openModals) {
      modal.hidden = true;
    }
    return true;
  }
  // 3. 已经在主界面且无弹窗，允许系统走默认后退行为（退出/退到后台）
  return false;
};

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

/** 等待 Tauri 注入脚本就绪，避免低版本 WebView 异步 evaluateJavascript 竞态导致误判 */
function waitForTauri(timeoutMs = 3000) {
  if (window.__TAURI__) return Promise.resolve(window.__TAURI__);
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const timer = setInterval(() => {
      if (window.__TAURI__) {
        clearInterval(timer);
        resolve(window.__TAURI__);
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(timer);
        reject(new Error(t('noTauri')));
      }
    }, 40);
  });
}

async function init() {
  try {
    await waitForTauri(3000);
  } catch (_e) {
    document.body.innerHTML = `<p style="padding:24px">${esc(t('noTauri'))}</p>`;
    return;
  }

  snap = await invoke('load_state');
  lang = (snap && snap.settings && snap.settings.language === 'en') ? 'en' : 'zh';
  selectedId = snap.activeId || (snap.servers && snap.servers[0] ? snap.servers[0].id : null);

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

  // 旋转屏幕 / 改窗口大小：重算贴边位置，卡片跟着重新摆
  window.addEventListener('resize', () => {
    insetsDirty = true;
    if (embedded) renderPill();
  });

  // 启动后自动探活上次用的服务器（只探活，不自动开窗）。
  if (snap && snap.settings && snap.settings.autoProbe && selectedId) {
    probeOne(selectedId, { quiet: true });
  }
}

init().catch((error) => {
  const node = $('toast') || document.body;
  if (node === document.body) {
    document.body.innerHTML = `<p style="padding:24px">${esc(String(error))}</p>`;
  } else {
    toast(String(error), true);
  }
});
