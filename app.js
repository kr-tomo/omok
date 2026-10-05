(function () {
  'use strict';

  var Rules = window.OmokRules;
  var N = Rules.N, BLACK = Rules.BLACK, WHITE = Rules.WHITE;
  var STORE_KEY = 'omok.v1';

  var PRESETS = {
    free:  { allow33: true,  allow44: true,  overline: 'win',    restrict: 'black' },
    no33:  { allow33: false, allow44: true,  overline: 'win',    restrict: 'black' },
    renju: { allow33: false, allow44: false, overline: 'forbid', restrict: 'black' }
  };

  /* ── 상태 ─────────────────────────────────────────── */
  var state = {
    moves: [],          // [[x, y], ...]  (짝수 번째 = 흑)
    winner: 0,
    winCells: null,
    draw: false,
    rules: Object.assign({}, Rules.DEFAULT_RULES),
    ui: { showForbidden: false, showNumbers: false, mode: 'pvp' }
  };
  var board = new Uint8Array(N * N);
  var hover = null;     // {x, y, ok}
  var flash = null;     // {x, y}
  var hints = [];       // 금수 표시용
  var flashTimer = 0;

  function turnColor() { return state.moves.length % 2 === 0 ? BLACK : WHITE; }
  function colorName(c) { return c === BLACK ? '흑' : '백'; }
  var cpuTimer = 0;
  function isCpuMode() { return state.ui.mode !== 'pvp'; }
  function humanColor() { return state.ui.mode === 'cpuW' ? WHITE : BLACK; }
  function isCpuTurn() { return isCpuMode() && !isOver() && turnColor() !== humanColor(); }
  function isOver() { return !!state.winner || state.draw; }

  /* ── 저장 / 복원 ──────────────────────────────────── */
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* 저장 불가 환경 */ }
  }
  function load() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      var s = JSON.parse(raw);
      if (s.rules) {
        var r = s.rules;
        if (typeof r.allow33 === 'boolean') state.rules.allow33 = r.allow33;
        if (typeof r.allow44 === 'boolean') state.rules.allow44 = r.allow44;
        if (['win', 'none', 'forbid'].indexOf(r.overline) >= 0) state.rules.overline = r.overline;
        if (['black', 'both'].indexOf(r.restrict) >= 0) state.rules.restrict = r.restrict;
      }
      if (s.ui) {
        state.ui.showForbidden = !!s.ui.showForbidden;
        state.ui.showNumbers = !!s.ui.showNumbers;
        if (['pvp', 'cpuB', 'cpuW'].indexOf(s.ui.mode) >= 0) state.ui.mode = s.ui.mode;
      }
      if (Array.isArray(s.moves)) {
        var seen = {};
        var ok = s.moves.every(function (m) {
          if (!Array.isArray(m) || m[0] < 0 || m[1] < 0 || m[0] >= N || m[1] >= N) return false;
          var k = m[1] * N + m[0];
          if (seen[k]) return false;
          seen[k] = 1;
          return true;
        });
        if (ok) {
          state.moves = s.moves.map(function (m) { return [m[0] | 0, m[1] | 0]; });
          state.winner = s.winner === BLACK || s.winner === WHITE ? s.winner : 0;
          state.winCells = state.winner && Array.isArray(s.winCells) ? s.winCells : null;
          state.draw = !!s.draw && !state.winner;
        }
      }
    } catch (e) { /* 손상된 저장값은 무시 */ }
    rebuildBoard();
  }
  function rebuildBoard() {
    board.fill(0);
    state.moves.forEach(function (m, i) { board[m[1] * N + m[0]] = i % 2 === 0 ? BLACK : WHITE; });
  }

  /* ── 스프라이트 ───────────────────────────────────── */
  var cfg = window.OMOK_SPRITES || {};
  var boardCfg = cfg.board || {};
  var grid = Object.assign({ left: 0.052, top: 0.052, right: 0.948, bottom: 0.948 }, boardCfg.grid || {});
  var stoneCfg = cfg.stones || {};
  var boardImg = null, stoneImg = null;

  function loadImage(src) {
    return new Promise(function (resolve) {
      if (!src) return resolve(null);
      var img = new Image();
      var done = false;
      function fin(v) { if (!done) { done = true; resolve(v); } }
      img.onload = function () { fin(img); };
      img.onerror = function () { fin(null); };
      setTimeout(function () { fin(null); }, 4000);
      img.src = src;
    });
  }

  function pickFrame(color, x, y) {
    var f = stoneCfg.frames && stoneCfg.frames[color === BLACK ? 'black' : 'white'];
    if (!f) return null;
    if (Array.isArray(f)) return f.length ? f[(x * 7 + y * 13) % f.length] : null;
    return f;
  }

  /* ── 캔버스 ───────────────────────────────────────── */
  var canvas = document.getElementById('board');
  var ctx = canvas.getContext('2d');
  var S = 0, dpr = 1;
  var gx0 = 0, gy0 = 0, cellX = 0, cellY = 0, cell = 0;

  function resize() {
    var rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    var px = Math.max(1, Math.round(rect.width * dpr));
    if (canvas.width !== px || canvas.height !== px) { canvas.width = px; canvas.height = px; }
    S = px;
    gx0 = grid.left * S; gy0 = grid.top * S;
    cellX = (grid.right - grid.left) * S / (N - 1);
    cellY = (grid.bottom - grid.top) * S / (N - 1);
    cell = (cellX + cellY) / 2;
    draw();
  }

  function px(i) { return gx0 + i * cellX; }
  function py(j) { return gy0 + j * cellY; }

  function drawBoardFallback() {
    var g = ctx.createLinearGradient(0, 0, S, S);
    g.addColorStop(0, '#e8b86a'); g.addColorStop(1, '#cf9843');
    ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
    ctx.strokeStyle = '#3b2a14'; ctx.lineWidth = Math.max(1, cell * 0.035);
    ctx.beginPath();
    for (var i = 0; i < N; i++) {
      ctx.moveTo(px(0), py(i)); ctx.lineTo(px(N - 1), py(i));
      ctx.moveTo(px(i), py(0)); ctx.lineTo(px(i), py(N - 1));
    }
    ctx.stroke();
    ctx.fillStyle = '#2e2110';
    [[3, 3], [3, 11], [11, 3], [11, 11], [7, 7]].forEach(function (p) {
      ctx.beginPath(); ctx.arc(px(p[0]), py(p[1]), cell * 0.1, 0, Math.PI * 2); ctx.fill();
    });
  }

  function drawStone(color, i, j, alpha) {
    var cx = px(i), cy = py(j);
    ctx.save();
    if (alpha != null) ctx.globalAlpha = alpha;
    var f = stoneImg && pickFrame(color, i, j);
    if (f) {
      var size = cell * (stoneCfg.scale || 1.1);
      ctx.drawImage(stoneImg, f.x, f.y, f.w, f.h, cx - size / 2, cy - size / 2, size, size);
    } else {
      var r = cell * 0.46;
      ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = cell * 0.12; ctx.shadowOffsetY = cell * 0.04;
      var g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
      if (color === BLACK) { g.addColorStop(0, '#707078'); g.addColorStop(0.4, '#26262a'); g.addColorStop(1, '#050506'); }
      else { g.addColorStop(0, '#ffffff'); g.addColorStop(0.55, '#ececea'); g.addColorStop(1, '#b9b8b2'); }
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  function drawCross(i, j, scale, alpha) {
    var cx = px(i), cy = py(j), h = cell * 0.2 * scale;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = '#d6341f';
    ctx.lineWidth = Math.max(2, cell * 0.09);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - h, cy - h); ctx.lineTo(cx + h, cy + h);
    ctx.moveTo(cx + h, cy - h); ctx.lineTo(cx - h, cy + h);
    ctx.stroke();
    ctx.restore();
  }

  function draw() {
    if (!S) return;
    ctx.clearRect(0, 0, S, S);
    if (boardImg) ctx.drawImage(boardImg, 0, 0, S, S); else drawBoardFallback();

    if (state.ui.showForbidden && !isOver()) {
      hints.forEach(function (h) { drawCross(h.x, h.y, 1, 0.8); });
    }

    var last = state.moves.length - 1;
    state.moves.forEach(function (m, idx) {
      var color = idx % 2 === 0 ? BLACK : WHITE;
      drawStone(color, m[0], m[1]);
      if (state.ui.showNumbers) {
        ctx.fillStyle = idx === last ? '#ff5a43' : (color === BLACK ? '#f2f2f2' : '#1b1b1b');
        ctx.font = '700 ' + Math.round(cell * (idx >= 99 ? 0.3 : 0.4)) + 'px system-ui, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(idx + 1), px(m[0]), py(m[1]) + cell * 0.02);
      }
    });

    if (last >= 0 && !state.ui.showNumbers) {
      var lm = state.moves[last];
      ctx.fillStyle = '#ff5a43';
      ctx.beginPath(); ctx.arc(px(lm[0]), py(lm[1]), cell * 0.1, 0, Math.PI * 2); ctx.fill();
    }

    if (state.winCells) {
      ctx.save();
      ctx.strokeStyle = '#ffcf3d';
      ctx.lineWidth = Math.max(2, cell * 0.08);
      state.winCells.forEach(function (c) {
        ctx.beginPath(); ctx.arc(px(c[0]), py(c[1]), cell * 0.5, 0, Math.PI * 2); ctx.stroke();
      });
      ctx.restore();
    }

    if (hover && !isOver()) {
      if (hover.ok) drawStone(turnColor(), hover.x, hover.y, 0.5);
      else drawCross(hover.x, hover.y, 1.1, 0.9);
    }
    if (flash) drawCross(flash.x, flash.y, 1.6, 1);
  }

  /* ── 입력 ─────────────────────────────────────────── */
  function cellFromEvent(e) {
    var rect = canvas.getBoundingClientRect();
    var u = (e.clientX - rect.left) / rect.width;
    var v = (e.clientY - rect.top) / rect.height;
    var i = Math.round((u - grid.left) / (grid.right - grid.left) * (N - 1));
    var j = Math.round((v - grid.top) / (grid.bottom - grid.top) * (N - 1));
    if (i < 0 || j < 0 || i >= N || j >= N) return null;
    return { x: i, y: j };
  }

  canvas.addEventListener('pointermove', function (e) {
    if (e.pointerType !== 'mouse') return;
    var c = cellFromEvent(e);
    var next = null;
    if (c && !isOver() && !isCpuTurn() && board[c.y * N + c.x] === 0) {
      next = { x: c.x, y: c.y, ok: Rules.tryMove(board, c.x, c.y, turnColor(), state.rules).ok };
    }
    var same = (!hover && !next) || (hover && next && hover.x === next.x && hover.y === next.y && hover.ok === next.ok);
    if (!same) { hover = next; draw(); }
  });
  canvas.addEventListener('pointerleave', function () { if (hover) { hover = null; draw(); } });
  canvas.addEventListener('pointerup', function (e) {
    if (e.button > 0) return;
    var c = cellFromEvent(e);
    if (c) play(c.x, c.y);
  });
  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  /* ── 게임 진행 ────────────────────────────────────── */
  var REASON = {
    '33': '삼삼(3-3)', '44': '사사(4-4)', 'overline': '장목(6목 이상)'
  };

  function play(x, y, fromCpu) {
    if (isOver() || (!fromCpu && isCpuTurn())) return;
    var color = turnColor();
    var r = Rules.tryMove(board, x, y, color, state.rules);
    if (!r.ok) {
      if (r.reason === 'occupied') return;
      showFlash(x, y);
      say(colorName(color) + '은(는) ' + REASON[r.reason] + ' 금수 자리에 둘 수 없어요.', 'warn');
      return;
    }
    board[y * N + x] = color;
    state.moves.push([x, y]);
    hover = null;
    if (r.win) {
      state.winner = color; state.winCells = r.cells;
    } else if (state.moves.length >= N * N) {
      state.draw = true;
    }
    after();
  }

  function undo() {
    if (!state.moves.length) return;
    clearTimeout(cpuTimer);
    var m = state.moves.pop();
    board[m[1] * N + m[0]] = 0;
    // 컴퓨터 대전: 내 차례가 될 때까지 컴퓨터의 수까지 함께 무른다
    while (isCpuMode() && state.moves.length && turnColor() !== humanColor()) {
      m = state.moves.pop();
      board[m[1] * N + m[0]] = 0;
    }
    state.winner = 0; state.winCells = null; state.draw = false;
    hover = null;
    after();
  }

  function restart() {
    clearTimeout(cpuTimer);
    state.moves = []; state.winner = 0; state.winCells = null; state.draw = false;
    board.fill(0); hover = null;
    after();
  }

  function after() {
    refreshHints();
    save();
    updateUI();
    draw();
    maybeCpu();
  }

  function maybeCpu() {
    clearTimeout(cpuTimer);
    if (!isCpuTurn() || !window.OmokAI) return;
    cpuTimer = setTimeout(function () {
      if (!isCpuTurn()) return;
      var mv = window.OmokAI.chooseMove(board, turnColor(), state.rules, state.moves.length);
      if (mv) play(mv[0], mv[1], true);
      else { say('컴퓨터가 둘 곳이 없어요.', ''); }
    }, 450);
  }

  function showFlash(x, y) {
    flash = { x: x, y: y };
    draw();
    clearTimeout(flashTimer);
    flashTimer = setTimeout(function () { flash = null; draw(); }, 650);
  }

  function refreshHints() {
    hints = state.ui.showForbidden && !isOver() && !isCpuTurn() ? Rules.forbiddenPoints(board, turnColor(), state.rules) : [];
  }

  /* ── 패널 UI ──────────────────────────────────────── */
  var el = {
    turnIcon: document.getElementById('turnIcon'),
    turnText: document.getElementById('turnText'),
    count: document.getElementById('count'),
    msg: document.getElementById('msg'),
    undo: document.getElementById('undo'),
    restart: document.getElementById('restart'),
    chips: document.getElementById('chips'),
    dialog: document.getElementById('rulesDialog')
  };

  function say(text, cls) {
    el.msg.textContent = text || '';
    el.msg.className = cls || '';
  }

  function updateUI() {
    var c = turnColor();
    el.count.textContent = state.moves.length + '수';
    el.undo.disabled = state.moves.length === 0;
    if (state.winner) {
      el.turnIcon.className = 'stone-icon ' + (state.winner === BLACK ? 'black' : 'white');
      el.turnText.textContent = colorName(state.winner) + ' 승리!';
      say('오목 완성! 새 게임으로 다시 시작해 보세요.', 'win');
    } else if (state.draw) {
      el.turnText.textContent = '무승부';
      say('판이 가득 찼어요.', '');
    } else {
      el.turnIcon.className = 'stone-icon ' + (c === BLACK ? 'black' : 'white');
      el.turnText.textContent = isCpuTurn() ? '컴퓨터 생각 중…' : (isCpuMode() ? '내 차례 (' + colorName(c) + ')' : colorName(c) + ' 차례');
      if (el.msg.className !== 'warn') say('');
    }
    renderChips();
  }

  function renderChips() {
    var r = state.rules;
    var items = [
      [r.allow33 ? '삼삼 허용' : '삼삼 금지', !r.allow33],
      [r.allow44 ? '사사 허용' : '사사 금지', !r.allow44],
      ['장목 ' + { win: '승리', none: '무효', forbid: '금수' }[r.overline], r.overline === 'forbid']
    ];
    if (isCpuMode()) items.unshift(['컴퓨터 ' + (humanColor() === BLACK ? '(백)' : '(흑)'), true]);
    if (!r.allow33 || !r.allow44 || r.overline === 'forbid') {
      items.push(['금수: ' + (r.restrict === 'both' ? '흑·백' : '흑만'), true]);
    }
    el.chips.innerHTML = '';
    items.forEach(function (it) {
      var li = document.createElement('li');
      li.textContent = it[0];
      if (it[1]) li.className = 'on';
      el.chips.appendChild(li);
    });
  }

  el.undo.addEventListener('click', function () { say(''); undo(); });
  document.getElementById('openRules').addEventListener('click', function () {
    syncDialog();
    if (typeof el.dialog.showModal === 'function') el.dialog.showModal();
    else el.dialog.setAttribute('open', '');
  });

  var restartTimer = 0;
  el.restart.addEventListener('click', function () {
    if (state.moves.length && !isOver() && !el.restart.classList.contains('confirm')) {
      el.restart.classList.add('confirm');
      el.restart.textContent = '한 번 더 눌러 시작';
      restartTimer = setTimeout(resetRestartBtn, 2500);
      return;
    }
    resetRestartBtn();
    say('');
    restart();
  });
  function resetRestartBtn() {
    clearTimeout(restartTimer);
    el.restart.classList.remove('confirm');
    el.restart.textContent = '새 게임';
  }

  /* ── 규칙 대화상자 ────────────────────────────────── */
  var cb33 = document.getElementById('allow33');
  var cb44 = document.getElementById('allow44');
  var cbHint = document.getElementById('showForbidden');
  var cbNum = document.getElementById('showNumbers');
  var segOver = document.getElementById('overline');
  var segMode = document.getElementById('mode');
  var segRestrict = document.getElementById('restrict');

  function syncSeg(seg, value) {
    Array.prototype.forEach.call(seg.querySelectorAll('button'), function (b) {
      b.setAttribute('aria-checked', String(b.dataset.v === value));
    });
  }
  function syncDialog() {
    cb33.checked = state.rules.allow33;
    cb44.checked = state.rules.allow44;
    cbHint.checked = state.ui.showForbidden;
    cbNum.checked = state.ui.showNumbers;
    syncSeg(segMode, state.ui.mode);
    syncSeg(segOver, state.rules.overline);
    syncSeg(segRestrict, state.rules.restrict);
  }
  // 규칙 변경은 이후 착수에만 영향 — 이미 놓인 돌/승패는 건드리지 않는다.
  function rulesChanged() {
    refreshHints(); save(); renderChips(); syncDialog(); draw();
  }
  cb33.addEventListener('change', function () { state.rules.allow33 = cb33.checked; rulesChanged(); });
  cb44.addEventListener('change', function () { state.rules.allow44 = cb44.checked; rulesChanged(); });
  cbHint.addEventListener('change', function () { state.ui.showForbidden = cbHint.checked; rulesChanged(); });
  cbNum.addEventListener('change', function () { state.ui.showNumbers = cbNum.checked; rulesChanged(); });
  [[segOver, 'overline'], [segRestrict, 'restrict']].forEach(function (p) {
    p[0].addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      state.rules[p[1]] = b.dataset.v;
      rulesChanged();
    });
  });
  segMode.addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b || state.ui.mode === b.dataset.v) return;
    state.ui.mode = b.dataset.v;
    hover = null;
    say('');
    syncDialog(); after();
  });
  Array.prototype.forEach.call(document.querySelectorAll('[data-preset]'), function (b) {
    b.addEventListener('click', function () {
      Object.assign(state.rules, PRESETS[b.dataset.preset]);
      rulesChanged();
    });
  });
  el.dialog.addEventListener('click', function (e) { if (e.target === el.dialog) el.dialog.close(); });

  /* ── 시작 ─────────────────────────────────────────── */
  load();
  refreshHints();
  updateUI();
  maybeCpu();

  Promise.all([loadImage(boardCfg.src), loadImage(stoneCfg.src)]).then(function (imgs) {
    boardImg = imgs[0]; stoneImg = imgs[1];
    resize();
  });
  new ResizeObserver(resize).observe(document.getElementById('stage'));
  window.addEventListener('resize', resize);

  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () { /* 오프라인 캐시 없이 계속 */ });
    });
  }
})();
