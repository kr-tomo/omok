/*
 * 오목 규칙 엔진 (DOM 의존성 없음)
 *
 * 규칙 옵션 (rules)
 *   allow33  : true  → 삼삼(3-3) 허용
 *   allow44  : true  → 사사(4-4) 허용
 *   overline : 'win'    → 6목 이상도 승리
 *              'none'   → 정확히 5목만 승리 (6목 이상은 승리가 아님)
 *              'forbid' → 금수 대상 색의 6목 이상은 금수 (대상이 아닌 색은 6목 이상도 승리)
 *   restrict : 'black' | 'both' → 삼삼/사사/장목 금수를 적용할 대상
 *
 * 규칙은 "착수하는 순간"에만 평가한다. 이미 놓인 돌은 다시 판정하지 않으므로
 * 게임 도중에 옵션을 바꿔도 앞으로 두는 수에만 영향을 준다.
 */
(function (root) {
  'use strict';

  var N = 15;            // 판 크기
  var R = 6;             // 한 방향 탐색 반경
  var W = 2 * R + 1;     // 탐색 창 크기
  var DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];
  var EMPTY = 0, BLACK = 1, WHITE = 2;

  var DEFAULT_RULES = { allow33: true, allow44: true, overline: 'win', restrict: 'black' };

  function isRestricted(rules, color) {
    return color === BLACK || rules.restrict === 'both';
  }

  // 길이 len 의 연속된 돌이 "승리 5목"으로 인정되는가
  function winRun(rules, color, len) {
    if (len < 5) return false;
    if (len === 5) return true;
    if (rules.overline === 'win') return true;
    if (rules.overline === 'forbid' && !isRestricted(rules, color)) return true;
    return false;
  }

  // (x,y)를 지나는 한 방향 직선을 창으로 잘라낸다. 0 빈칸, 1 내 돌, 2 상대 돌/벽
  function getLine(b, x, y, dx, dy, color) {
    var s = new Array(W);
    for (var i = -R; i <= R; i++) {
      var cx = x + dx * i, cy = y + dy * i;
      if (cx < 0 || cy < 0 || cx >= N || cy >= N) s[i + R] = 2;
      else {
        var v = b[cy * N + cx];
        s[i + R] = v === EMPTY ? 0 : (v === color ? 1 : 2);
      }
    }
    return s;
  }

  function extent(s, i) {
    var a = i, e = i;
    while (a > 0 && s[a - 1] === 1) a--;
    while (e < W - 1 && s[e + 1] === 1) e++;
    return [a, e];
  }

  // 빈칸 p 에 돌을 놓았을 때 만들어지는 연속 길이
  function lenIfPlaced(s, p) {
    s[p] = 1;
    var r = extent(s, p);
    s[p] = 0;
    return r[1] - r[0] + 1;
  }

  // 이 방향의 "사(四)" 개수. 새 돌이 포함된 5목 완성 지점을 센다.
  function countFours(s, rules, color) {
    var pts = [];
    for (var p = 0; p < W; p++) {
      if (s[p] !== 0) continue;
      s[p] = 1;
      var r = extent(s, p);
      s[p] = 0;
      if (r[0] <= R && R <= r[1] && winRun(rules, color, r[1] - r[0] + 1)) pts.push(p);
    }
    var n = pts.length;
    // 열린 사(.XXXX.) 는 완성 지점이 양 끝 두 곳이지만 사 하나로 센다
    for (var i = 0; i < pts.length; i++) {
      for (var j = i + 1; j < pts.length; j++) {
        if (pts[j] - pts[i] === 5) {
          var all = true;
          for (var k = pts[i] + 1; k < pts[j]; k++) if (s[k] !== 1) { all = false; break; }
          if (all) n--;
        }
      }
    }
    return n;
  }

  // 이 방향에 "열린 삼(三)"이 있는가: 한 수로 열린 사를 만들 수 있고,
  // 그 수 자체가 금수가 아니어야 한다 (재귀 판정)
  function hasOpenThree(b, x, y, dx, dy, color, rules, depth, s) {
    for (var p = 1; p < W - 1; p++) {
      if (s[p] !== 0) continue;
      s[p] = 1;
      var r = extent(s, p), a = r[0], e = r[1];
      var ok = false;
      if (e - a + 1 === 4 && a <= R && R <= e && a - 1 >= 0 && e + 1 <= W - 1 &&
          s[a - 1] === 0 && s[e + 1] === 0 &&
          winRun(rules, color, lenIfPlaced(s, a - 1)) &&
          winRun(rules, color, lenIfPlaced(s, e + 1))) {
        ok = true;
      }
      s[p] = 0;
      if (!ok) continue;
      if (depth < 3) {
        var px = x + dx * (p - R), py = y + dy * (p - R);
        b[py * N + px] = color;
        var res = evaluate(b, px, py, color, rules, depth + 1);
        b[py * N + px] = EMPTY;
        if (res.type === 'forbidden') continue;
      }
      return true;
    }
    return false;
  }

  // (x,y)에 color 돌이 이미 놓여 있다고 가정하고 결과를 판정한다.
  function evaluate(b, x, y, color, rules, depth) {
    depth = depth || 0;
    var lines = DIRS.map(function (d) { return getLine(b, x, y, d[0], d[1], color); });
    var cells = [];
    var win = false;
    var maxRun = 0;
    for (var d = 0; d < 4; d++) {
      var r = extent(lines[d], R), len = r[1] - r[0] + 1;
      if (len > maxRun) maxRun = len;
      if (winRun(rules, color, len)) {
        win = true;
        for (var i = r[0]; i <= r[1]; i++) cells.push([x + DIRS[d][0] * (i - R), y + DIRS[d][1] * (i - R)]);
      }
    }
    if (win) return { type: 'win', cells: cells };
    if (!isRestricted(rules, color)) return { type: 'ok' };

    if (rules.overline === 'forbid' && maxRun >= 6) return { type: 'forbidden', reason: 'overline' };

    if (!rules.allow44) {
      var fours = 0;
      for (var f = 0; f < 4; f++) fours += countFours(lines[f], rules, color);
      if (fours >= 2) return { type: 'forbidden', reason: '44' };
    }
    if (!rules.allow33) {
      var threes = 0;
      for (var t = 0; t < 4; t++) {
        if (hasOpenThree(b, x, y, DIRS[t][0], DIRS[t][1], color, rules, depth, lines[t])) threes++;
      }
      if (threes >= 2) return { type: 'forbidden', reason: '33' };
    }
    return { type: 'ok' };
  }

  // 판을 바꾸지 않고 착수 가능 여부를 검사한다.
  function tryMove(b, x, y, color, rules) {
    if (x < 0 || y < 0 || x >= N || y >= N || b[y * N + x] !== EMPTY) return { ok: false, reason: 'occupied' };
    b[y * N + x] = color;
    var res = evaluate(b, x, y, color, rules, 0);
    b[y * N + x] = EMPTY;
    if (res.type === 'forbidden') return { ok: false, reason: res.reason };
    return { ok: true, win: res.type === 'win', cells: res.cells || null };
  }

  // 금수 표시용: color 가 지금 둘 수 없는 빈칸 목록
  function forbiddenPoints(b, color, rules) {
    var out = [];
    if (!isRestricted(rules, color)) return out;
    if (rules.allow33 && rules.allow44 && rules.overline !== 'forbid') return out;
    for (var y = 0; y < N; y++) {
      for (var x = 0; x < N; x++) {
        if (b[y * N + x] !== EMPTY) continue;
        var r = tryMove(b, x, y, color, rules);
        if (!r.ok) out.push({ x: x, y: y, reason: r.reason });
      }
    }
    return out;
  }

  var api = {
    N: N, EMPTY: EMPTY, BLACK: BLACK, WHITE: WHITE,
    DEFAULT_RULES: DEFAULT_RULES,
    tryMove: tryMove, forbiddenPoints: forbiddenPoints, isRestricted: isRestricted
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OmokRules = api;
})(typeof self !== 'undefined' ? self : this);
