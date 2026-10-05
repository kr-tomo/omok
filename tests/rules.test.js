const assert = require('assert');
const R = require('../rules.js');
const N = 15, B = 1, W = 2;

function board(black = [], white = []) {
  const b = new Uint8Array(N * N);
  black.forEach(([x, y]) => (b[y * N + x] = B));
  white.forEach(([x, y]) => (b[y * N + x] = W));
  return b;
}
const rules = (o = {}) => Object.assign({}, R.DEFAULT_RULES, o);
let n = 0;
function t(name, fn) { fn(); n++; console.log('ok -', name); }

t('가로 5목 승리', () => {
  const b = board([[3, 7], [4, 7], [5, 7], [6, 7]]);
  const r = R.tryMove(b, 7, 7, B, rules());
  assert(r.ok && r.win && r.cells.length === 5);
});

t('자유룰: 삼삼 허용', () => {
  const b = board([[6, 7], [8, 7], [7, 6], [7, 8]]);
  assert(R.tryMove(b, 7, 7, B, rules()).ok);
});

t('삼삼 금지: 열린 삼 두 개는 금수', () => {
  const b = board([[6, 7], [8, 7], [7, 6], [7, 8]]);
  const r = R.tryMove(b, 7, 7, B, rules({ allow33: false }));
  assert(!r.ok && r.reason === '33');
});

t('삼삼 금지: 한쪽이 막힌 삼은 삼삼이 아님', () => {
  const b = board([[6, 7], [8, 7], [7, 6], [7, 8]], [[5, 7], [9, 7]]);
  assert(R.tryMove(b, 7, 7, B, rules({ allow33: false })).ok);
});

t('삼삼 금지: 백은 흑만 적용일 때 자유', () => {
  const b = board([], [[6, 7], [8, 7], [7, 6], [7, 8]]);
  assert(R.tryMove(b, 7, 7, W, rules({ allow33: false })).ok);
  assert(!R.tryMove(b, 7, 7, W, rules({ allow33: false, restrict: 'both' })).ok);
});

t('사사 금지', () => {
  const b = board([[4, 7], [5, 7], [6, 7], [7, 4], [7, 5], [7, 6]]);
  const r = R.tryMove(b, 7, 7, B, rules({ allow44: false }));
  assert(!r.ok && r.reason === '44');
  assert(R.tryMove(b, 7, 7, B, rules()).ok);
});

t('사삼은 금수가 아님', () => {
  const b = board([[4, 7], [5, 7], [6, 7], [7, 5], [7, 6]]);
  assert(R.tryMove(b, 7, 7, B, rules({ allow33: false, allow44: false })).ok);
});

t('한 줄 사사 (X.XXX.X 형)', () => {
  const b = board([[3, 7], [5, 7], [7, 7], [9, 7]]);
  const r = R.tryMove(b, 6, 7, B, rules({ allow44: false }));
  assert(!r.ok && r.reason === '44');
  assert(R.tryMove(b, 6, 7, B, rules()).ok);
});

t('열린 사(.XXXX.) 하나는 사사가 아님', () => {
  const b = board([[4, 7], [5, 7], [6, 7]]);
  assert(R.tryMove(b, 7, 7, B, rules({ allow44: false })).ok);
});

t('장목: win 모드 승리 / none 모드 승리 아님 / forbid 모드 금수', () => {
  const b = board([[2, 7], [3, 7], [4, 7], [6, 7], [7, 7]]);
  const w = R.tryMove(b, 5, 7, B, rules({ overline: 'win' }));
  assert(w.ok && w.win);
  const nn = R.tryMove(b, 5, 7, B, rules({ overline: 'none' }));
  assert(nn.ok && !nn.win);
  const f = R.tryMove(b, 5, 7, B, rules({ overline: 'forbid' }));
  assert(!f.ok && f.reason === 'overline');
  // forbid 모드에서 백은 장목으로 승리
  const wb = board([], [[2, 7], [3, 7], [4, 7], [6, 7], [7, 7]]);
  const wr = R.tryMove(wb, 5, 7, W, rules({ overline: 'forbid' }));
  assert(wr.ok && wr.win);
});

t('정확히 5목은 금수보다 우선(승리)', () => {
  const b = board([[3, 7], [4, 7], [5, 7], [6, 7], [7, 5], [7, 6], [8, 6], [9, 5]]);
  const r = R.tryMove(b, 7, 7, B, rules({ allow33: false, allow44: false, overline: 'forbid' }));
  assert(r.ok && r.win);
});

t('점유된 칸', () => {
  const b = board([[7, 7]]);
  assert(R.tryMove(b, 7, 7, W, rules()).reason === 'occupied');
});

t('금수 목록', () => {
  const b = board([[6, 7], [8, 7], [7, 6], [7, 8]]);
  const pts = R.forbiddenPoints(b, B, rules({ allow33: false }));
  assert(pts.some(p => p.x === 7 && p.y === 7 && p.reason === '33'));
  assert.strictEqual(R.forbiddenPoints(b, W, rules({ allow33: false })).length, 0);
});

t('대각선 5목', () => {
  const b = board([[2, 2], [3, 3], [4, 4], [5, 5]]);
  const r = R.tryMove(b, 6, 6, B, rules());
  assert(r.ok && r.win);
  const b2 = board([[10, 2], [9, 3], [8, 4], [7, 5]]);
  assert(R.tryMove(b2, 6, 6, B, rules()).win);
});

console.log(`\n${n} tests passed`);
