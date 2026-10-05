const assert = require('assert');
const R = require('../rules.js'), AI = require('../ai.js');
const N = 15, rules = Object.assign({}, R.DEFAULT_RULES);
const mk = (bl, wh = []) => { const b = new Uint8Array(N*N); bl.forEach(([x,y]) => b[y*N+x]=1); wh.forEach(([x,y]) => b[y*N+x]=2); return b; };
// 1) 이길 수 있으면 이긴다
let mv = AI.chooseMove(mk([[3,3],[4,3],[5,3],[6,3]], [[3,5],[4,5],[5,5]]), 1, rules, 7);
assert(mv[1]===3 && (mv[0]===2||mv[0]===7), 'win '+mv);
// 2) 상대 4를 막는다
mv = AI.chooseMove(mk([[0,0],[14,0]], [[3,3],[4,3],[5,3],[6,3]]), 1, rules, 6);
assert(mv[1]===3 && (mv[0]===2||mv[0]===7), 'block '+mv);
// 3) 금수 자리는 두지 않는다 (삼삼 금지, 흑 AI)
const r2 = Object.assign({}, rules, {allow33:false});
const b = mk([[6,7],[8,7],[7,6],[7,8]]);
for (let i=0;i<20;i++){ mv = AI.chooseMove(b, 1, r2, 4); assert(R.tryMove(b,mv[0],mv[1],1,r2).ok); }
// 4) 빈 판/첫 수
assert.deepStrictEqual(AI.chooseMove(mk([]), 1, rules, 0), [7,7]);
// 5) 자기 대국 완주: 예외 없이 끝나고 항상 합법수
const bd = new Uint8Array(N*N); let c=1, n=0, over=false;
while(!over && n<225){ const m=AI.chooseMove(bd,c,rules,n); if(!m) break; const t=R.tryMove(bd,m[0],m[1],c,rules); assert(t.ok); bd[m[1]*N+m[0]]=c; over=t.win; c=3-c; n++; }
console.log('self-play finished', n, 'moves, win=', over);
console.log('ai tests ok');
