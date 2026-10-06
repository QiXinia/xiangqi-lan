// 实用残局·定式分片（例胜 type=win / 守和 type=draw）——第二阶段 AI 多 seed 复核后定稿
// 红大写 KABNRCP、黑小写 kabnrcp；10 行 '/'，第0行黑底线…第9行红底线；FEN 末尾 ' r'（红先）。
// win：红=强方执红先行；draw：humanSide='b'，红=AI 强方先行进攻，人执黑弱方守。
// 文字统一用「炮/汉」，不用「砲/漢」。
// 与 js/puzzles.js 现有 endgame（win id336-374 / draw id375-399）不重名、不同局、不左右镜像（见 tmp-verify-theorem.mjs）。
// 复核门：win 红 1500ms/3seed/220cap 内 redwin；draw 红 1200ms 强攻、黑 900ms 守、3seed/86cap 不被 redwin。

export const NEW_PUZZLES = [
  // ====================== 例胜（红强方必胜，红先） ======================
  {
    name: '炮士胜双士', chapter: 'endgame', type: 'win',
    fen: '3aka3/9/9/9/9/9/4C4/9/4A4/4KA3 r',
    hint: '你执红（强方）：帅占中路，花心仕即为现成炮架，炮镇肋道走等招，逼黑将离开中路后安中炮牵制将士；破其一士即成炮仕胜孤士。'
  },
  {
    name: '单车胜单士', chapter: 'endgame', type: 'win',
    fen: '3ak4/9/9/9/9/9/9/9/R8/3K5 r',
    hint: '你执红（强方）：车借帅力占肋沉底，先用车盯住孤士，再借帅助攻抽吃，孤士一失光将即毙。'
  },
  {
    name: '单车胜单象', chapter: 'endgame', type: 'win',
    fen: '4k4/9/4b4/9/9/9/9/9/R8/3K5 r',
    hint: '你执红（强方）：车占宫心控制将象，用等着逼象分飞，先赶散孤象再各个击破，孤象无处可藏。'
  },
  {
    name: '车兵胜单士', chapter: 'endgame', type: 'win',
    fen: '3ak4/9/9/9/4P4/9/9/9/R8/3K5 r',
    hint: '你执红（强方）：车占肋道控将，高兵逼近九宫换士，孤士难挡车兵联攻，破士即成杀。'
  },
  {
    name: '车兵胜单象', chapter: 'endgame', type: 'win',
    fen: '4k4/9/4b4/9/4P4/9/9/9/R8/3K5 r',
    hint: '你执红（强方）：车占中路捉象，高兵过河逼宫，孤象一失防线即崩，车兵联击破城。'
  },
  {
    name: '车马胜双士', chapter: 'endgame', type: 'win',
    fen: '3aka3/9/9/9/9/9/2N6/9/R8/3K5 r',
    hint: '你执红（强方）：车马冷着，马绕肋道挂角控将，车占肋道捉士，双士顾此失彼必破其一。'
  },
  {
    name: '车马胜单缺象', chapter: 'endgame', type: 'win',
    fen: '3akab2/9/9/9/9/9/2N6/9/R8/3K5 r',
    hint: '你执红（强方）：先用车马赶死孤象，再回手破双士；单缺象防线有缺口，车马联攻必克。'
  },
  {
    name: '双车胜单缺士', chapter: 'endgame', type: 'win',
    fen: '2b1k1b2/4a4/9/9/9/9/9/R8/9/R2K5 r',
    hint: '你执红（强方）：双车胁士，硬砍花心士，露帅助攻；单缺士孤掌难鸣，双车联破如入无人之境。'
  },
  {
    name: '双车胜双士', chapter: 'endgame', type: 'win',
    fen: '3aka3/9/9/9/9/9/9/R8/9/R2K5 r',
    hint: '你执红（强方）：一车占肋叫杀、另一车砍心士，借白脸将露帅，双士联防也拦不住双车。'
  },
  {
    name: '马炮胜单士', chapter: 'endgame', type: 'win',
    fen: '3ak4/9/9/9/9/9/4C4/7N1/9/4K4 r',
    hint: '你执红（强方）：炮镇中路牵制，马跃肋道挂角控将，孤士无法兼顾炮架与马后炮，必被擒。'
  },
  {
    name: '高兵胜孤将', chapter: 'endgame', type: 'win',
    fen: '4k4/9/9/9/9/4P4/9/9/9/4K4 r',
    hint: '你执红（强方）：帅先占住中路，高兵稳步向九宫推进，再以等着逼黑将欠行，兵临花心成困毙。'
  },
  {
    name: '炮高兵胜单士', chapter: 'endgame', type: 'win',
    fen: '3ak4/9/9/9/4P4/9/2C6/9/9/4K4 r',
    hint: '你执红（强方）：炮镇肋道牵制，高兵直逼九宫贴将，以兵为炮架换士；兵高不低头，孤士即破。'
  },

  // ====================== 守和（黑弱方坚守，红 AI 强方先行） ======================
  {
    name: '炮双士和单车', chapter: 'endgame', type: 'draw', humanSide: 'b', drawMoves: 80,
    fen: '4k4/3ca4/5a3/9/9/9/9/9/R8/4K4 r',
    hint: '你执黑（弱方）：摆成炮在士角、中士护心的正和形——将居中，士角炮贴将前，一士在花心、一士在肋上连环。红车禁将则动炮、禁炮则动将，炮不离士角，坚守 40 回合不败即和。'
  },
  {
    name: '炮双象和单车', chapter: 'endgame', type: 'draw', humanSide: 'b', drawMoves: 80,
    fen: '3k5/4c4/4b4/9/2b6/9/9/9/R8/5K3 r',
    hint: '你执黑（弱方）：炮镇中路遮将护心，一象在花心前护炮、一象在河头连环互保（炮三象正形）。炮须镇中勿轻离，双象往来走闲，红车无从破防，坚守 40 回合即和。'
  },
  {
    name: '双炮和单车', chapter: 'endgame', type: 'draw', humanSide: 'b', drawMoves: 80,
    fen: '4k4/4c4/4c4/9/9/9/9/9/R8/5K3 r',
    hint: '你执黑（弱方）：摆成「炮跟将」（兔子打伞）——将居中，双炮在中路一前一后叠护，以将为屏障互为炮架。红车破不了这条炮链，将炮往复走闲，坚守 40 回合即和。'
  },
  {
    name: '老兵和孤将', chapter: 'endgame', type: 'draw', humanSide: 'b', drawMoves: 80,
    fen: 'P3k4/9/9/9/9/9/9/9/9/3K5 r',
    hint: '你执黑（弱方）：红兵已沉底成老兵，只能平移不能前进，无力遮将；将在九宫从容走闲，红帅控不住孤将，坚守 40 回合即和。'
  },
  {
    name: '单炮和士象全', chapter: 'endgame', type: 'draw', humanSide: 'b', drawMoves: 80,
    fen: '2bakab2/9/9/9/9/9/4C4/9/9/4K4 r',
    hint: '你执黑（弱方）：士象全正位连环；红炮无仕相为架，孤炮难以借势破防，士象往来走闲，坚守 40 回合即和。'
  },
];
