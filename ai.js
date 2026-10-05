/*
 * 간단한 컴퓨터 상대 — 패턴 점수 기반 (공격 + 방어).
 * 현재 규칙(rules)에서 금수인 자리는 두지 않는다.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./rules.js'));
  else root.OmokAI = factory(root.OmokRules);
})(typeof self !== 'undefined' ? self : this, function (R) {
  'use strict';
  const { N, EMPTY } = R;
  const DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];
  const inBounds = (x, y) => x >= 0 && y >= 0 && x < N && y < N;
  const cellAt = (b, x, y) => (inBounds(x, y) ? b[y * N + x] : -1); // 판 밖은 -1 (상대 돌 취급)
  const opponent = (c) => (c === R.BLACK ? R.WHITE : R.BLACK);
  const legal = (b, x, y, c, rules) => R.tryMove(b, x, y, c, rules).ok;

  // [패턴, 점수, 종류]  x=내 돌, .=빈칸, o=상대 돌/판 밖. 중심(방금 둘 자리)을 포함한 패턴만 센다.
  const PATTERNS = [
    ['xxxxx', 100000, 'five'],
    ['.xxxx.', 10000, 'four'],
    ['xxxx.', 1500, 'four'], ['.xxxx', 1500, 'four'],
    ['x.xxx', 1500, 'four'], ['xxx.x', 1500, 'four'], ['xx.xx', 1500, 'four'],
    ['..xxx.', 1200, 'three'], ['.xxx..', 1200, 'three'],
    ['.x.xx.', 1000, 'three'], ['.xx.x.', 1000, 'three'],
    ['.xxx.', 600, 'three'],
    ['xxx.', 150, ''], ['.xxx', 150, ''], ['xx.x', 150, ''], ['x.xx', 150, ''],
    ['..xx..', 120, ''], ['.xx.', 60, ''], ['.x.x.', 60, ''],
    ['xx.', 10, ''], ['.xx', 10, ''], ['x.x', 10, ''],
  ];

  function lineString(b, x, y, dx, dy, me) {
    let s = '';
    for (let o = -4; o <= 4; o++) {
      if (o === 0) { s += 'x'; continue; }
      const v = cellAt(b, x + o * dx, y + o * dy);
      s += v === me ? 'x' : v === EMPTY ? '.' : 'o';
    }
    return s;
  }

  function bestPattern(s) {
    let best = [1, '']; // 외톨이 돌
    for (const [p, score, kind] of PATTERNS) {
      if (score <= best[0]) continue;
      for (let st = 0; st + p.length <= s.length; st++) {
        if (st <= 4 && 4 < st + p.length && s.startsWith(p, st)) { best = [score, kind]; break; }
      }
    }
    return best;
  }

  function scoreCell(b, x, y, me) {
    let sum = 0, fours = 0, threes = 0;
    for (const [dx, dy] of DIRS) {
      const [sc, kind] = bestPattern(lineString(b, x, y, dx, dy, me));
      sum += sc;
      if (kind === 'four') fours++;
      else if (kind === 'three') threes++;
    }
    if (fours >= 2) sum += 6000;
    else if (fours >= 1 && threes >= 1) sum += 4000;
    else if (threes >= 2) sum += 2500;
    return sum;
  }

  function candidates(b) {
    const set = new Set();
    let any = false;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      if (b[y * N + x] === EMPTY) continue;
      any = true;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const nx = x + dx, ny = y + dy;
        if (inBounds(nx, ny) && b[ny * N + nx] === EMPTY) set.add(ny * N + nx);
      }
    }
    return any ? [...set] : [];
  }

  function chooseMove(board, me, rules, moveCount) {
    const mid = (N - 1) / 2;
    const cands = candidates(board);
    if (!cands.length) {
      if (board[mid * N + mid] === EMPTY) return [mid, mid];
      cands.push((mid + 1) * N + mid + 1);
    }
    if (moveCount === 1 && cands.length) {
      // 두 번째 수: 첫 수 근처 가까운 자리를 무작위로
      const near = cands.filter((i) => Math.max(Math.abs((i % N) - mid), Math.abs(((i / N) | 0) - mid)) === 1);
      if (near.length) { const i = near[(Math.random() * near.length) | 0]; return [i % N, (i / N) | 0]; }
    }
    const foe = opponent(me);
    const scored = cands.map((i) => {
      const x = i % N, y = (i / N) | 0;
      const atk = scoreCell(board, x, y, me);
      let def = scoreCell(board, x, y, foe);
      if (def >= 1000 && R.isRestricted(rules, foe) && !legal(board, x, y, foe, rules)) def = 0;
      const centre = (mid - Math.max(Math.abs(x - mid), Math.abs(y - mid))) * 0.3;
      return { x, y, s: atk + def * 0.92 + centre + Math.random() * 2 };
    }).sort((a, b) => b.s - a.s);

    for (const c of scored) {
      if (legal(board, c.x, c.y, me, rules)) return [c.x, c.y];
    }
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      if (board[y * N + x] === EMPTY && legal(board, x, y, me, rules)) return [x, y];
    }
    return null;
  }

  return { chooseMove, scoreCell };
});
