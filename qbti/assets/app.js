(function () {
  'use strict';
  var data = window.QBTI_DATA;
  var engine = window.QBTI_ENGINE;
  var characterImages = window.QBTI_CHARACTER_IMAGES;
  var app = document.getElementById('app');
  if (!data || !engine || !characterImages) {
    app.innerHTML = '<p class="loading">文件还没到齐。请保留整个 QBTI-preview 文件夹，再打开 index.html。</p>';
    return;
  }
  var KEY = 'qbti-preview-v' + data.version;
  var STAT_KEY = 'qbti-local-totals-v1';
  var questions = data.questions;
  var profiles = data.profiles;
  var answers = {};
  var answerRevision = data.questionnaireRevision || 1;
  var questionRevisions = {};
  var cursor = 0;
  var consent = false;
  var completed = false;
  var contribution = null;
  var view = 'home';
  var atlasReturn = 'home';
  var atlasFilter = '全部';
  var atlasScroll = 0;
  var detailId = null;
  var editing = false;
  var locked = false;
  var renderSerial = 0;
  var noticeTimer;
  var storageOK = true;
  var stats = { count: 0, needs: {} };
  var needs = questions.filter(function (q) { return q.kind === 'needs'; });
  var mainCount = questions.filter(function (q) { return q.kind === 'main'; }).length;
  function esc(value) {
    return String(value === undefined || value === null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function read(key) {
    try { return JSON.parse(window.localStorage.getItem(key)); }
    catch (error) { storageOK = false; return null; }
  }
  function write(key, value) {
    try { window.localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (error) { storageOK = false; return false; }
  }
  function validAnswer(q, value) {
    return typeof value === 'number' && Math.floor(value) === value && value >= -1 && value < q.options.length;
  }
  function sanitize(raw) {
    var clean = {};
    if (!raw || typeof raw !== 'object') { return clean; }
    questions.forEach(function (q) { if (validAnswer(q, raw[q.id])) { clean[q.id] = raw[q.id]; } });
    return clean;
  }
  function hasAnswer(q) { return validAnswer(q, answers[q.id]); }
  function allComplete() { return questions.every(function (q) { return q.kind === 'opinion' || hasAnswer(q); }); }
  function save() {
    write(KEY, { version: data.version, answers: answers, answerRevision: answerRevision, questionRevisions: questionRevisions, cursor: cursor, currentQuestionId: questions[cursor].id, consent: consent, completed: completed, contribution: contribution });
  }
  function resetStats() {
    stats = { count: 0, needs: {} };
    needs.forEach(function (q) { stats.needs[q.id] = [0, 0, 0, 0, 0]; });
  }
  resetStats();
  var stored = read(KEY);
  if (stored && stored.version === data.version) {
    answers = sanitize(stored.answers);
    answerRevision = stored.answerRevision === data.questionnaireRevision ? data.questionnaireRevision : 1;
    if (stored.questionRevisions && typeof stored.questionRevisions === 'object') {
      questions.forEach(function (q) { if (stored.questionRevisions[q.id] === data.questionnaireRevision) { questionRevisions[q.id] = data.questionnaireRevision; } });
    }
    cursor = typeof stored.cursor === 'number' && isFinite(stored.cursor) ? Math.max(0, Math.min(questions.length - 1, Math.floor(stored.cursor))) : 0;
    var savedQuestionIndex = questions.findIndex(function (q) { return q.id === stored.currentQuestionId; });
    if (savedQuestionIndex >= 0) { cursor = savedQuestionIndex; }
    else if (!stored.currentQuestionId && cursor >= 1) { cursor = Math.min(cursor + 1, questions.length - 1); }

    consent = stored.consent === true;
    completed = stored.completed === true && allComplete();
    if (Array.isArray(stored.contribution) && stored.contribution.length === needs.length && stored.contribution.every(function (n) { return Number.isInteger(n) && n >= 0 && n <= 4; })) {
      contribution = stored.contribution;
    }
  }
  var storedStats = read(STAT_KEY);
  if (storedStats && Number.isInteger(storedStats.count) && storedStats.count >= 0 && storedStats.count <= 100000 && storedStats.needs) {
    var validStats = needs.every(function (q) {
      var values = storedStats.needs[q.id];
      return Array.isArray(values) && values.length === 5 && values.every(function (n) { return Number.isInteger(n) && n >= 0 && n <= storedStats.count; }) && values.reduce(function (a, b) { return a + b; }, 0) === storedStats.count;
    });
    if (validStats) { stats = storedStats; } else { contribution = null; }
  } else { contribution = null; }
  function tell(message) {
    var el = document.getElementById('notice');
    el.textContent = message;
    el.className = 'visible';
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(function () { el.className = ''; }, 3400);
  }
  function bind(id, fn) { var el = document.getElementById(id); if (el) { el.addEventListener('click', fn); } }
  function bindAll(selector, fn) {
    Array.prototype.forEach.call(app.querySelectorAll(selector), function (el) {
      el.addEventListener('click', function () { fn(el); });
    });
  }
  function paint(html, nextView) {
    renderSerial++;
    locked = false;
    view = nextView;
    app.innerHTML = html;
    app.focus();
    window.scrollTo(0, 0);
  }
  function profile(id) { return profiles.filter(function (p) { return p.id === id; })[0]; }
  function characterSource(p) {
    return characterImages[p.id] || '';
  }
  function art(p, cls) { return '<img class="' + (cls || '') + '" src="' + esc(characterSource(p)) + '" alt="' + esc(p.name) + '的人格形象">'; }
  function top(label, backId, backText) {
    return '<div class="page-top"><button class="back" id="' + backId + '">← ' + (backText || '返回') + '</button><span class="page-label">' + label + '</span></div>';
  }
  function renderStartNotice() {
    paint('<div class="quiet-panel">' + top('QBTI / 测试说明', 'start-notice-back', '返回首页') + '<section class="start-notice" aria-labelledby="start-notice-title"><p class="eyebrow">JUST FOR FUN</p><h1 id="start-notice-title">测试说明</h1><div class="start-notice-copy"><p><strong>QBTI 是一个图一乐的感情人格测试，不是专业心理测评。</strong>题目参考了一些心理和人格概念，但结果不能当成专业结论。希望大家测得开心，玩得开心！</p></div><button class="primary" id="confirm-start">知道了，开测</button></section></div>', 'start-notice');
    bind('start-notice-back', home);
    bind('confirm-start', startFresh);
  }
  function startFresh() {
    answers = {}; answerRevision = data.questionnaireRevision || 1; questionRevisions = {}; cursor = 0; completed = false; contribution = null; editing = false;
    save(); renderQuiz();
  }
  function home() {
    var answered = questions.filter(hasAnswer).length;
    paint('<section class="cover" aria-labelledby="cover-title"><div class="cover-content"><h1 id="cover-title"><span>一刻没有为SBTI的过时哀伤，</span><span>现在映入你眼帘的是QBTI</span></h1><button class="primary cover-start" id="start">开始测试</button>' +
      (answered ? '<div class="resume"><button id="resume">' + (completed ? '查看上次结果 →' : '继续上次答题（' + answered + '/' + questions.length + '）→') + '</button></div>' : '') +
      '</div></section><div class="home-bottom cover-bottom"><div class="home-note"><p>答案只在本机处理，不上传。</p><details class="trial-settings" id="trial-settings"><summary>试用设置</summary><p class="caption">以下仅供产品试用：可自愿把其中 3 道独立选择题的答案计入本机汇总，用于查看当前需求偏好。不影响人格结果，也不是跨用户后台；不勾选照常答题。</p><label class="consent"><input id="local-consent" type="checkbox" ' + (consent ? 'checked' : '') + '>自愿记录本次 3 道独立题（仅本机，不上传）</label><button class="text-button" id="home-stats">查看本机汇总 ↗</button><p class="caption">' + (storageOK ? '进度尝试暂存在当前浏览器，不保证永久保留，可随时清除。' : '当前浏览器无法暂存；本次仍可完整答题，关页后进度可能丢失。') + '</p></details></div><div class="home-links" hidden><button class="text-button" id="home-atlas">先逛逛 26 种人格 ↗</button></div></div>', 'home');
    bind('start', renderStartNotice);
    bind('resume', function () { save(); if (completed) { renderResult(); } else { editing = false; renderQuiz(); } });
    bind('home-atlas', function () { atlasReturn = 'home'; renderAtlas(); });
    bind('home-stats', renderStats);
    document.getElementById('local-consent').addEventListener('change', function (event) { consent = event.target.checked; save(); });
  }
  function renderQuiz() {
    var q = questions[cursor];
    var chosen = answers[q.id];
    var answered = questions.filter(hasAnswer).length;
    var isNeeds = q.kind === 'needs';
    var opts = q.options.map(function (o, i) {
      return '<button class="option' + (chosen === i ? ' selected' : '') + '" data-answer="' + i + '" aria-pressed="' + (chosen === i) + '"><span class="letter">' + 'ABCD'.charAt(i) + '</span><span class="option-text">' + esc(o.text) + '</span><span class="tick" aria-hidden="true">' + (chosen === i ? '✓' : '') + '</span></button>';
    }).join('');

    paint('<section class="quiz-shell">' + top('QBTI / 感情人格测试', 'quiz-exit', editing ? '返回答卷' : '暂歇一下') + '<div class="progress-head"><span>' + esc(isNeeds ? questions[Math.max(0, cursor - 1)].group : q.group) + '</span><strong>' + String(cursor + 1).padStart(2, '0') + ' <span class="muted">/ ' + questions.length + '</span></strong></div><div class="progress-track" role="progressbar" aria-label="答题进度" aria-valuemin="0" aria-valuemax="' + questions.length + '" aria-valuenow="' + answered + '"><div class="progress-fill" style="width:' + Math.round(answered / questions.length * 100) + '%"></div></div><div class="quiz-body"><aside class="quiz-aside"><div class="question-number">' + String(cursor + 1).padStart(2, '0') + '</div></aside><div class="question-content' + (q.text.length > 60 ? ' long-question' : '') + '"><h1 id="question-title">' + esc(q.text) + '</h1><div class="options" aria-labelledby="question-title">' + opts + '</div><div class="question-bottom"><button id="previous" class="back" ' + (cursor === 0 ? 'disabled' : '') + '>← 上一题</button><button id="skip" class="skip">' + (chosen === -1 ? '已略过 · 继续 →' : isNeeds ? '不贴近，略过 →' : '拿不准，略过 →') + '</button></div>' + (hasAnswer(q) ? '<button id="keep-next" class="keep-next">保留这个选择，' + (editing ? '回到答卷' : cursor === questions.length - 1 ? '查看结果' : '下一题') + ' →</button>' : '') + '</div></div></section>', 'quiz');
    bind('quiz-exit', function () { save(); if (editing) { renderReview(); } else { home(); } });
    bind('previous', function () { if (cursor > 0) { cursor--; save(); renderQuiz(); } });
    bind('skip', function () { choose(-1); });
    bind('keep-next', advance);
    bindAll('[data-answer]', function (el) { choose(Number(el.getAttribute('data-answer')), el); });
  }
  function choose(value, el) {
    if (locked) { return; }
    locked = true;
    var serial = renderSerial;
    answers[questions[cursor].id] = value;
    questionRevisions[questions[cursor].id] = data.questionnaireRevision || 1;
    if (el) { el.className = 'option selected'; el.setAttribute('aria-pressed', 'true'); el.querySelector('.tick').textContent = '✓'; }
    save();
    setTimeout(function () { if (view === 'quiz' && renderSerial === serial) { advance(); } }, 160);
  }
  function advance() {
    locked = false;
    if (editing) {
      if (allComplete()) { completed = true; updateTotals(); }
      save(); renderReview(); return;
    }
    if (cursor < questions.length - 1) { cursor++; save(); renderQuiz(); }
    else {
      if (!allComplete()) { cursor = questions.findIndex(function (q) { return !hasAnswer(q); }); save(); renderQuiz(); return; }
      completed = true; updateTotals(); save(); renderResult();
    }
  }
  function updateTotals() {
    if (!consent || !allComplete()) { return; }
    var values = needs.map(function (q) { return answers[q.id] === -1 ? 4 : answers[q.id]; });
    if (contribution) {
      needs.forEach(function (q, i) { stats.needs[q.id][contribution[i]] = Math.max(0, stats.needs[q.id][contribution[i]] - 1); });
    } else { stats.count++; }
    needs.forEach(function (q, i) { stats.needs[q.id][values[i]]++; });
    contribution = values;
    write(STAT_KEY, stats);
  }
  function resultCard(p, share, match) {
    var num = profiles.indexOf(p) + 1;
    return '<div class="result-card" id="result-card"><div class="card-top"><strong>QBTI</strong><span>感情人格测试 / ' + String(num).padStart(2, '0') + '</span></div><p class="result-kicker">' + (view === 'atlas-detail' ? '感情里的奇怪生物之一' : match && match.mode === 'closest' ? '这次最接近的类型是——' : '恭喜你，测出了——') + '</p><h1>' + esc(p.name) + '</h1><p class="result-code">' + esc(p.code) + '</p>' + art(p, 'result-character') + '<p class="roast">' + esc(p.roast) + '</p>' + (share ? '<p class="voice">“' + esc(p.voice) + '”</p>' : '') + '<div class="card-footer"><span>有梗有爱 · 不作诊断</span><span>QBTI / 26</span></div></div>';
  }
  function renderDimensions() {
    var dimensions = engine.dimensions(answers, {answerRevision:answerRevision,questionRevisions:questionRevisions});
    if (!dimensions.length) { return ''; }
    return '<section class="dimension-panel" aria-labelledby="dimension-title"><div class="dimension-heading"><h2 id="dimension-title">你的感情维度</h2><span>倾向分 / 100</span></div>' + dimensions.map(function (dimension) {
      var exact = dimension.value !== null;
      var label = exact ? dimension.value : dimension.low + '–' + dimension.high;
      var track = exact ? '<span class="dimension-fill" style="width:' + dimension.value + '%"></span><span class="dimension-marker" style="left:' + dimension.value + '%"></span>' : '<span class="dimension-range-fill" style="left:' + dimension.low + '%;width:' + (dimension.high - dimension.low) + '%"></span><span class="dimension-marker range-marker" style="left:' + dimension.low + '%"></span><span class="dimension-marker range-marker" style="left:' + dimension.high + '%"></span>';
      return '<div class="dimension-row" data-dimension="' + esc(dimension.id) + '" data-low="' + dimension.low + '" data-high="' + dimension.high + '"><div class="dimension-label"><h3>' + esc(dimension.label) + '</h3><strong class="dimension-value' + (exact ? '' : ' dimension-range-value') + '">' + label + '</strong></div><div class="dimension-track' + (exact ? '' : ' dimension-range') + '"' + (exact ? ' role="meter" aria-label="' + esc(dimension.label + '，从' + dimension.lowLabel + '到' + dimension.highLabel) + '" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + dimension.value + '"' : ' role="img" aria-label="' + esc(dimension.label + '，倾向范围' + dimension.low + '至' + dimension.high) + '"') + '>' + track + '</div><div class="dimension-poles"><span>' + esc(dimension.lowLabel) + '</span><span>' + esc(dimension.highLabel) + '</span></div></div>';
    }).join('') + '</section>';
  }
  function detailBody(p, match) {
    var intro = match ? (match.mode === 'closest' ? p.intro.replace('恭喜您，测出了', '这次最接近的类型是') : p.intro) : p.intro.replace('恭喜您，测出了', '认识一下，');
    return '<div class="detail-body"><section class="persona-description" aria-label="人格介绍"><h2 class="persona-intro">' + esc(intro) + '</h2>' + p.description.map(function (paragraph) { return '<p>' + esc(paragraph) + '</p>'; }).join('') + '</section><section class="persona-voice"><p class="section-number">心里那句</p><p class="voice">“' + esc(p.voice) + '”</p></section>' + (match ? renderDimensions() : '<p class="caption">这是图鉴介绍，不代表你的测试结果。人可以同时有多面，也会随着想法和生活变化。</p>') + '<div class="actions">' + (match ? '<button class="primary wide" id="show-card">展开截图卡 ↗</button><button class="secondary" id="review">修改答案</button><button class="secondary" id="result-atlas" hidden>逛逛图鉴</button>' : '<button class="primary wide" id="detail-test">' + (completed ? '回到我的结果' : '测测我是哪种') + ' ↗</button>') + '</div></div>';
  }
  function renderResult() {
    if (!allComplete()) { renderQuiz(); return; }
    var match = engine.score(answers);
    var p = profile(match.profileId);
    view = 'result';
    if (!p) {
      paint(top('QBTI / 本次观察', 'result-home', '首页') + '<div class="neutral"><p class="big">?</p><p class="eyebrow">A FEW MORE ANSWERS</p><h1>这次还没有明确的人格倾向。</h1><p>' + esc(match.note || '这次还没有足够一致的线索。你可以回看答卷，补几道更贴近自己的选择。') + '</p><button class="primary" id="review">看看我的答卷 →</button><div class="actions"><button class="secondary" id="result-atlas" hidden>逛逛 26 种人格</button><button class="secondary" id="retest">重新测一次</button></div></div>' + renderDimensions(), 'result');
    } else {
      paint(top('YOUR LOVE PERSONA / 本次结果', 'result-home', '首页') + '<div class="result-layout">' + resultCard(p, false, match) + detailBody(p, match) + '</div><div class="result-tools"><button id="retest">重新测一次 ↻</button></div>', 'result');
      bind('show-card', function () { renderShare(p.id); });
    }
    bind('result-home', home);
    bind('review', renderReview);
    bind('retest', function () { home(); tell('准备好了就点开始。本次会生成一份新答卷。'); });
    bind('result-atlas', function () { atlasReturn = 'result'; renderAtlas(); });
  }
  function renderReview() {
    var rows = questions.map(function (q, i) {
      var value = answers[q.id];
      var label = value === -1 ? '已略过' : q.options[value] ? q.options[value].text : '还没选择';
      return '<div class="review-item"><div><h2><span class="muted">' + String(i + 1).padStart(2, '0') + ' / </span>' + esc(q.text) + '</h2><p>' + esc(label) + '</p></div><button data-edit="' + i + '" aria-label="修改第' + (i + 1) + '题">修改 ↗</button></div>';
    }).join('');
    paint('<div class="quiet-panel">' + top('QBTI / 我的答卷', 'review-back', '回到结果') + '<div class="page-heading"><p class="eyebrow">SECOND THOUGHTS WELCOME</p><h1>改口，也算真实。</h1><p>选更贴近自己的答案，改完可重新查看结果。</p></div>' + rows + '<div class="actions"><button class="primary wide" id="review-result">查看更新后的结果 ↗</button></div></div>', 'review');
    bind('review-back', renderResult); bind('review-result', renderResult);
    bindAll('[data-edit]', function (el) { cursor = Number(el.getAttribute('data-edit')); editing = true; renderQuiz(); });
  }
  function renderAtlas(preserveScroll) {
    var groups = ['全部'].concat(data.groups);
    var visible = profiles.filter(function (p) { return atlasFilter === '全部' || p.group === atlasFilter; });
    var cards = visible.map(function (p) {
      return '<button class="atlas-item" data-persona="' + esc(p.id) + '"><span class="catalog-number">NO. ' + String(profiles.indexOf(p) + 1).padStart(2, '0') + '</span>' + art(p) + '<h2>' + esc(p.name) + '</h2><p class="code">' + esc(p.code) + '</p><span class="card-link">↗</span></button>';
    }).join('');
    paint(top('THE QBTI COLLECTION / 26', 'atlas-back', atlasReturn === 'result' ? '我的结果' : atlasReturn === 'quiz' ? '继续答题' : '首页') + '<div class="page-heading"><p class="eyebrow">SAME LOVE. DIFFERENT WEIRDOS.</p><h1>感情物种，不完全图鉴。</h1><p>26 种精神面貌。可以对号入座，别替别人宣判。</p></div><div class="filter-row" aria-label="按内容组浏览">' + groups.map(function (g) { return '<button class="' + (g === atlasFilter ? 'active' : '') + '" data-filter="' + esc(g) + '">' + esc(g) + '</button>'; }).join('') + '</div><div class="atlas-grid">' + cards + '</div><p class="caption">纯爱战神与大义是爱情优先和理想优先的创作对照，不是科学验证的互斥人格。<br>所有称号都按你选的想法来匹配，不代表你一定有过某段经历。</p>', 'atlas');
    bind('atlas-back', function () { if (atlasReturn === 'result') { renderResult(); } else if (atlasReturn === 'quiz') { renderQuiz(); } else { home(); } });
    bindAll('[data-persona]', function (el) { atlasScroll = window.pageYOffset; detailId = el.getAttribute('data-persona'); renderDetail(detailId); });
    bindAll('[data-filter]', function (el) { atlasFilter = el.getAttribute('data-filter'); atlasScroll = 0; renderAtlas(); });
    if (preserveScroll) { window.scrollTo(0, atlasScroll); }
  }
  function renderDetail(id) {
    var p = profile(id);
    if (!p) { renderAtlas(); return; }
    view = 'atlas-detail';
    paint(top('QBTI / 人格图鉴', 'detail-back', '图鉴') + '<div class="result-layout">' + resultCard(p, false) + detailBody(p, null) + '</div>', 'atlas-detail');
    bind('detail-back', function () { renderAtlas(true); });
    bind('detail-test', function () { if (completed) { renderResult(); } else { home(); } });
  }
  function bridgeAvailable() {
    var bridge = window.xhs && window.xhs.miniTool;
    return !!(bridge && typeof bridge.writeTempFile === 'function' && typeof bridge.saveImageToPhotosAlbum === 'function');
  }
  function renderShare(id) {
    var p = profile(id);
    var nativeSave = bridgeAvailable();
    paint('<div class="share-wrap">' + top('QBTI / 截图卡', 'share-back', '结果详情') + resultCard(p, true, engine.score(answers)) + '<div class="share-actions"><button class="primary" id="save-card" ' + (nativeSave ? '' : 'disabled') + '>保存到相册</button><p class="caption">' + (nativeSave ? '由小红书相册能力保存，首次可能需要相册权限。' : '当前浏览器不提供相册保存，请用设备截图留住这张卡。') + '<br>本试用版不直接发布或上传。卡片不展示你的具体答案。</p></div></div>', 'share');
    bind('share-back', renderResult);
    bind('save-card', function () { saveNativeCard(p); });
  }
  function saveNativeCard(p) {
    if (!bridgeAvailable()) { tell('当前环境无法保存到相册，可以使用设备截图。'); return; }
    var button = document.getElementById('save-card');
    button.disabled = true; button.textContent = '正在准备图片…';
    var canvas = document.createElement('canvas');
    canvas.width = 720; canvas.height = 1060;
    var ctx = canvas.getContext('2d');
    if (!ctx) { button.disabled = false; button.textContent = '保存到相册'; tell('图片生成不可用，请使用设备截图。'); return; }
    function fail() { button.disabled = false; button.textContent = '保存到相册'; tell('这次没有保存成功，可以重试或使用设备截图。'); }
    var img = new Image();
    img.onerror = fail;
    img.onload = function () {
      try {
        ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, 720, 1060);
        ctx.strokeStyle = '#29262A'; ctx.lineWidth = 2; ctx.strokeRect(24, 24, 672, 1012);
        ctx.fillStyle = '#C93468'; ctx.font = '900 32px sans-serif'; ctx.fillText('QBTI', 56, 84);
        ctx.fillStyle = '#797078'; ctx.font = '20px sans-serif'; ctx.fillText('感情人格测试', 470, 83);
        ctx.fillStyle = '#29262A'; ctx.font = '900 83px sans-serif'; ctx.fillText(p.name, 56, 205);
        ctx.fillStyle = '#C93468'; ctx.font = 'bold 30px monospace'; ctx.fillText(p.code, 58, 257);
        var imageScale = Math.min(570 / img.naturalWidth, 475 / img.naturalHeight);
        var imageWidth = img.naturalWidth * imageScale;
        var imageHeight = img.naturalHeight * imageScale;
        ctx.drawImage(img, 75 + (570 - imageWidth) / 2, 280 + (475 - imageHeight) / 2, imageWidth, imageHeight);
        function wrap(text, x, y, width, lineHeight) {
          var line = '';
          Array.from(text).forEach(function (char) {
            if (ctx.measureText(line + char).width > width && line) { ctx.fillText(line, x, y); line = char; y += lineHeight; } else { line += char; }
          });
          ctx.fillText(line, x, y); return y + lineHeight;
        }
        ctx.fillStyle = '#29262A'; ctx.font = 'bold 26px sans-serif';
        var y = wrap(p.roast, 56, 783, 607, 41);
        ctx.fillStyle = '#C93468'; ctx.font = '23px sans-serif';
        wrap('“' + p.voice + '”', 56, y + 25, 607, 36);
        ctx.fillStyle = '#797078'; ctx.font = '16px sans-serif'; ctx.fillText('QBTI / 有梗有爱，不作诊断', 56, 1000);
        var uri = canvas.toDataURL('image/png');
        window.xhs.miniTool.writeTempFile({ data: uri, success: function (result) {
          if (!result || !result.filePath) { fail(); return; }
          try { window.xhs.miniTool.saveImageToPhotosAlbum({ filePath: result.filePath, success: function () {
            button.disabled = false; button.textContent = '保存到相册'; tell('已保存到相册。');
          }, fail: fail }); } catch (error) { fail(); }
        }, fail: fail });
      } catch (error) { fail(); }
    };
    img.src = characterSource(p);
  }
  function renderStats() {
    var blocks = needs.map(function (q) {
      var labels = q.options.map(function (o) { return o.text; }).concat(['略过 / 不贴近']);
      return '<section class="stats-block"><h2>' + esc(q.text) + '</h2>' + labels.map(function (label, i) {
        var count = stats.needs[q.id][i];
        var pct = stats.count ? Math.round(count / stats.count * 100) : 0;
        return '<div class="stat-row"><div class="stat-label"><span>' + esc(label) + '</span><span>' + count + ' 次' + (stats.count ? ' · ' + pct + '%' : '') + '</span></div><div class="stat-track"><div class="stat-fill" style="width:' + pct + '%"></div></div></div>';
      }).join('') + '</section>';
    }).join('');
    paint('<div class="quiet-panel">' + top('LOCAL ONLY / 仅本机', 'stats-back', completed ? '我的结果' : '首页') + '<div class="page-heading"><p class="eyebrow">A LITTLE CHECK-IN</p><h1>只在这台设备上。</h1><p>三道小问题的本机汇总</p></div><div class="local-banner">这里没有真实用户后台，也没有预置“热闹”数据。<br>只计入首页主动勾选后完成的答卷。修改同一份答卷会更新原记录；复测可另计一份。答卷数不等于人数，不代表任何人群。</div><p><span class="stats-count">' + stats.count + '</span> <span class="muted">份本机答卷</span></p>' + (stats.count ? '' : '<p class="caption">还没有本机记录。无需加入汇总，也能照常完成测试。</p>') + blocks + '<button class="secondary" id="clear-local">清除本机进度和汇总</button><p class="caption">仅清除这个工具在当前浏览器中保存的内容。浏览器暂存不保证永久保留。' + (!storageOK ? ' 当前存储不可用，显示的记录只保留在本次打开期间。' : '') + '</p></div>', 'stats');
    bind('stats-back', function () { if (completed) { renderResult(); } else { home(); } });
    bind('clear-local', function () {
      if (!window.confirm('清除当前浏览器里的 QBTI 答题进度和汇总？')) { return; }
      try { window.localStorage.removeItem(KEY); window.localStorage.removeItem(STAT_KEY); } catch (error) { storageOK = false; }
      answers = {}; cursor = 0; completed = false; contribution = null; consent = false; resetStats();
      renderStats(); tell('本机进度和汇总已清除。');
    });
  }
  document.getElementById('brand-home').addEventListener('click', function () { save(); home(); });
  document.getElementById('nav-atlas').addEventListener('click', function () {
    if (view === 'atlas') { return; }
    if (view !== 'atlas-detail') { atlasReturn = view === 'quiz' ? 'quiz' : completed ? 'result' : 'home'; }
    renderAtlas();
  });
  home();
}());
