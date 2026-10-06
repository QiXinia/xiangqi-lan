// 规则引擎测试: node test/engine.test.mjs
import * as E from '../js/engine.js';

let pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) { pass++; }
  else { fail++; console.log('  ✗ FAIL:', msg); }
}
function eq(a, b, msg) { ok(JSON.stringify(a) === JSON.stringify(b), `${msg} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`); }

// ---------- 1. 开局着法数(标准象棋开局 44 合法着法) ----------
{
  const s = E.createState();
  eq(E.legalMoves(s, 'r').length, 44, '开局红方应有 44 个合法着法');
  eq(E.legalMoves(s, 'b').length, 44, '开局黑方 44 着');
}

// ---------- 2. 各子走法单点 ----------
{
  const s = E.createState();
  const tg = E.legalTargetsFrom(s, 1, 9).map(t => t.join()).sort();
  eq(tg, ['0,7', '2,7'], '马: 可跳两角, (3,8)被相蹩腿 ' + tg);
  // 炮: 横6 + 退1 + 进4 + 架黑炮打马1 = 12
  eq(E.legalTargetsFrom(s, 1, 7).length, 12, '红左炮 12 个落点(含炮打马)');
  // 兵未过河只能进
  eq(E.legalTargetsFrom(s, 4, 6).map(t => t.join()), ['4,5'], '未过河兵只能前进');
  // 车可前出两格(至炮位线前)
  eq(E.legalTargetsFrom(s, 0, 9).map(t => t.join()), ['0,8', '0,7'], '红车可前出两格');
  // 仕只能斜走九宫
  eq(E.legalTargetsFrom(s, 3, 9).map(t => t.join()), ['4,8'], '仕走九宫斜线');
  // 相飞田: (0,7)(4,7) 皆空
  eq(E.legalTargetsFrom(s, 2, 9).map(t => t.join()).sort(), ['0,7', '4,7'], '相飞田两角');
  // 黑炮(1,2)纵线: 红炮(1,7)为架, 可打其后红马(1,9); 但不能落到架子(1,7)
  const sb = E.createState(); sb.turn = 'b';
  const bp = E.legalTargetsFrom(sb, 1, 2).map(t => t.join());
  ok(bp.includes('1,9'), '黑炮架红炮可打红马 ' + bp.filter(p => p.startsWith('1,')).join(','));
  ok(!bp.includes('1,7'), '炮不能落到炮架上');
}

// ---------- 3. 兵过河(避开中路将帅线) ----------
{
  const s = E.createState({ fen: '4k4/9/9/9/9/2p6/9/9/9/3K5 b' });
  const tg = E.legalTargetsFrom(s, 2, 5).map(t => t.join()).sort();
  eq(tg, ['1,5', '2,6', '3,5'], '黑过河卒可前进+左右');
  const s2 = E.createState({ fen: '4k4/9/9/9/6P2/9/9/9/9/3K5 r' });
  const tg2 = E.legalTargetsFrom(s2, 6, 4).map(t => t.join()).sort();
  eq(tg2, ['5,4', '6,3', '7,4'], '红兵抵河线(y4)即过河, 可左右');
}

// ---------- 4. 将帅照面非法 ----------
{
  // 红车在中路(4,4)遮挡且正将军黑将; 红车横离中路会造成照面 => 横移非法
  const s = E.createState({ fen: '4k4/9/9/9/4R4/9/9/9/9/4K4 r' });
  const tg = E.legalTargetsFrom(s, 4, 4).map(t => t.join());
  ok(tg.every(p => p.startsWith('4,')), '车不得走成将帅照面 ' + tg);
  ok(E.isInCheck(s, 'r') === false, '有车遮挡: 红帅未被将');
  ok(E.isInCheck(s, 'b') === true, '中路红车正在将军黑将');
  // 车一旦移开(纵走到3,4? 仍在x4) 用另一局面验证照面即被将
  const s2 = E.createState({ fen: '4k4/9/9/9/9/9/9/9/9/4K4 r' });
  ok(E.isInCheck(s2, 'r') && E.isInCheck(s2, 'b'), '中路全空: 将帅互视, 双方视角均为攻击态');
}

// ---------- 5. 将死(车封底线+帅控中路) ----------
{
  // 黑光将(4,0); 红车(0,0)横线将军; (4,1)被红帅(4,9)控制
  const s = E.createState({ fen: 'R3k4/9/9/9/9/9/9/9/9/4K4 b' });
  ok(E.isInCheck(s, 'b'), '黑方被将军');
  eq(E.legalMoves(s, 'b').length, 0, '黑无解着 => 将死');
}

// ---------- 6. 困毙(未被将军但无棋可走, 中国象棋判负) ----------
{
  // 黑将(4,0); 红车(3,1)(5,1)封两肋与下二路; 红帅(3,9)避开中路
  const s = E.createState({ fen: '4k4/3R1R3/9/9/9/9/9/9/9/3K5 b' });
  ok(!E.isInCheck(s, 'b'), '困毙: 黑方未被将军');
  eq(E.legalMoves(s, 'b').length, 0, '黑无棋可走 => 困毙判负');
}

// ---------- 7. 中文记谱 ----------
{
  const s = E.createState();
  eq(E.moveNotation(s, [7, 7], [4, 7]), '炮二平五', '当头炮记谱');
  eq(E.moveNotation(s, [7, 9], [6, 7]), '马二进三', '跳马记谱');
  eq(E.moveNotation(s, [4, 6], [4, 5]), '兵五进一', '进兵记谱');
  eq(E.moveNotation(s, [1, 2], [4, 2]), '炮2平5', '黑方炮2平5');
  eq(E.moveNotation(s, [4, 3], [4, 4]), '卒5进1', '黑方卒5进1');
  eq(E.moveNotation(s, [0, 9], [0, 8]), '车九进一', '红直车记谱');
  // 红车下到黑方下二路再进一吃底线: 车九进一
  const s3 = E.createState({ fen: '4k4/R3R4/9/9/9/9/9/9/9/4K4 r' });
  eq(E.moveNotation(s3, [0, 1], [0, 0]), '车九进一', '边线车进记谱');
  // 同列双车: 双车同在 x4 纵线 (4,2)(4,1), 前车(更靠黑方 y1)平到肋道
  const s4 = E.createState({ fen: '4k4/4R4/4R4/9/9/9/9/9/9/4K4 r' });
  eq(E.moveNotation(s4, [4, 1], [3, 1]), '前车平六', '同列双车记前缀"前"');
}

// ---------- 8. FEN 往返 ----------
{
  const s = E.createState();
  const fen = E.toFEN(s);
  eq(E.toFEN(E.createState({ fen })), fen, '开局 FEN 往返一致');
  E.applyMove(s, [7, 7], [4, 7]);
  const f2 = E.toFEN(s);
  eq(E.toFEN(E.createState({ fen: f2 })), f2, '走子后 FEN 往返一致');
}

// ---------- 9. 揭棋开局 ----------
{
  const s = E.createState({ jieqi: true, seed: 12345 });
  let dark = 0, kings = 0;
  for (let y = 0; y < 10; y++) for (let x = 0; x < 9; x++) {
    const p = s.board[y][x];
    if (!p) continue;
    if (p.t === 'K' && !p.hidden) kings++;
    if (p.hidden) { dark++; ok(!!p.orig, '暗子有表观类型'); }
  }
  eq(kings, 2, '双方将帅明置');
  eq(dark, 30, '30 个暗子');
  eq(E.legalTargetsFrom(s, 4, 6).map(t => t.join()), ['4,5'], '暗兵首步只能前进');
  eq(E.legalTargetsFrom(s, 0, 9).map(t => t.join()), ['0,8', '0,7'], '暗车首步同车(前出两格)');
  eq(E.legalTargetsFrom(s, 1, 7).length, 12, '暗炮走法同明炮');
  // 每方真身袋组成正确
  const cnt = {};
  for (const k in s.perms.r) cnt[s.perms.r[k]] = (cnt[s.perms.r[k]] || 0) + 1;
  eq(JSON.stringify(Object.entries(cnt).sort()), JSON.stringify([['A', 2], ['B', 2], ['C', 2], ['N', 2], ['P', 5], ['R', 2]]), '红方暗子真身袋组成');
}

// ---------- 10. 揭棋暗子落地翻开, 明仕/明相可过河 ----------
{
  // 明仕在(3,6), 揭棋规则下无九宫限制: 四个斜点皆可(含过河); 帅置 x3 避免中路照面
  const s2 = E.createState({ fen: '4k4/9/9/9/9/9/3A5/9/9/3K5 r' });
  s2.jieqi = true;
  eq(E.legalTargetsFrom(s2, 3, 6).map(t => t.join()).sort(), ['2,5', '2,7', '4,5', '4,7'], '揭棋明仕可过河斜走');
  // 经典模式: 仕每步落点必须在九宫(河沿仕只能斜回宫内 (4,7))
  const s3 = E.createState({ fen: '4k4/9/9/9/9/9/3A5/9/9/3K5 r' });
  eq(E.legalTargetsFrom(s3, 3, 6).map(t => t.join()), ['4,7'], '经典仕落点限九宫');
  // 明相过河: 相(3,6)四个田字点(眼位皆空), 含过河点(1,4)(5,4)
  const s4 = E.createState({ fen: '4k4/9/9/9/9/9/3B5/9/9/3K5 r' });
  s4.jieqi = true;
  eq(E.legalTargetsFrom(s4, 3, 6).map(t => t.join()).sort(), ['1,4', '1,8', '5,4', '5,8'], '揭棋明相可过河(仍受塞象眼限制)');
  // 暗子移动落地翻开
  const j = E.createState({ jieqi: true, seed: 77 });
  const m = E.legalMoves(j)[0];
  const before = j.board[m.from[1]][m.from[0]];
  ok(before.hidden, '走前为暗子');
  E.applyMove(j, m.from, m.to);
  const after = j.board[m.to[1]][m.to[0]];
  ok(!after.hidden && ['A', 'B', 'N', 'R', 'C', 'P'].includes(after.t), '落地翻开为明子, 真身合法');
}

// ---------- 11. 揭棋随机对局完整性 ----------
{
  let ended = 0, maxMoves = 0, errors = 0, reasons = {};
  for (let g = 0; g < 200; g++) {
    const s = E.createState({ jieqi: true, seed: g + 1 });
    let guard = 0;
    while (s.status === 'playing' && guard++ < 600) {
      const ms = E.legalMoves(s);
      if (!ms.length) break;
      const m = ms[Math.floor(Math.random() * ms.length)];
      E.applyMove(s, m.from, m.to);
    }
    maxMoves = Math.max(maxMoves, s.moves.length);
    if (s.status !== 'playing') { ended++; reasons[s.reason] = (reasons[s.reason] || 0) + 1; }
    let ks = 0;
    for (let y = 0; y < 10; y++) for (let x = 0; x < 9; x++) { const p = s.board[y][x]; if (p && p.t === 'K' && !p.hidden) ks++; }
    if (s.status === 'playing' && ks !== 2) errors++;
  }
  console.log(`揭棋 200 局: 终局 ${ended}`, reasons, `最长 ${maxMoves} 手, 异常 ${errors}`);
  ok(errors === 0, '揭棋随机对局无异常');
  ok(ended >= 100, '过半数揭棋随机局终局(其余为低水平随机游走耗尽步数, 属正常)');
}

// ---------- 12. 经典随机对局完整性 ----------
{
  let ended = 0, errors = 0, reasons = {};
  for (let g = 0; g < 100; g++) {
    const s = E.createState();
    let guard = 0;
    while (s.status === 'playing' && guard++ < 600) {
      const ms = E.legalMoves(s);
      if (!ms.length) break;
      const m = ms[Math.floor(Math.random() * ms.length)];
      E.applyMove(s, m.from, m.to);
    }
    if (s.status !== 'playing') { ended++; reasons[s.reason] = (reasons[s.reason] || 0) + 1; }
    let ks = 0;
    for (let y = 0; y < 10; y++) for (let x = 0; x < 9; x++) { const p = s.board[y][x]; if (p && p.t === 'K') ks++; }
    if (s.status === 'playing' && ks !== 2) errors++;
  }
  console.log('经典 100 局随机: 终局', ended, reasons, '异常', errors);
  ok(errors === 0, '经典随机对局无异常');
  ok(ended >= 60, '经典随机局多数终局(低水平随机游走易形成重复和棋)');
}

// ---------- 13. 悔棋一致性 ----------
{
  const s = E.createState();
  const path = [];
  for (let i = 0; i < 12; i++) {
    const ms = E.legalMoves(s);
    const m = ms[i % ms.length];
    path.push(m); E.applyMove(s, m.from, m.to);
  }
  const keyAfter = JSON.stringify(E.serialize(s).pieces);
  E.undoMoves(s, 2);
  eq(s.moves.length, 10, '悔棋 2 手后剩 10 手');
  E.applyMove(s, path[10].from, path[10].to);
  E.applyMove(s, path[11].from, path[11].to);
  eq(JSON.stringify(E.serialize(s).pieces), keyAfter, '悔棋后重走, 局面一致');
  // 揭棋悔棋: 翻开的暗子应还原
  const j = E.createState({ jieqi: true, seed: 99 });
  const jm = E.legalMoves(j)[0];
  E.applyMove(j, jm.from, jm.to);
  ok(!j.board[jm.to[1]][jm.to[0]].hidden, '暗子已翻开');
  E.undoLastMove(j);
  const back = j.board[jm.from[1]][jm.from[0]];
  ok(back && back.hidden && back.orig, '悔棋后暗子还原');
  eq(j.moves.length, 0, '揭棋悔棋后着法数归零');
}

// ---------- 14. 序列化/恢复一致性 ----------
{
  const s = E.createState({ jieqi: true, seed: 555 });
  for (let i = 0; i < 30; i++) {
    const ms = E.legalMoves(s);
    if (!ms.length) break;
    const m = ms[i % ms.length];
    E.applyMove(s, m.from, m.to);
  }
  const data = E.serialize(s);
  const r = E.restore(data);
  eq(E.toFEN(r), E.toFEN(s), '揭棋 30 手后序列化恢复, 局面一致');
  eq(r.moves.length, s.moves.length, '恢复后着法数一致');
}


// ---------- 15. 兵/卒正面将军(反向攻击判定回归) ----------
{
  // 红兵(4,1)贴黑将(4,0)正面将军
  let s = E.createState({ fen: '4k4/4P4/9/9/9/9/9/9/9/3K5 b' });
  ok(E.isInCheck(s, 'b'), '红兵正面贴黑将: 黑被将军');
  // 黑卒(4,8)贴红帅(4,9)正面将军, 黑将(4,0)与红帅同列以卒隔断
  s = E.createState({ fen: '4k4/9/9/9/9/9/9/9/4p4/4K5 r' });
  ok(E.isInCheck(s, 'r'), '黑卒正面贴红帅: 红被将军');
  // 红帅吃贴脸卒会造成将帅照面 -> 非法, 只能横避
  const rs = E.legalMoves(s, 'r').map(m => E.moveNotation(s, m.from, m.to));
  ok(!rs.includes('帅五进一'), '红帅不可直吃照面方向的卒');
  ok(rs.length === 2, '红帅仅可左右横避, 实际: ' + rs.join(','));
  // 老兵(3,0)横吃(4,0)黑将
  s = E.createState({ fen: '3Pk4/9/9/9/9/9/9/9/9/3K5 b' });
  ok(E.isInCheck(s, 'b'), '底线老兵横吃将军');
  // 兵将军局面下, 黑方所有合法应着走完后必须确实解除将军(不变量)
  s = E.createState({ fen: '4k4/4P4/9/9/9/9/9/9/9/3K5 b' });
  for (const m of E.legalMoves(s, 'b')) {
    const t = E.createState({ fen: '4k4/4P4/9/9/9/9/9/9/9/3K5 b' });
    E.applyMove(t, m.from, m.to);
    ok(!E.isInCheck(t, 'b'), '兵将军应着「' + E.moveNotation(s, m.from, m.to) + '」走完后确已解将');
  }
}

console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ HAS FAILURES'} — pass=${pass} fail=${fail}`);
process.exit(fail ? 1 : 0);
