/* 内容创作工作台 · 公共模块（dsh-worktable 多窗口共用）
 * 同源 127.0.0.1:3080，直连 /creator/api；localStorage 跨 iframe 联动：
 *   cw.currentTopic = 当前选中主题 id（窗口1 写，窗口2/3 监听）
 *   cw.revision     = 库变化广播（窗口1 轮询 /creator/api/revision 后写，其他窗口监听刷新）
 */
(function (global) {
  'use strict';
  var API = '/creator/api';
  var KEY_TOPIC = 'cw.currentTopic';
  var KEY_REV = 'cw.revision';

  async function jget(path) {
    var r = await fetch(API + path, { headers: { 'content-type': 'application/json' } });
    var p = await r.json().catch(function () { return { ok: false, error: { message: '无效响应 ' + r.status } }; });
    if (!r.ok || !p.ok) throw new Error((p.error && p.error.message) || ('请求失败 ' + r.status));
    return p.data;
  }
  async function jpost(path, body) {
    var r = await fetch(API + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) });
    var p = await r.json().catch(function () { return { ok: false, error: { message: '无效响应 ' + r.status } }; });
    if (!r.ok || !p.ok) throw new Error((p.error && p.error.message) || ('请求失败 ' + r.status));
    return p.data;
  }

  var GATE_ORDER = ['brief_sources', 'approved_article', 'platform_variants', 'publish_package'];
  var GATE_LABEL = { brief_sources: 'Brief 与来源', approved_article: '公众号长文', platform_variants: '平台变体', publish_package: '发布包' };
  var STAGE_LABEL = { brief: 'Brief', article: '长文', variants: '变体', video: '视频', publish: '发布' };

  function esc(s) {
    return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function gatesOf(project) {
    var map = {};
    (project.approvals || []).forEach(function (g) { map[g.gate] = g.approved === true; });
    return map;
  }
  function nextGate(project) {
    var gates = gatesOf(project);
    for (var i = 0; i < GATE_ORDER.length; i++) if (!gates[GATE_ORDER[i]]) return GATE_ORDER[i];
    return null;
  }
  function artifactsReady(project) {
    return (project.artifacts || []).filter(function (a) { return a.ready; }).length;
  }
  function h(html) {
    var d = document.createElement('div');
    d.innerHTML = html;
    return d.firstChild;
  }
  function badge(text, done) {
    var s = document.createElement('span');
    s.className = 'dshell-badge' + (done ? ' dshell-badgeDone' : ' dshell-badgeWait');
    s.textContent = text;
    return s;
  }

  // —— 联动 ——
  function getCurrentTopic() { try { return localStorage.getItem(KEY_TOPIC); } catch { return null; } }
  function setCurrentTopic(id) { try { localStorage.setItem(KEY_TOPIC, id); } catch {} }
  function onTopicChange(fn) {
    window.addEventListener('storage', function (e) { if (e.key === KEY_TOPIC) fn(e.newValue); });
    var cur = getCurrentTopic();
    if (cur) fn(cur);
  }
  function onRevision(fn) {
    window.addEventListener('storage', function (e) { if (e.key === KEY_REV) fn(); });
  }
  function broadcastRevision() { try { localStorage.setItem(KEY_REV, String(Date.now())); } catch {} }

  // —— 轮询（仅窗口1 调用 startPoller；refresh 为窗口1 自身刷新回调） ——
  var lastRevision = '';
  function startPoller(refresh) {
    async function tick() {
      try {
        var r = await jget('/revision');
        if (r.revision !== lastRevision) {
          lastRevision = r.revision;
          broadcastRevision();
          if (typeof refresh === 'function') refresh();
        }
      } catch (e) { /* 瞬时失败忽略 */ }
    }
    setInterval(tick, 3000);
  }

  var CW = {
    API: API,
    jget: jget,
    jpost: jpost,
    esc: esc,
    gatesOf: gatesOf,
    nextGate: nextGate,
    artifactsReady: artifactsReady,
    h: h,
    badge: badge,
    GATE_ORDER: GATE_ORDER,
    GATE_LABEL: GATE_LABEL,
    STAGE_LABEL: STAGE_LABEL,
    getCurrentTopic: getCurrentTopic,
    setCurrentTopic: setCurrentTopic,
    onTopicChange: onTopicChange,
    onRevision: onRevision,
    broadcastRevision: broadcastRevision,
    startPoller: startPoller,
    // 数据
    listProjects: function (q) { return jget('/projects' + (q ? '?q=' + encodeURIComponent(q) : '')); },
    getProject: function (id) { return jget('/projects/' + encodeURIComponent(id)); },
    updateArtifact: function (id, patch) { return jpost('/projects/' + encodeURIComponent(id) + '/artifacts', patch); },
    approveGate: function (id, gate) { return jpost('/projects/' + encodeURIComponent(id) + '/approve', { gate: gate }); },
    runStage: function (id, stage) { return jpost('/projects/' + encodeURIComponent(id) + '/stage', { stage: stage }); },
    getCapabilities: function () { return jget('/capabilities'); },
    getRevision: function () { return jget('/revision'); },
    listCandidates: function () { return jget('/candidates').then(function (d) { return d.items; }); },
    addCandidate: function (input) { return jpost('/candidates', input); },
    selectCandidates: function (ids) { return jpost('/candidates/select', { ids: ids }); },
    convertCandidate: function (id) { return jpost('/candidates/convert', { id: id }); },
    getProfile: function () { return jget('/profile'); },
    saveProfile: function (patch) { return jpost('/profile', patch); },
    getSettings: function () { return jget('/settings'); },
    reviewScore: function (id) { return jpost('/review-score', { id: id }); },
    checkSimilarity: function (id, target) { return jpost('/similarity-check', { id: id, target: target || 'both' }); },
    generateImage: function (id, prompt, target) { return jpost('/generate-image', { id: id, prompt: prompt, target: target || 'cards' }); },
    readFile: function (path) { return fetch('/api/worktable/file?path=' + encodeURIComponent(path), { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error('读取文件失败 ' + r.status); return r.text(); }); },
  };
  global.CW = CW;
})(window);
