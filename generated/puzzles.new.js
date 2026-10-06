// 残局闯关关卡(红先; 杀局经强制杀求解器穷举验证最短步数, 实用定式经大师级AI双/三seed对弈验证)
// 章节: mate1一步杀 mate2两步杀 mate3三步杀 mate4四步连将杀 mate5p五至七步连将杀; endgame+type=win例胜/draw守和(执黑)
// fen 为局面; mate=红方连走步数; line=参考主变(黑方最顽强应着), 以 # 结束; drawMoves=守和所需回合
export const PUZZLES = [
  {
    id: 1, name: '车炮抽杀·二', chapter: 'mate1', mate: 1, fen: 'C4k3/9/b7R/9/7p1/9/9/9/9/4K4 r', hint: '车炮同线，车占肋道炮其后抽将成杀。', line: '车一平四 #'
  },
  {
    id: 2, name: '车炮抽杀·一', chapter: 'mate1', mate: 1, fen: '5k3/5a3/9/2C6/1p7/7R1/9/9/9/4K4 r', hint: '车炮同线抽将，炮架一成即杀。', line: '车二进五 #'
  },
  {
    id: 3, name: '大胆穿心·二', chapter: 'mate1', mate: 1, fen: '9/9/4ka3/R8/3R1p3/9/9/9/9/3K5 r', hint: '中路露帅，车硬闯花心成对面笑。', line: '车九平五 #'
  },
  {
    id: 4, name: '大胆穿心·三', chapter: 'mate1', mate: 1, fen: '3R5/5a3/4ka3/p8/6R2/9/9/9/9/3K5 r', hint: '车吃心士，将士皆无法阻挡。', line: '车三平五 #'
  },
  {
    id: 5, name: '大胆穿心·一', chapter: 'mate1', mate: 1, fen: '9/8R/4ka3/9/9/1R7/9/9/9/3K5 r', hint: '车破心士直插九宫，露帅助攻，将不敢食。', line: '车八平五 #'
  },
  {
    id: 6, name: '钓鱼马·二', chapter: 'mate1', mate: 1, fen: '9/9/2N1bk3/2p6/9/R8/9/9/9/4K4 r', hint: '马据钓鱼位，肋车照将。', line: '车九平四 #'
  },
  {
    id: 7, name: '钓鱼马·一', chapter: 'mate1', mate: 1, fen: '9/5k1N1/b3R4/p8/9/9/9/9/9/4K4 r', hint: '钓鱼马控将门斜角，车直入成杀。', line: '车五平四 #'
  },
  {
    id: 8, name: '二路夹车炮·二', chapter: 'mate1', mate: 1, fen: 'C1b6/3k1a3/9/p3R4/9/9/9/9/9/4K4 r', hint: '双炮一车归边，炮借车架照将。', line: '车五平六 #'
  },
  {
    id: 9, name: '二路夹车炮·一', chapter: 'mate1', mate: 1, fen: '9/5k3/9/2C6/1p7/7R1/9/9/9/4K4 r', hint: '车炮夹攻侧翼，炮沉将路。', line: '车二平四 #'
  },
  {
    id: 10, name: '挂角马·二', chapter: 'mate1', mate: 1, fen: '5k3/2C6/3a5/9/N3N4/9/9/9/9/4K4 r', hint: '马挂角，借炮力逼将入死角。', line: '马五进六 #'
  },
  {
    id: 11, name: '挂角马·三', chapter: 'mate1', mate: 1, fen: '3k4C/3N5/3a5/9/9/9/9/9/9/5K3 r', hint: '马挂右角，将无路可走。', line: '马六进四 #'
  },
  {
    id: 12, name: '挂角马·一', chapter: 'mate1', mate: 1, fen: '9/4Nk3/9/9/3p1C3/9/9/9/9/3K5 r', hint: '马挂士角叫将，将上不来。', line: '马五退四 #'
  },
  {
    id: 13, name: '海底捞月·二', chapter: 'mate1', mate: 1, fen: '6b2/5k3/3ab4/9/4Cp2R/9/9/9/9/4K4 r', hint: '车炮底路夹击成杀。', line: '车一平四 #'
  },
  {
    id: 14, name: '海底捞月·一', chapter: 'mate1', mate: 1, fen: '9/5a2R/5k3/9/4C4/9/9/9/9/3K5 r', hint: '车炮归底，车甩底路照将。', line: '车一退一 #'
  },
  {
    id: 15, name: '困毙·二', chapter: 'mate1', mate: 1, fen: '4Ck3/5a3/4P4/9/9/9/9/9/9/5K3 r', hint: '车占下二路封锁，将与士全无闲棋。', line: '兵五进一 #'
  },
  {
    id: 16, name: '困毙·一', chapter: 'mate1', mate: 1, fen: '7R1/4k4/3ab4/9/4R4/9/9/9/9/5K3 r', hint: '车封将门，黑将士动弹不得，困毙判负。', line: '车二平六 #'
  },
  {
    id: 17, name: '困宫车', chapter: 'mate1', mate: 1, fen: '4k4/8R/R8/9/9/9/9/9/9/3K5 r', hint: '车一平四 —— 黑将虽未被将军，却无处可走。象棋中困毙同样判负。', line: '车一平四 #'
  },
  {
    id: 18, name: '老兵擒王', chapter: 'mate1', mate: 1, fen: '4k4/9/5P3/9/9/1P3C3/9/9/9/3K5 r', hint: '老兵（过河到底线附近的兵）已入九宫，借炮势再进一步贴脸成杀。', line: '兵四进一 #'
  },
  {
    id: 19, name: '立马车·二', chapter: 'mate1', mate: 1, fen: '5k3/4a4/3N5/6R2/9/9/9/9/9/4K4 r', hint: '马控将门斜位，车沉底照将成立马车。', line: '车三进三 #'
  },
  {
    id: 20, name: '立马车·三', chapter: 'mate1', mate: 1, fen: '3k5/4a4/5N3/2R6/9/9/9/9/9/4K4 r', hint: '勒马车：马困将，车甩底路成杀。', line: '车七进三 #'
  },
  {
    id: 21, name: '立马车·一', chapter: 'mate1', mate: 1, fen: '9/9/4ak3/p3N4/9/8R/9/9/9/4K4 r', hint: '马控将门，车贴身照将成杀。', line: '车一平四 #'
  },
  {
    id: 22, name: '马后炮', chapter: 'mate1', mate: 1, fen: '4k4/9/4N4/9/5C3/9/9/9/9/3K5 r', hint: '炮四平五 —— 红马为架，炮镇中路成马后炮。', line: '炮四平五 #'
  },
  {
    id: 23, name: '马后炮·二', chapter: 'mate1', mate: 1, fen: '3k5/5a3/3N5/9/9/6C2/9/9/9/5K3 r', hint: '高马控将门，炮绕同线成马后炮杀。', line: '炮三平六 #'
  },
  {
    id: 24, name: '马后炮·三', chapter: 'mate1', mate: 1, fen: '3k5/9/9/3N4p/1p4b2/1C7/9/9/9/4K4 r', hint: '马侧镇角，炮打同线闷照。', line: '炮八平六 #'
  },
  {
    id: 25, name: '马后炮·一', chapter: 'mate1', mate: 1, fen: '9/2N1k4/b3b4/1Cp6/9/9/9/9/9/3K5 r', hint: '马镇中路作炮架，炮平同线借架照将，将无退路。', line: '炮八进二 #'
  },
  {
    id: 26, name: '闷宫·二', chapter: 'mate1', mate: 1, fen: '9/9/4bk3/3C5/6b2/5C3/9/9/9/5K3 r', hint: '炮塞宫顶，自士为屏闷死。', line: '炮六平四 #'
  },
  {
    id: 27, name: '闷宫·一', chapter: 'mate1', mate: 1, fen: '2b2k1C1/3a1aC2/9/8p/9/9/9/9/9/4K4 r', hint: '炮打宫顶，黑士自堵将门成闷杀。', line: '炮三进一 #'
  },
  {
    id: 28, name: '炮锁中军', chapter: 'mate1', mate: 1, fen: '3aka3/R8/9/9/4C4/9/9/9/9/4K4 r', hint: '车九平八 —— 车控下二路，黑将士动弹不得。', line: '车九平八 #'
  },
  {
    id: 29, name: '炮辗丹沙·二', chapter: 'mate1', mate: 1, fen: '7R1/9/4bk3/6p2/8C/9/9/9/9/4K4 r', hint: '车炮碾宫，破防成杀。', line: '车二平四 #'
  },
  {
    id: 30, name: '炮辗丹沙·一', chapter: 'mate1', mate: 1, fen: '9/3k1C3/9/9/2b1Rp3/9/9/9/9/4K4 r', hint: '车为炮架辗打宫顶，成杀。', line: '车五平六 #'
  },
  {
    id: 31, name: '三进兵·二', chapter: 'mate1', mate: 1, fen: '3k5/2Pa5/9/2p6/3p5/1C7/9/9/9/4K4 r', hint: '兵借炮力再进，直抵将前成杀。', line: '兵七进一 #'
  },
  {
    id: 32, name: '三进兵·一', chapter: 'mate1', mate: 1, fen: '9/5a3/5k3/6P2/9/3C5/9/9/9/4K4 r', hint: '高兵拱入宫心叫将，将无法退避。', line: '兵三进一 #'
  },
  {
    id: 33, name: '双兵拍门·二', chapter: 'mate1', mate: 1, fen: '9/2P6/3ka4/4P4/9/9/9/9/9/4K4 r', hint: '双兵拍宫门，借帅力困将。', line: '兵五进一 #'
  },
  {
    id: 34, name: '双兵拍门·一', chapter: 'mate1', mate: 1, fen: '9/3a5/3k1a3/P1P6/5p3/9/9/9/9/4K4 r', hint: '双高兵逼宫，一兵拱心成杀。', line: '兵七进一 #'
  },
  {
    id: 35, name: '双车错·二', chapter: 'mate1', mate: 1, fen: 'R1bk5/2Ra5/9/9/1p4b2/9/9/9/9/4K4 r', hint: '双车错肋，一车沉底一车控道。', line: '车九平七 #'
  },
  {
    id: 36, name: '双车错·三', chapter: 'mate1', mate: 1, fen: '1R7/7R1/3k1a3/6p2/7p1/9/9/9/9/4K4 r', hint: '双车分路错照，士无法兼顾。', line: '车八平六 #'
  },
  {
    id: 37, name: '双车错·一', chapter: 'mate1', mate: 1, fen: '9/R8/4k4/3R2p2/1p7/9/9/9/9/3K5 r', hint: '高低双车错进，底车照将成杀。', line: '车六进一 #'
  },
  {
    id: 38, name: '双马饮泉', chapter: 'mate1', mate: 1, fen: '4k4/1N7/9/8N/9/9/9/9/9/3K5 r', hint: '一马卧槽照将，另一马早已控死黑将另一侧，双马饮泉，一着封喉。', line: '马一进三 #'
  },
  {
    id: 39, name: '送佛归殿·二', chapter: 'mate1', mate: 1, fen: '3k5/9/b2P5/9/9/5R3/9/9/9/3K5 r', hint: '底兵赶将入宫，车路接应。', line: '车四进五 #'
  },
  {
    id: 40, name: '送佛归殿·一', chapter: 'mate1', mate: 1, fen: '9/5P3/3kb4/9/4R4/9/9/9/9/4K4 r', hint: '低兵逼近将脸，车兜底追死。', line: '车五平六 #'
  },
  {
    id: 41, name: '天地炮·二', chapter: 'mate1', mate: 1, fen: '9/3aka3/4a4/9/C4p3/C8/9/9/9/4K4 r', hint: '天地双炮夹击中腹。', line: '前炮平五 #'
  },
  {
    id: 42, name: '天地炮·三', chapter: 'mate1', mate: 1, fen: '9/4ka3/8b/2C6/4C4/9/9/9/9/3K5 r', hint: '一炮在上一炮在下，中路上成杀。', line: '炮七平五 #'
  },
  {
    id: 43, name: '天地炮·一', chapter: 'mate1', mate: 1, fen: '9/9/b2ak4/2C6/9/4C4/9/9/9/5K3 r', hint: '一炮镇中天，一炮沉底地，中路抽杀。', line: '炮七平五 #'
  },
  {
    id: 44, name: '铁门栓·二', chapter: 'mate1', mate: 1, fen: 'R8/6C2/3k1a3/9/1p7/9/9/9/9/4K4 r', hint: '中炮栓将，底车甩肋照面。', line: '车九平六 #'
  },
  {
    id: 45, name: '铁门栓·三', chapter: 'mate1', mate: 1, fen: '9/3a1kC2/b8/3R5/9/9/9/9/9/4K4 r', hint: '炮镇中路，车占肋道，将不能平中。', line: '车六平四 #'
  },
  {
    id: 46, name: '铁门栓·一', chapter: 'mate1', mate: 1, fen: '6b2/9/1C1ka4/9/1R1p5/9/9/9/9/4K4 r', hint: '炮锁中路栓死将路，车甩肋道直插成杀。', line: '车八平六 #'
  },
  {
    id: 47, name: '卧槽马', chapter: 'mate1', mate: 1, fen: '4k4/9/8C/9/7N1/9/9/9/9/3K5 r', hint: '马跃卧槽控住将门一角，炮锁另一角，黑将无处逃生。', line: '马二进三 #'
  },
  {
    id: 48, name: '卧槽马·二', chapter: 'mate1', mate: 1, fen: '3k5/3a5/4R4/N8/9/9/9/9/9/3K5 r', hint: '马跳左翼卧槽，车占将门斜位成杀。', line: '车五退一 #'
  },
  {
    id: 49, name: '卧槽马·三', chapter: 'mate1', mate: 1, fen: '5k3/5a3/4R4/8N/9/2b6/9/9/9/3K5 r', hint: '卧槽马定将，底车兜底，士象难救。', line: '马一进二 #'
  },
  {
    id: 50, name: '卧槽马·一', chapter: 'mate1', mate: 1, fen: '5k3/5a3/4R4/8N/9/9/9/9/9/3K5 r', hint: '马跳右翼卧槽叫将，车控肋道斜位，将无路可走。', line: '马一进二 #'
  },
  {
    id: 51, name: '重炮', chapter: 'mate1', mate: 1, fen: '2bakab2/9/4C4/1C7/9/9/9/9/9/3K5 r', hint: '双炮叠于中路，前炮以后炮为架直捣九宫，士象满盘亦不能解。', line: '炮八平五 #'
  },
  {
    id: 52, name: '重炮·二', chapter: 'mate1', mate: 1, fen: '9/3aka3/9/4C4/3C5/9/9/9/9/3K5 r', hint: '肋道重炮叠发，将压宫角。', line: '炮六平五 #'
  },
  {
    id: 53, name: '重炮·三', chapter: 'mate1', mate: 1, fen: '9/9/4ak3/5C3/8C/9/9/9/9/3K5 r', hint: '重炮同线，将无处躲。', line: '炮一平四 #'
  },
  {
    id: 54, name: '重炮·一', chapter: 'mate1', mate: 1, fen: '5k3/9/3a5/9/5C3/4C4/9/9/9/4K4 r', hint: '双炮叠同线，后炮借前炮为架照将。', line: '炮五平四 #'
  },
  {
    id: 55, name: '闭宫车', chapter: 'mate2', mate: 2, fen: '3aka3/8R/R8/9/9/9/9/9/9/3K5 r', hint: '双车逼宫：车一平四引士，再车九平五杀。', line: '车一平四 士4进5 车九平五 #'
  },
  {
    id: 56, name: '兵架炮', chapter: 'mate2', mate: 2, fen: '4k4/9/4P4/5C3/9/9/9/9/9/3K5 r', hint: '炮四平五以兵为架；黑将偏出后，兵五进一追杀。', line: '炮四平三 将5平6 兵五进一 #'
  },
  {
    id: 57, name: '车兵错', chapter: 'mate2', mate: 2, fen: '4k4/4a4/1P7/9/9/8R/9/9/9/3K5 r', hint: '低兵控住九宫，车兜中路，黑将偏出仍被车追上。', line: '车一平五 将5平6 车五进四 #'
  },
  {
    id: 58, name: '车封将门', chapter: 'mate2', mate: 2, fen: '3ak4/8R/R8/9/9/9/9/9/9/3K5 r', hint: '单车封住将门，另一车沉底，士亦无解。', line: '车一平四 士4进5 车九平五 #'
  },
  {
    id: 59, name: '车马冷着', chapter: 'mate2', mate: 2, fen: '2b1ka3/R8/6N2/9/9/9/9/9/9/3K5 r', hint: '车九平六占肋，象虽能飞边，车六进一仍是杀。', line: '车九平六 象3进1 车六进一 #'
  },
  {
    id: 60, name: '车炮错', chapter: 'mate2', mate: 2, fen: '4k4/4a4/7R1/9/1C7/9/9/9/9/3K5 r', hint: '车借炮势抢占中路，黑将偏出，车再追一步成杀。', line: '车二平五 将5平6 车五进一 #'
  },
  {
    id: 61, name: '车炮夹攻', chapter: 'mate2', mate: 2, fen: '3aka3/4C4/9/9/1R7/9/9/9/9/5K3 r', hint: '首着「帅四平五」做杀，黑方任何应着均成车炮夹攻。', line: '帅四平五 士4进5 车八平六 #'
  },
  {
    id: 62, name: '车炮夹攻', chapter: 'mate2', mate: 2, fen: '2b2kb2/5C2C/9/3R5/9/9/9/9/9/3K5 r', hint: '首着「炮四平三」做杀，黑方任何应着均成车炮夹攻。', line: '炮四平三 象3进5 车六进三 #'
  },
  {
    id: 63, name: '车炮夹攻', chapter: 'mate2', mate: 2, fen: '3ak4/9/9/4CN3/9/5R3/9/9/9/5K3 r', hint: '首着「炮五退一」做杀，黑方任何应着均成车炮夹攻。', line: '炮五退一 将5平6 马四进五 #'
  },
  {
    id: 64, name: '大胆穿心', chapter: 'mate2', mate: 2, fen: '3k1a3/9/R8/4P4/9/9/9/9/9/5K3 r', hint: '首着「兵五进一」做杀，黑方任何应着均成大胆穿心。', line: '兵五进一 将4平5 车九进二 #'
  },
  {
    id: 65, name: '大胆穿心', chapter: 'mate2', mate: 2, fen: '5k3/9/9/4P4/R8/9/9/9/9/3K5 r', hint: '首着「兵五进一」做杀，黑方任何应着均成大胆穿心。', line: '兵五进一 将6平5 车九平四 #'
  },
  {
    id: 66, name: '大胆穿心', chapter: 'mate2', mate: 2, fen: '5k3/9/3P5/R8/9/9/9/9/9/3K5 r', hint: '首着「兵六进一」做杀，黑方任何应着均成大胆穿心。', line: '兵六进一 将6平5 车九平四 #'
  },
  {
    id: 67, name: '大胆穿心', chapter: 'mate2', mate: 2, fen: '3aka3/9/5R3/9/1R7/9/9/9/9/3K5 r', hint: '车占中路引士补位，再车坐大堂吃士穿心——著名杀法"大胆穿心"。', line: '车四平五 士4进5 车五退一 #'
  },
  {
    id: 68, name: '挂角马', chapter: 'mate2', mate: 2, fen: '4ka3/3Pa4/9/9/4N4/9/9/9/9/3K5 r', hint: '首着「帅六进一」做杀，黑方任何应着均成挂角马。', line: '帅六进一 士5进6 马五进四 #'
  },
  {
    id: 69, name: '挂角马', chapter: 'mate2', mate: 2, fen: '3ak4/4a1P2/9/R8/2N6/9/9/9/9/3K5 r', hint: '首着「兵三平四」做杀，黑方任何应着均成挂角马。', line: '兵三平四 士5进6 马七进六 #'
  },
  {
    id: 70, name: '挂角马', chapter: 'mate2', mate: 2, fen: '4ka3/1R2a2N1/9/9/9/9/9/9/9/5K3 r', hint: '首着「车八平六」做杀，黑方任何应着均成挂角马。', line: '车八平六 士5进6 马二退四 #'
  },
  {
    id: 71, name: '肋车炮', chapter: 'mate2', mate: 2, fen: '3ak4/8R/9/9/R8/9/9/9/9/3K5 r', hint: '双车肋道错进，士角一破即成杀。', line: '车一平四 士4进5 车九平五 #'
  },
  {
    id: 72, name: '立马车', chapter: 'mate2', mate: 2, fen: '4k4/9/N8/9/7R1/9/9/9/9/5K3 r', hint: '首着「马九进八」做杀，黑方任何应着均成立马车。', line: '马九进八 将5平4 车二平五 #'
  },
  {
    id: 73, name: '立马车', chapter: 'mate2', mate: 2, fen: '3a1k3/6C2/4C4/8N/9/9/9/9/9/3K5 r', hint: '首着「炮三平一」做杀，黑方任何应着均成立马车。', line: '炮三平一 士4进5 马一进二 #'
  },
  {
    id: 74, name: '立马车', chapter: 'mate2', mate: 2, fen: '4k4/4a4/7N1/4P4/9/6R2/9/9/9/3K5 r', hint: '首着「兵五进一」做杀，黑方任何应着均成立马车。', line: '兵五进一 将5平6 兵五进一 #'
  },
  {
    id: 75, name: '马兵控将', chapter: 'mate2', mate: 2, fen: '4ka3/9/4P4/9/7N1/9/9/9/9/3K5 r', hint: '首着「马二进三」做杀，黑方任何应着均成马兵控将。', line: '马二进三 士6进5 兵五进一 #'
  },
  {
    id: 76, name: '马兵控将', chapter: 'mate2', mate: 2, fen: '4ka3/9/4P4/9/1N7/9/9/9/9/5K3 r', hint: '首着「马八进七」做杀，黑方任何应着均成马兵控将。', line: '马八进七 士6进5 兵五进一 #'
  },
  {
    id: 77, name: '马兵控将', chapter: 'mate2', mate: 2, fen: '2b1k1b2/3P5/9/9/3N5/9/9/9/9/5K3 r', hint: '首着「马六进七」做杀，黑方任何应着均成马兵控将。', line: '马六进七 象3进1 兵六进一 #'
  },
  {
    id: 78, name: '马后炮', chapter: 'mate2', mate: 2, fen: '3k5/9/9/2N1C4/9/9/9/9/9/5K3 r', hint: '首着「炮五退一」做杀，黑方任何应着均成马后炮。', line: '炮五退一 将4平5 马七进五 #'
  },
  {
    id: 79, name: '马后炮', chapter: 'mate2', mate: 2, fen: '3k5/9/9/4N2C1/9/9/9/9/9/4K4 r', hint: '首着「马五进四」做杀，黑方任何应着均成马后炮。', line: '马五进四 将4进1 炮二平一 #'
  },
  {
    id: 80, name: '马后炮', chapter: 'mate2', mate: 2, fen: '3ak4/4a3N/9/7C1/9/9/9/9/9/5K3 r', hint: '首着「马一进三」做杀，黑方任何应着均成马后炮。', line: '炮二进三 士5进6 马一进三 #'
  },
  {
    id: 81, name: '马炮连杀', chapter: 'mate2', mate: 2, fen: '4k4/C8/9/1N7/9/9/9/9/9/3K5 r', hint: '炮先横移封住一侧将门，马即跃向另一侧叫杀。', line: '炮九平八 将5平6 马八进七 #'
  },
  {
    id: 82, name: '闷宫', chapter: 'mate2', mate: 2, fen: '3aka3/9/9/9/6C2/1R7/9/9/9/5K3 r', hint: '首着「车八平五」做杀，黑方任何应着均成闷宫。', line: '车八平五 士4进5 炮三进四 #'
  },
  {
    id: 83, name: '闷宫', chapter: 'mate2', mate: 2, fen: '3aka3/9/N2R4C/9/9/9/9/9/9/5K3 r', hint: '首着「马九进八」做杀，黑方任何应着均成闷宫。', line: '马九进八 士4进5 炮一进二 #'
  },
  {
    id: 84, name: '闷宫', chapter: 'mate2', mate: 2, fen: '3a1k3/C1N1a4/9/9/9/9/9/9/9/4K4 r', hint: '首着「马七退五」做杀，黑方任何应着均成闷宫。', line: '马七退五 将6平5 炮九进一 #'
  },
  {
    id: 85, name: '炮兵巧杀', chapter: 'mate2', mate: 2, fen: '4k4/9/3P5/9/9/4C4/9/9/9/3K5 r', hint: '兵借炮威直入九宫，再横步贴将，一步成杀。', line: '兵六进一 将5平6 兵六平五 #'
  },
  {
    id: 86, name: '炮镇中央', chapter: 'mate2', mate: 2, fen: '3aka3/9/R8/9/2C6/9/9/9/9/3K5 r', hint: '炮镇中路牵制士象，车骤然坐大堂，全士象亦难防范。', line: '车九平五 士4进5 车五退一 #'
  },
  {
    id: 87, name: '三进兵', chapter: 'mate2', mate: 2, fen: '2b2kb2/R3a1P2/4R4/9/9/9/9/9/9/3K5 r', hint: '首着「车九平五」做杀，黑方任何应着均成三进兵。', line: '车九平五 象3进5 兵三平四 #'
  },
  {
    id: 88, name: '三进兵', chapter: 'mate2', mate: 2, fen: 'R1b1k1b2/4aP2R/9/9/9/9/9/9/9/5K3 r', hint: '首着「车九平七」做杀，黑方任何应着均成三进兵。', line: '车九平七 士5退4 兵四进一 #'
  },
  {
    id: 89, name: '三进兵', chapter: 'mate2', mate: 2, fen: 'R1baka3/9/4PR3/9/9/9/9/9/9/4K4 r', hint: '首着「车九平七」做杀，黑方任何应着均成三进兵。', line: '车九平七 士6进5 兵五进一 #'
  },
  {
    id: 90, name: '三进兵', chapter: 'mate2', mate: 2, fen: '4k4/8C/9/3PP4/9/9/9/9/9/3K5 r', hint: '炮在后掩护，中兵连冲三步直坐王位，黑将左右躲闪终被追上。', line: '兵五进一 将5平6 兵五进一 #'
  },
  {
    id: 91, name: '三子归边', chapter: 'mate2', mate: 2, fen: '2b1ka3/R8/9/1N7/C8/9/9/9/9/3K5 r', hint: '车马炮三子归边：马八进六叫将，炮九平六成杀。', line: '车九平四 象3进5 马八进七 #'
  },
  {
    id: 92, name: '双车错', chapter: 'mate2', mate: 2, fen: '2bk2b2/4a4/9/9/4R4/6R2/9/9/9/5K3 r', hint: '首着「车五进三」做杀，黑方任何应着均成双车错。', line: '车五进三 象3进5 车三平六 #'
  },
  {
    id: 93, name: '双车错', chapter: 'mate2', mate: 2, fen: '3ak4/9/9/6RR1/9/9/9/9/9/3K5 r', hint: '首着「车三平五」做杀，黑方任何应着均成双车错。', line: '车三平五 士4进5 车二平四 #'
  },
  {
    id: 94, name: '双车错', chapter: 'mate2', mate: 2, fen: '4k4/9/9/3R2R2/9/9/9/9/9/3K5 r', hint: '首着「车六平五」做杀，黑方任何应着均成双车错。', line: '车六平五 将5平6 车五进二 #'
  },
  {
    id: 95, name: '双马饮泉', chapter: 'mate2', mate: 2, fen: '2bk2b2/9/6N2/3CN4/9/9/9/9/9/4K4 r', hint: '首着「马五进四」做杀，黑方任何应着均成双马饮泉。', line: '马五进四 将4进1 马三进四 #'
  },
  {
    id: 96, name: '双马饮泉', chapter: 'mate2', mate: 2, fen: '2bk2b2/9/9/6NN1/9/9/9/9/9/4K4 r', hint: '首着「马三进四」做杀，黑方任何应着均成双马饮泉。', line: '马三进四 将4进1 马二进四 #'
  },
  {
    id: 97, name: '双马饮泉', chapter: 'mate2', mate: 2, fen: '3a1k3/5N3/9/4N4/9/9/9/9/9/4K4 r', hint: '首着「马四退六」做杀，黑方任何应着均成双马饮泉。', line: '马四退六 士4进5 马五进三 #'
  },
  {
    id: 98, name: '送佛归殿', chapter: 'mate2', mate: 2, fen: '3k5/9/9/4P4/9/C6C1/9/9/9/4K4 r', hint: '首着「兵五平六」做杀，黑方任何应着均成送佛归殿。', line: '兵五平六 将4进1 炮九平六 #'
  },
  {
    id: 99, name: '送佛归殿', chapter: 'mate2', mate: 2, fen: '2b2kb2/1R7/9/5P3/1C7/9/9/9/9/3K5 r', hint: '首着「车八平五」做杀，黑方任何应着均成送佛归殿。', line: '车八平五 象3进5 炮八平四 #'
  },
  {
    id: 100, name: '送佛归殿', chapter: 'mate2', mate: 2, fen: '2bk1Cb2/4R4/9/9/3P5/9/9/9/9/3K5 r', hint: '首着「炮四退五」做杀，黑方任何应着均成送佛归殿。', line: '炮四退五 象3进5 炮四平六 #'
  },
  {
    id: 101, name: '送佛归殿', chapter: 'mate2', mate: 2, fen: '4k4/4a4/9/4P4/4C4/9/9/9/9/3K5 r', hint: '炮护中兵直冲九宫，两步贴脸，俗称"送佛归殿"（太监追皇帝）。', line: '兵五进一 将5平6 兵五进一 #'
  },
  {
    id: 102, name: '天地炮', chapter: 'mate2', mate: 2, fen: '5k3/5C3/9/9/8C/9/9/9/9/4K4 r', hint: '首着「炮四退二」做杀，黑方任何应着均成天地炮。', line: '炮四退二 将6进1 炮一平四 #'
  },
  {
    id: 103, name: '天地炮', chapter: 'mate2', mate: 2, fen: '2C2k3/9/9/5N3/9/7C1/9/9/9/5K3 r', hint: '首着「炮二平八」做杀，黑方任何应着均成天地炮。', line: '炮二平八 将6平5 炮八进五 #'
  },
  {
    id: 104, name: '天地炮', chapter: 'mate2', mate: 2, fen: '2bC1kb2/4a1R2/9/9/7C1/9/9/9/9/4K4 r', hint: '首着「炮六平三」做杀，黑方任何应着均成天地炮。', line: '炮六平三 象3进5 炮二进四 #'
  },
  {
    id: 105, name: '铁门栓', chapter: 'mate2', mate: 2, fen: '2b1k1b2/9/4N4/9/9/2R6/9/9/9/5K3 r', hint: '首着「马五进三」做杀，黑方任何应着均成铁门栓。', line: '马五进三 将5平4 车七平六 #'
  },
  {
    id: 106, name: '铁门栓', chapter: 'mate2', mate: 2, fen: '5k3/9/9/7R1/4P4/9/9/9/9/4K4 r', hint: '首着「兵五平四」做杀，黑方任何应着均成铁门栓。', line: '兵五平四 将6进1 车二平四 #'
  },
  {
    id: 107, name: '铁门栓', chapter: 'mate2', mate: 2, fen: '2b1k1b2/4aP3/9/9/4R4/9/9/9/9/4K4 r', hint: '首着「兵四平五」做杀，黑方任何应着均成铁门栓。', line: '兵四平五 将5平6 车五平四 #'
  },
  {
    id: 108, name: '卧槽马', chapter: 'mate2', mate: 2, fen: '3aka3/9/9/5N2C/9/9/9/9/9/5K3 r', hint: '首着「炮一进三」做杀，黑方任何应着均成卧槽马。', line: '马四进三 将5进1 炮一进二 #'
  },
  {
    id: 109, name: '卧槽马', chapter: 'mate2', mate: 2, fen: '2b1k1b2/9/9/1N7/9/5R3/9/9/9/3K5 r', hint: '首着「车四进四」做杀，黑方任何应着均成卧槽马。', line: '车四进四 象3进5 马八进七 #'
  },
  {
    id: 110, name: '卧槽马', chapter: 'mate2', mate: 2, fen: '3a1k3/4a4/8N/7C1/8R/9/9/9/9/4K4 r', hint: '首着「车一平四」做杀，黑方任何应着均成卧槽马。', line: '马一退三 将6平5 马三进二 #'
  },
  {
    id: 111, name: '重炮', chapter: 'mate2', mate: 2, fen: '3ak1C2/9/7C1/8R/9/9/9/9/9/3K5 r', hint: '首着「车一进二」做杀，黑方任何应着均成重炮。', line: '车一进二 士4进5 炮二进二 #'
  },
  {
    id: 112, name: '重炮', chapter: 'mate2', mate: 2, fen: '5k3/6C2/9/5C3/9/9/9/9/9/4K4 r', hint: '首着「炮三退三」做杀，黑方任何应着均成重炮。', line: '炮三退三 将6进1 炮三平四 #'
  },
  {
    id: 113, name: '重炮', chapter: 'mate2', mate: 2, fen: '2bakab2/9/2N6/C8/5C3/9/9/9/9/5K3 r', hint: '首着「炮九平五」做杀，黑方任何应着均成重炮。', line: '炮九平五 象3进1 炮四平五 #'
  },
  {
    id: 114, name: '车兵绞杀', chapter: 'mate3', mate: 3, fen: '3aka3/R8/9/4P4/9/9/9/9/9/4K4 r', hint: '中兵连进逼宫，士起将偏之际，车九进一兜底。', line: '兵五进一 士4进5 兵五进一 将5平4 车九平六 #'
  },
  {
    id: 115, name: '车兵入宫', chapter: 'mate3', mate: 3, fen: '3ak4/9/9/9/5RP2/9/9/9/9/3K5 r', hint: '车坐大堂破士，再追偏将，兵封住另一角，车兵联攻入宫。', line: '车四平五 士4进5 车五退一 将5平6 车五进四 #'
  },
  {
    id: 116, name: '车马兵临门', chapter: 'mate3', mate: 3, fen: '2bak1b2/9/3P5/9/1N7/6R2/9/9/9/3K5 r', hint: '车将引高，马兵连逼，兵到功成，4 步连将杀。', line: '车三进五 将5进1 车三平四 象3进5 兵六进一 #'
  },
  {
    id: 117, name: '车马冷着', chapter: 'mate3', mate: 3, fen: '2bak4/8N/9/9/9/2R6/9/9/9/3K5 r', hint: '马先吊住将门，车骤然占中破士，冷着频发，防不胜防。', line: '马一退三 象3进5 车七平五 士4进5 车五进三 #'
  },
  {
    id: 118, name: '车马冷着·1', chapter: 'mate3', mate: 3, fen: '4k4/3a5/9/9/1R7/6N2/9/9/9/5K3 r', hint: '车马呼应，冷不防连将成杀。', line: '车八平五 将5平4 车五平六 将4平5 车六进三 #'
  },
  {
    id: 119, name: '车马冷着·2', chapter: 'mate3', mate: 3, fen: '4k4/4a4/9/9/9/1R2N4/9/9/9/4K4 r', hint: '车马呼应，冷不防连将成杀。', line: '马五进六 将5平6 马六进五 将6平5 车八进五 #'
  },
  {
    id: 120, name: '车马冷着·3', chapter: 'mate3', mate: 3, fen: '2b1k4/3a1aN2/9/9/9/2R6/9/9/9/3K5 r', hint: '车马呼应，冷不防连将成杀。', line: '车七进五 将5进1 马三退四 将5进1 车七退二 #'
  },
  {
    id: 121, name: '车马炮成杀', chapter: 'mate3', mate: 3, fen: '3ak4/3R5/9/5C3/5N3/9/9/9/9/3K5 r', hint: '车点下二路逼将上楼，随即横车占肋成杀，马炮遥相呼应。', line: '车六平四 士4进5 帅六平五 将5平4 车四平五 #'
  },
  {
    id: 122, name: '车炮抽杀·1', chapter: 'mate3', mate: 3, fen: '4k4/3a5/7R1/6C2/9/9/9/9/9/5K3 r', hint: '车炮联动，抽将破防。', line: '车二平一 将5平4 车一平六 将4平5 车六进一 #'
  },
  {
    id: 123, name: '车炮抽杀·2', chapter: 'mate3', mate: 3, fen: '4k4/5a3/1R6c/9/7C1/9/9/9/9/3K5 r', hint: '车炮联动，抽将破防。', line: '车八平一 将5进1 车一进一 将5进1 车一平四 #'
  },
  {
    id: 124, name: '车炮抽杀·3', chapter: 'mate3', mate: 3, fen: 'C3k4/3a5/2R6/9/9/9/9/9/9/5K3 r', hint: '车炮联动，抽将破防。', line: '炮九平八 将5进1 车七进一 将5进1 车七平六 #'
  },
  {
    id: 125, name: '大胆穿心·1', chapter: 'mate3', mate: 3, fen: '4k4/5a3/8c/6R2/9/3R5/9/9/9/3K5 r', hint: '车坐大堂破士，直捣花心。', line: '车三进三 将5进1 车六进四 将5进1 车三退二 #'
  },
  {
    id: 126, name: '大胆穿心·2', chapter: 'mate3', mate: 3, fen: '4k4/3a1a2R/9/2R6/2b6/9/9/9/9/5K3 r', hint: '车坐大堂破士，直捣花心。', line: '车一平四 象3退1 车四平六 象1进3 车七退一 #'
  },
  {
    id: 127, name: '大胆穿心·3', chapter: 'mate3', mate: 3, fen: '4k4/3a5/R8/9/9/1R7/9/9/9/3K5 r', hint: '车坐大堂破士，直捣花心。', line: '车九平六 将5平6 车六进一 将6平5 车六平四 #'
  },
  {
    id: 128, name: '钓鱼马·1', chapter: 'mate3', mate: 3, fen: '4k4/3a1a2R/4N4/9/9/9/9/9/9/3K5 r', hint: '马控钓鱼点位，车兵贴身追将。', line: '马五退四 将5平4 车一进一 士6退5 车一平二 #'
  },
  {
    id: 129, name: '钓鱼马·2', chapter: 'mate3', mate: 3, fen: '4k4/R2a1a3/5N3/9/9/9/9/9/9/5K3 r', hint: '马控钓鱼点位，车兵贴身追将。', line: '车九进一 将5进1 马四退六 将5进1 车九退二 #'
  },
  {
    id: 130, name: '钓鱼马·3', chapter: 'mate3', mate: 3, fen: '4k4/3a5/9/R8/2N6/9/9/9/9/3K5 r', hint: '马控钓鱼点位，车兵贴身追将。', line: '马七进五 将5平6 车九进三 士4退5 车九平八 #'
  },
  {
    id: 131, name: '多兵联攻·1', chapter: 'mate3', mate: 3, fen: '4k4/4a4/5P3/1P3C3/9/9/9/9/9/3K5 r', hint: '多兵协同逼宫，炮为后盾。', line: '兵四进一 士5进4 炮四平五 将5平4 兵四平五 #'
  },
  {
    id: 132, name: '多兵联攻·2', chapter: 'mate3', mate: 3, fen: '4k4/4a4/5P3/7C1/1P7/9/9/9/9/3K5 r', hint: '多兵协同逼宫，炮为后盾。', line: '兵四进一 士5进4 炮二平五 将5平4 兵四平五 #'
  },
  {
    id: 133, name: '多兵联攻·3', chapter: 'mate3', mate: 3, fen: '4k4/4C4/6P2/2P6/9/9/9/9/9/4K4 r', hint: '多兵协同逼宫，炮为后盾。', line: '帅五平六 将5平6 兵三进一 将6平5 兵三平四 #'
  },
  {
    id: 134, name: '挂角马·1', chapter: 'mate3', mate: 3, fen: '4k4/2n6/9/2N6/9/8R/9/9/9/5K3 r', hint: '马挂士角逼将，侧翼续杀。', line: '车一平五 将5平4 帅四平五 马3进2 车五平六 #'
  },
  {
    id: 135, name: '挂角马·2', chapter: 'mate3', mate: 3, fen: '4k4/5a3/9/9/4N4/6R2/9/9/9/5K3 r', hint: '马挂士角逼将，侧翼续杀。', line: '马五进七 将5平4 车三进五 士6退5 车三平二 #'
  },
  {
    id: 136, name: '挂角马·3', chapter: 'mate3', mate: 3, fen: '2b1k4/3a1a3/8R/4N4/9/9/9/9/9/4K4 r', hint: '马挂士角逼将，侧翼续杀。', line: '帅五平四 象3进1 马五进七 将5平6 车一进二 #'
  },
  {
    id: 137, name: '海底捞月·1', chapter: 'mate3', mate: 3, fen: '4k4/5a3/1R6c/9/9/5C3/9/9/9/3K5 r', hint: '车占中路，炮沉底借势打车成杀。', line: '车八平一 将5进1 车一进一 将5进1 车一平四 #'
  },
  {
    id: 138, name: '海底捞月·2', chapter: 'mate3', mate: 3, fen: '4k4/3a5/3C5/9/3R5/9/9/9/9/5K3 r', hint: '车占中路，炮沉底借势打车成杀。', line: '车六平五 士4进5 车五进二 将5平4 车五进一 #'
  },
  {
    id: 139, name: '海底捞月·3', chapter: 'mate3', mate: 3, fen: '4k4/5a2C/9/9/9/3R5/9/9/9/5K3 r', hint: '车占中路，炮沉底借势打车成杀。', line: '车六进三 士6进5 车六平五 将5平4 车五进一 #'
  },
  {
    id: 140, name: '立马车·1', chapter: 'mate3', mate: 3, fen: '4k4/2n6/9/5R1N1/9/9/9/9/9/5K3 r', hint: '马至车随，车立刻即成杀。', line: '车四平五 将5平4 马二进四 马3进2 车五平八 #'
  },
  {
    id: 141, name: '立马车·2', chapter: 'mate3', mate: 3, fen: '4k4/3a5/9/1N4R2/9/9/9/9/9/5K3 r', hint: '马至车随，车立刻即成杀。', line: '马八进九 将5平4 马九退七 将4平5 车三进三 #'
  },
  {
    id: 142, name: '立马车·3', chapter: 'mate3', mate: 3, fen: '2b1k4/3a1a3/1N5R1/9/9/9/9/9/9/5K3 r', hint: '马至车随，车立刻即成杀。', line: '车二进二 将5进1 马八进七 将5进1 车二退二 #'
  },
  {
    id: 143, name: '马后炮·1', chapter: 'mate3', mate: 3, fen: '4k3C/5a3/9/9/5N3/9/9/9/9/3K5 r', hint: '马控将门，炮随马后成杀。', line: '马四进三 士6进5 帅六平五 将5平4 马三进四 #'
  },
  {
    id: 144, name: '马后炮·2', chapter: 'mate3', mate: 3, fen: '4k4/3N5/9/9/3C5/9/9/9/9/3K5 r', hint: '马控将门，炮随马后成杀。', line: '马六退四 将5进1 炮六平四 将5进1 马四进三 #'
  },
  {
    id: 145, name: '马后炮·3', chapter: 'mate3', mate: 3, fen: '4k2C1/3a5/6N2/9/9/9/9/9/9/5K3 r', hint: '马控将门，炮随马后成杀。', line: '炮二平一 将5平4 帅四平五 士4进5 马三进四 #'
  },
  {
    id: 146, name: '马后炮·全防', chapter: 'mate3', mate: 3, fen: '2b1k1b2/9/6N2/N4C3/9/9/9/9/9/3K5 r', hint: '马挂角逼将偏出，炮随即移肋架马成马后炮，双象救援不及。', line: '马九进八 象3进5 马八退六 将5平4 炮四平六 #'
  },
  {
    id: 147, name: '马炮联攻·1', chapter: 'mate3', mate: 3, fen: '4k4/8N/3C5/9/9/9/9/9/9/3K5 r', hint: '马炮配合，一控一杀。', line: '马一进三 将5平6 炮六平二 将6平5 炮二进二 #'
  },
  {
    id: 148, name: '马炮联攻·2', chapter: 'mate3', mate: 3, fen: '4k4/9/9/7C1/1N7/9/9/9/9/3K5 r', hint: '马炮配合，一控一杀。', line: '马八进七 将5平6 马七退五 将6平5 马五进三 #'
  },
  {
    id: 149, name: '马炮联攻·3', chapter: 'mate3', mate: 3, fen: '4k4/9/9/9/1C6N/9/9/9/9/3K5 r', hint: '马炮配合，一控一杀。', line: '炮八平五 将5平6 马一进三 将6平5 马三进五 #'
  },
  {
    id: 150, name: '闷宫·1', chapter: 'mate3', mate: 3, fen: '4k4/3a5/5R3/1P7/9/9/9/9/9/5K3 r', hint: '借黑方士象自堵将门，攻其闷杀。', line: '车四平三 将5平4 车三平六 将4平5 车六进一 #'
  },
  {
    id: 151, name: '闷宫·2', chapter: 'mate3', mate: 3, fen: '4k4/3a5/9/9/8P/8R/9/9/9/5K3 r', hint: '借黑方士象自堵将门，攻其闷杀。', line: '车一平五 将5平4 车五平六 将4平5 车六进四 #'
  },
  {
    id: 152, name: '闷宫·3', chapter: 'mate3', mate: 3, fen: '4k4/2nP5/9/5R3/9/9/9/9/9/3K5 r', hint: '借黑方士象自堵将门，攻其闷杀。', line: '兵六平七 将5进1 兵七进一 将5进1 车四进二 #'
  },
  {
    id: 153, name: '炮兵巧胜', chapter: 'mate3', mate: 3, fen: '3ak4/9/4P4/9/8C/9/9/9/9/4K4 r', hint: '炮一平四先封将门，士起则兵五进一，将偏则炮转中路。', line: '炮一平四 士4进5 兵五进一 将5平6 炮四平三 #'
  },
  {
    id: 154, name: '炮辗丹沙·1', chapter: 'mate3', mate: 3, fen: '4k4/3a5/1C7/R8/9/9/9/9/9/5K3 r', hint: '炮借架子来回碾扫，破士象成杀。', line: '车九平五 将5平4 车五平六 将4平5 车六进二 #'
  },
  {
    id: 155, name: '炮辗丹沙·2', chapter: 'mate3', mate: 3, fen: '4k3C/3a5/7R1/9/9/9/9/9/9/5K3 r', hint: '炮借架子来回碾扫，破士象成杀。', line: '炮一平二 将5平4 车二平六 将4平5 车六进一 #'
  },
  {
    id: 156, name: '炮辗丹沙·3', chapter: 'mate3', mate: 3, fen: '4k4/3a5/8R/4C4/9/9/9/9/9/5K3 r', hint: '炮借架子来回碾扫，破士象成杀。', line: '车一平二 将5平4 车二平六 将4平5 车六进一 #'
  },
  {
    id: 157, name: '全士马后炮', chapter: 'mate3', mate: 3, fen: '3aka3/9/4N4/9/5C3/9/9/9/9/3K5 r', hint: '炮四平五将军，士只能垫上，炮五退一照将不误。', line: '马五进三 将5进1 炮四退一 将5平6 马三退四 #'
  },
  {
    id: 158, name: '双车错', chapter: 'mate3', mate: 3, fen: '2b1k1b2/9/2R4R1/9/9/9/9/9/9/3K5 r', hint: '双车交替占肋错进，象飞中路也挡不住第二车兜底。', line: '车七平六 象3进5 车六进二 将5进1 车二进一 #'
  },
  {
    id: 159, name: '双车错·1', chapter: 'mate3', mate: 3, fen: '4k4/2n6/9/5R3/9/7R1/9/9/9/5K3 r', hint: '双车分占两肋交替错进。', line: '车四平五 将5平4 车五进二 马3进2 车二进五 #'
  },
  {
    id: 160, name: '双车错·2', chapter: 'mate3', mate: 3, fen: '4k4/3a1a3/9/7R1/9/5R3/9/9/9/5K3 r', hint: '双车分占两肋交替错进。', line: '车二进三 将5进1 车四进四 将5进1 车二退二 #'
  },
  {
    id: 161, name: '双车错·3', chapter: 'mate3', mate: 3, fen: '4k1b2/3a1a3/9/7R1/9/3R5/9/9/9/5K3 r', hint: '双车分占两肋交替错进。', line: '车六进四 象7进9 车二平五 将5平6 车六平四 #'
  },
  {
    id: 162, name: '双马饮泉·1', chapter: 'mate3', mate: 3, fen: '4k4/9/9/9/2N1N4/9/9/9/9/4K4 r', hint: '双马左右盘旋，轮番叫将。', line: '马七进九 将5进1 帅五平四 将5平4 马九进七 #'
  },
  {
    id: 163, name: '双马饮泉·2', chapter: 'mate3', mate: 3, fen: '4k4/4a2N1/9/9/9/4N4/9/9/9/4K4 r', hint: '双马左右盘旋，轮番叫将。', line: '马五进六 将5平4 马六进四 士5进6 马二退四 #'
  },
  {
    id: 164, name: '双马饮泉·3', chapter: 'mate3', mate: 3, fen: '4k4/4a4/9/2N6/4N4/9/9/9/9/5K3 r', hint: '双马左右盘旋，轮番叫将。', line: '马七进八 士5进6 马八退六 将5平6 马五进四 #'
  },
  {
    id: 165, name: '送佛归殿·1', chapter: 'mate3', mate: 3, fen: '4k4/9/9/9/3P5/C8/9/9/9/5K3 r', hint: '炮护中兵直冲，贴脸擒王。', line: '兵六进一 将5平4 兵六进一 将4平5 兵六进一 #'
  },
  {
    id: 166, name: '送佛归殿·2', chapter: 'mate3', mate: 3, fen: '4k4/4a4/5P3/9/1C7/9/9/9/9/3K5 r', hint: '炮护中兵直冲，贴脸擒王。', line: '兵四进一 士5进4 炮八平五 将5平4 兵四平五 #'
  },
  {
    id: 167, name: '送佛归殿·3', chapter: 'mate3', mate: 3, fen: '4k4/4a4/5P3/9/9/6C2/9/9/9/3K5 r', hint: '炮护中兵直冲，贴脸擒王。', line: '兵四进一 士5进4 炮三平五 将5平4 兵四平五 #'
  },
  {
    id: 168, name: '天地炮·1', chapter: 'mate3', mate: 3, fen: '4k4/4a4/9/6C2/5C3/9/9/9/9/4K4 r', hint: '一炮沉底一炮镇中，上下夹攻。', line: '炮三平六 将5平6 炮六平五 将6进1 炮五平四 #'
  },
  {
    id: 169, name: '天地炮·2', chapter: 'mate3', mate: 3, fen: '4k4/4a4/9/3C5/9/6C2/9/9/9/4K4 r', hint: '一炮沉底一炮镇中，上下夹攻。', line: '炮三平四 将5平6 炮六平五 将6进1 炮五平四 #'
  },
  {
    id: 170, name: '天地炮·3', chapter: 'mate3', mate: 3, fen: '3Ck4/4a4/9/9/9/5C3/9/9/9/4K4 r', hint: '一炮沉底一炮镇中，上下夹攻。', line: '炮六退三 将5平6 炮六平五 将6进1 炮五平四 #'
  },
  {
    id: 171, name: '铁门栓·1', chapter: 'mate3', mate: 3, fen: '1Rn1k4/3a4C/9/9/9/9/9/9/9/5K3 r', hint: '炮镇中路封门，车兵破栓入宫。', line: '车八平七 将5进1 车七退一 将5进1 车七平六 #'
  },
  {
    id: 172, name: '铁门栓·2', chapter: 'mate3', mate: 3, fen: '3Ck4/5a3/2R5c/9/9/9/9/9/9/3K5 r', hint: '炮镇中路封门，车兵破栓入宫。', line: '车七平一 将5进1 车一进一 将5进1 车一平四 #'
  },
  {
    id: 173, name: '铁门栓·3', chapter: 'mate3', mate: 3, fen: '4k4/3a5/R8/C8/9/9/9/9/9/3K5 r', hint: '炮镇中路封门，车兵破栓入宫。', line: '车九平六 将5平6 车六进一 将6平5 车六平四 #'
  },
  {
    id: 174, name: '卧槽马·1', chapter: 'mate3', mate: 3, fen: '4k4/9/9/N8/9/2C6/9/9/9/3K5 r', hint: '马卧卧槽控将，炮车跟进成杀。', line: '马九进七 将5平6 马七退五 将6平5 马五进三 #'
  },
  {
    id: 175, name: '卧槽马·2', chapter: 'mate3', mate: 3, fen: '4k4/2C2a3/2N6/9/9/9/9/9/9/3K5 r', hint: '马卧卧槽控将，炮车跟进成杀。', line: '炮七进一 将5平6 帅六平五 士6进5 马七进六 #'
  },
  {
    id: 176, name: '卧槽马·3', chapter: 'mate3', mate: 3, fen: '4k3C/9/9/9/2N6/9/9/9/9/5K3 r', hint: '马卧卧槽控将，炮车跟进成杀。', line: '炮一退一 将5平4 马七进六 将4进1 马六进四 #'
  },
  {
    id: 177, name: '重炮·1', chapter: 'mate3', mate: 3, fen: '4k4/4a4/9/C8/3C5/9/9/9/9/4K4 r', hint: '双炮叠线，后炮以前炮为架。', line: '炮九平四 将5平6 炮六平五 将6进1 炮五平四 #'
  },
  {
    id: 178, name: '重炮·2', chapter: 'mate3', mate: 3, fen: '4k4/4a4/9/3C5/9/2C6/9/9/9/4K4 r', hint: '双炮叠线，后炮以前炮为架。', line: '炮七平四 将5平6 炮六平五 将6进1 炮五平四 #'
  },
  {
    id: 179, name: '重炮·3', chapter: 'mate3', mate: 3, fen: '4k4/4a4/9/5C3/9/5C3/9/9/9/4K4 r', hint: '双炮叠线，后炮以前炮为架。', line: '前炮平六 将5平6 炮六平五 将6进1 炮五平四 #'
  },
  {
    id: 180, name: '车马兵逼宫', chapter: 'mate4', mate: 4, fen: '3ak4/2P6/b3b2PR/9/4N1b2/9/9/9/9/3K5 r', hint: '车马兵逼宫：红先车一进二，4步成杀。', line: '车一进二 将5进1 车一平四 象5退7 兵七平六 将5进1 车四退二 #'
  },
  {
    id: 181, name: '车马兵炮闹宫②', chapter: 'mate4', mate: 4, fen: '4k4/9/N1Paba3/8R/7C1/9/9/9/9/5K3 r', hint: '四步连将杀(车马兵炮闹宫)：红方步步紧逼必将军，黑方逐层应将到底仍无解；首着马九进七起，红子力协同成杀。', line: '马九进七 将5平6 马七退五 将6平5 炮二平五 士4退5 车一进三 #'
  },
  {
    id: 182, name: '车马兵炮闹宫③', chapter: 'mate4', mate: 4, fen: '2bakab2/2P6/9/9/R1N5C/9/9/9/9/3K5 r', hint: '四步连将杀(车马兵炮闹宫)：红方步步紧逼必将军，黑方逐层应将到底仍无解；首着马七进六起，红子力协同成杀。', line: '马七进六 将5进1 马六退四 将5进1 马四进三 将5平6 车九平四 #'
  },
  {
    id: 183, name: '车马归边', chapter: 'mate4', mate: 4, fen: 'R1b1k1b2/9/9/9/9/2NN5/9/9/9/3K5 r', hint: '车马集中一侧，连将逼宫成杀，4 步连将杀。', line: '车九平七 将5进1 车七平三 将5平4 车三平五 将4进1 车五退一 #'
  },
  {
    id: 184, name: '车马冷着', chapter: 'mate4', mate: 4, fen: '2bak4/1N7/7R1/9/9/9/9/9/9/3K5 r', hint: '四步连将杀(车马冷着)：红方步步紧逼必将军，黑方逐层应将到底仍无解；首着车二进二起，红子力协同成杀。', line: '车二进二 将5进1 车二退一 将5进1 马八进六 将5平6 车二平四 #'
  },
  {
    id: 185, name: '车马冷着②', chapter: 'mate4', mate: 4, fen: '3aka3/9/9/9/4N1R2/9/9/9/9/5K3 r', hint: '四步连将杀(车马冷着)：红方步步紧逼必将军，黑方逐层应将到底仍无解；首着马五进四起，红子力协同成杀。', line: '马五进六 将5进1 马六进八 将5平4 马八退七 将4平5 车三平五 #'
  },
  {
    id: 186, name: '车马连杀', chapter: 'mate4', mate: 4, fen: '2bak1b2/9/6R2/N8/3N5/9/9/9/9/3K5 r', hint: '车点将位引将，双马连杀，4 步连将杀。', line: '车三进二 将5进1 车三平四 象3进1 马九进七 将5平4 车四平六 #'
  },
  {
    id: 187, name: '车马联攻·2', chapter: 'mate4', mate: 4, fen: '4ka3/9/b2a1a3/5N2C/1R4b2/9/9/9/9/3K5 r', hint: '车马联攻·2：红先马四进六，4步成杀。', line: '马四进六 将5进1 炮一平七 将5平4 车八进三 将4退1 炮七平六 #'
  },
  {
    id: 188, name: '车马炮联攻', chapter: 'mate4', mate: 4, fen: '2b1k1b2/4a3N/9/7C1/5R3/9/9/9/9/5K3 r', hint: '四步连将杀(车马炮联攻)：红方步步紧逼必将军，黑方逐层应将到底仍无解；首着炮二进三起，红子力协同成杀。', line: '炮二进三 士5退6 马一退三 将5平4 车四进四 将4进1 车四平六 #'
  },
  {
    id: 189, name: '车马炮联攻②', chapter: 'mate4', mate: 4, fen: '2b1k1b2/1NR1a4/9/9/7C1/9/9/9/9/3K5 r', hint: '四步连将杀(车马炮联攻)：红方步步紧逼必将军，黑方逐层应将到底仍无解；首着车七进一起，红子力协同成杀。', line: '车七进一 士5退4 马八退六 将5进1 马六退四 将5平6 炮二平四 #'
  },
  {
    id: 190, name: '车马炮闹宫', chapter: 'mate4', mate: 4, fen: '2bakab2/C8/9/3R5/1N7/9/9/9/9/3K5 r', hint: '车马炮六次连将，车占花心成杀，6 步连将杀。', line: '车六进三 将5进1 马八进六 将5平6 车六平五 象3进5 车五退一 #'
  },
  {
    id: 191, name: '车炮兵催杀', chapter: 'mate4', mate: 4, fen: '2b1k1b2/2P1a4/9/3R5/1C7/9/9/9/9/3K5 r', hint: '四步连将杀(车炮兵催杀)：红方步步紧逼必将军，黑方逐层应将到底仍无解；首着炮八进四起，红子力协同成杀。', line: '车六进二 象3进1 炮八进四 将5平6 车六平五 象7进9 兵七进一 #'
  },
  {
    id: 192, name: '高吊车马', chapter: 'mate4', mate: 4, fen: '2bak1b2/9/9/2N3RN1/9/9/9/9/9/3K5 r', hint: '车点下二路吊将，马挂角成杀，4 步连将杀。', line: '车三平四 象3进5 马二进三 将5进1 车四进三 象7进9 马三退四 #'
  },
  {
    id: 193, name: '挂角车马炮', chapter: 'mate4', mate: 4, fen: '2b1k1b2/7N1/9/9/2C5R/9/9/9/9/3K5 r', hint: '红马挂角连将，车炮成杀，4 步连将杀。', line: '马二退三 象3进1 炮七平五 将5平6 马三进五 将6进1 车一平四 #'
  },
  {
    id: 194, name: '马炮兵追王', chapter: 'mate4', mate: 4, fen: '2bak1b2/1N7/9/3P5/8C/9/9/9/9/5K3 r', hint: '四步连将杀(马炮兵追王)：红方步步紧逼必将军，黑方逐层应将到底仍无解；首着马八退六起，红子力协同成杀。', line: '马八退六 将5进1 马六退四 将5进1 兵六进一 将5平6 炮一平四 #'
  },
  {
    id: 195, name: '马炮兵追王②', chapter: 'mate4', mate: 4, fen: '2baka3/1N7/6P1C/9/9/9/9/9/9/3K5 r', hint: '四步连将杀(马炮兵追王)：红方步步紧逼必将军，黑方逐层应将到底仍无解；首着马八退六起，红子力协同成杀。', line: '马八退六 将5进1 马六退四 将5平6 兵三进一 将6进1 马四进二 #'
  },
  {
    id: 196, name: '三骑闹宫', chapter: 'mate4', mate: 4, fen: '4k4/4a2NR/4b4/4N4/2b3b2/9/9/9/9/3K5 r', hint: '三骑闹宫：红先车一进一，4步成杀。', line: '车一进一 象5退7 车一平三 士5退6 马五进七 象3退5 车三平四 #'
  },
  {
    id: 197, name: '三骑闹宫·2', chapter: 'mate4', mate: 4, fen: '2b1k4/3Na4/b3b4/8R/1N7/9/9/9/9/3K5 r', hint: '三骑闹宫·2：红先车一进三，4步成杀。', line: '车一进三 象5退7 车一平三 士5退6 马八进七 象1进3 车三平四 #'
  },
  {
    id: 198, name: '双车马胁士', chapter: 'mate4', mate: 4, fen: '4k4/9/3aba3/7RR/6N2/9/9/9/9/3K5 r', hint: '四步连将杀(双车马胁士)：红方步步紧逼必将军，黑方逐层应将到底仍无解；首着车二进三起，红子力协同成杀。', line: '车二平五 将5平6 车五进一 将6进1 车五进二 士4退5 车一进二 #'
  },
  {
    id: 199, name: '双车马胁士②', chapter: 'mate4', mate: 4, fen: '4k4/9/3aba1R1/9/2N5R/9/9/9/9/5K3 r', hint: '四步连将杀(双车马胁士)：红方步步紧逼必将军，黑方逐层应将到底仍无解；首着车二进二起，红子力协同成杀。', line: '车二平四 将5平4 车四平五 将4进1 车五平六 将4平5 车一平五 #'
  },
  {
    id: 200, name: '双车炮穿心', chapter: 'mate4', mate: 4, fen: '2b1k1b2/4a4/1C1R5/3R5/9/9/9/9/9/3K5 r', hint: '四步连将杀(双车炮穿心)：红方步步紧逼必将军，黑方逐层应将到底仍无解；首着炮八进二起，红子力协同成杀。', line: '炮八进二 士5退4 前车平五 象7进5 车六进三 将5进1 车六退一 #'
  },
  {
    id: 201, name: '双车炮穿心②', chapter: 'mate4', mate: 4, fen: '4k4/9/3aba3/R5C1R/9/9/9/9/9/5K3 r', hint: '四步连将杀(双车炮穿心)：红方步步紧逼必将军，黑方逐层应将到底仍无解；首着车一进三起，红子力协同成杀。', line: '车九进三 象5退3 车九平七 将5进1 炮三平六 将5平6 车一进二 #'
  },
  {
    id: 202, name: '双车炮破心', chapter: 'mate4', mate: 4, fen: '4k4/7P1/1R1aba2R/9/2C6/9/9/9/9/5K3 r', hint: '四步连将杀(双车炮破心)：红方步步紧逼必将军，黑方逐层应将到底仍无解；首着车八进二起，红子力协同成杀。', line: '车八平六 将5进1 车六进二 将5平6 车六平五 象5进7 兵二平三 #'
  },
  {
    id: 203, name: '双车炮破心②', chapter: 'mate4', mate: 4, fen: '4k4/9/1R1aba3/6PRC/9/9/9/9/9/3K5 r', hint: '四步连将杀(双车炮破心)：红方步步紧逼必将军，黑方逐层应将到底仍无解；首着车二进三起，红子力协同成杀。', line: '车八平六 象5进7 车六平四 将5进1 车四进二 将5进1 车四退一 #'
  },
  {
    id: 204, name: '双马奔槽', chapter: 'mate4', mate: 4, fen: '2bak1b2/9/9/4N4/2N4R1/9/9/9/9/3K5 r', hint: '四步连将杀(双马奔槽)：红方步步紧逼必将军，黑方逐层应将到底仍无解；首着马七进六起，红子力协同成杀。', line: '马七进六 将5进1 马六退八 象3进5 马五进三 将5平6 车二平四 #'
  },
  {
    id: 205, name: '双马奔槽②', chapter: 'mate4', mate: 4, fen: '2b1k1b1R/1N2a4/9/9/4N4/9/9/9/9/5K3 r', hint: '四步连将杀(双马奔槽)：红方步步紧逼必将军，黑方逐层应将到底仍无解；首着车一平三起，红子力协同成杀。', line: '车一平三 士5退6 车三平二 象3进5 马五进六 将5进1 车二退一 #'
  },
  {
    id: 206, name: '双马盘宫', chapter: 'mate4', mate: 4, fen: '2b1k4/7N1/5a3/7R1/1Nb6/9/9/9/9/3K5 r', hint: '双马盘宫：红先马二退四，4步成杀。', line: '马二退四 将5平6 车二进二 后象进5 车二平五 象5进7 马四进二 #'
  },
  {
    id: 207, name: '双马盘宫', chapter: 'mate4', mate: 4, fen: '2bakab2/3N5/9/4N4/9/6R2/9/9/9/3K5 r', hint: '双马连环盘旋，破士象联防成杀，4 步连将杀。', line: '马六退四 将5进1 马四退六 将5退1 马六进七 将5进1 车三进四 #'
  },
  {
    id: 208, name: '双马盘绕', chapter: 'mate4', mate: 4, fen: '4k1b2/5N3/b3ba2b/4N4/1R7/9/9/9/9/3K5 r', hint: '双马盘绕：红先马四退六，4步成杀。', line: '马四退六 将5平6 车八平二 将6进1 车二进三 将6退1 马五进三 #'
  },
  {
    id: 209, name: '双马炮兵盘宫', chapter: 'mate4', mate: 4, fen: '4k4/7P1/3aba2C/5NN2/9/9/9/9/9/5K3 r', hint: '四步连将杀(双马炮兵盘宫)：红方步步紧逼必将军，黑方逐层应将到底仍无解；首着马四进六起，红子力协同成杀。', line: '马四进六 将5平4 马三进五 将4进1 马五进四 将4平5 兵二进一 #'
  },
  {
    id: 210, name: '双马炮杀·2', chapter: 'mate4', mate: 4, fen: '4kab2/9/3aN3b/2C6/4N1b2/9/9/9/9/3K5 r', hint: '双马炮杀·2：红先前马进三，4步成杀。', line: '前马进三 将5进1 马三退四 将5平4 炮七平六 士4退5 马四进六 #'
  },
  {
    id: 211, name: '双马炮协同', chapter: 'mate4', mate: 4, fen: '2b1k1b2/1C7/N1N6/9/9/9/9/9/9/5K3 r', hint: '四步连将杀(双马炮协同)：红方步步紧逼必将军，黑方逐层应将到底仍无解；首着马九进七起，红子力协同成杀。', line: '马九进七 将5平4 前马退五 将4进1 马五进四 将4进1 炮八退一 #'
  },
  {
    id: 212, name: '双马炮协同②', chapter: 'mate4', mate: 4, fen: '2b1k1b2/7N1/7N1/9/5C3/9/9/9/9/3K5 r', hint: '四步连将杀(双马炮协同)：红方步步紧逼必将军，黑方逐层应将到底仍无解；首着前马退四起，红子力协同成杀。', line: '前马退四 将5进1 马四进三 将5进1 马二退一 象3进1 马一进三 #'
  },
  {
    id: 213, name: '双炮马联动', chapter: 'mate4', mate: 4, fen: '2bak1b2/9/9/5C3/C5N2/9/9/9/9/3K5 r', hint: '四步连将杀(双炮马联动)：红方步步紧逼必将军，黑方逐层应将到底仍无解；首着马三进四起，红子力协同成杀。', line: '马三进四 将5进1 马四进三 将5进1 炮四平五 象3进1 炮九平五 #'
  },
  {
    id: 214, name: '车马兵催杀', chapter: 'mate5p', mate: 5, fen: '2bak1bR1/2P6/9/N8/9/9/9/9/9/3K5 r', hint: '车马兵联攻，连将五步擒王，5 步连将杀。', line: '车二平三 将5进1 车三平四 象3进1 兵七平六 将5进1 马九退八 士4进5 马八进七 #'
  },
  {
    id: 215, name: '车马双兵', chapter: 'mate5p', mate: 5, fen: '2b1k4/1P2aN1R1/9/5P3/6b2/9/9/9/9/3K5 r', hint: '车马双兵：红先兵八平七，5步成杀。', line: '兵八平七 象3进1 兵七平六 将5平6 兵六平五 象7退9 马四退五 象1进3 车二平四 #'
  },
  {
    id: 216, name: '马炮催杀', chapter: 'mate5p', mate: 5, fen: '2bakab2/9/9/9/2NN3C1/9/9/9/9/3K5 r', hint: '双马盘旋引将登高，炮沉底成杀，5 步连将杀。', line: '马七进六 将5进1 后马进四 将5进1 马六进五 象3进1 马四进三 将5退1 炮二进三 #'
  },
  {
    id: 217, name: '车兵胜马单士', chapter: 'endgame', type: 'win', drawMoves: 80, fen: '3ak4/9/2n6/9/4P4/9/9/9/R8/3K5 r', hint: '车占肋道捉马，兵逼九宫换士，孤马失援即擒。'
  },
  {
    id: 218, name: '车兵胜炮单士', chapter: 'endgame', type: 'win', drawMoves: 80, fen: '3ak4/9/2c6/9/4P4/9/9/9/R8/3K5 r', hint: '车占肋道捉炮，兵入九宫换士，炮无藏身即败。'
  },
  {
    id: 219, name: '车兵胜双象', chapter: 'endgame', type: 'win', drawMoves: 80, fen: '2b1k1b2/9/9/9/4P4/9/9/9/R8/3K5 r', hint: '车占中路，兵入九宫换象，孤象必失。'
  },
  {
    id: 220, name: '车马胜士象全', chapter: 'endgame', type: 'win', drawMoves: 80, fen: '2bakab2/9/9/9/9/9/2N6/9/R8/3K5 r', hint: '车马冷着借帅力破士象，各个击破。'
  },
  {
    id: 221, name: '车仕胜马单士', chapter: 'endgame', type: 'win', drawMoves: 80, fen: '3ak4/9/2n6/9/9/9/9/4A4/R8/4K4 r', hint: '车借仕力逐马于边线，回头破士即胜。'
  },
  {
    id: 222, name: '车仕胜双士', chapter: 'endgame', type: 'win', drawMoves: 80, fen: '3aka3/9/9/9/9/9/9/4A4/R8/4K4 r', hint: '车借仕力占肋沉底，双士联防亦破。'
  },
  {
    id: 223, name: '马兵胜单象', chapter: 'endgame', type: 'win', drawMoves: 80, fen: '4k4/9/2b6/9/4P4/9/9/7N1/9/4K4 r', hint: '兵换象或马控将位，孤象难挡马兵联攻。'
  },
  {
    id: 224, name: '马兵胜双士', chapter: 'endgame', type: 'win', drawMoves: 80, fen: '3aka3/9/9/9/4P4/9/9/7N1/9/4K4 r', hint: '马控将门、兵换士，双士联防也被各个击破。'
  },
  {
    id: 225, name: '马炮胜单马', chapter: 'endgame', type: 'win', drawMoves: 80, fen: '4k4/9/2n6/9/9/9/4C4/7N1/9/4K4 r', hint: '炮镇中路牵制，马跃卧槽，孤马兑炮后光将难守。'
  },
  {
    id: 226, name: '马炮胜单象', chapter: 'endgame', type: 'win', drawMoves: 80, fen: '4k4/9/2b6/9/9/9/4C4/7N1/9/4K4 r', hint: '炮镇中路牵制，马卧槽赶象，孤象必失。'
  },
  {
    id: 227, name: '马炮胜士象全', chapter: 'endgame', type: 'win', drawMoves: 80, fen: '2bakab2/9/9/9/9/9/4C4/7N1/9/4K4 r', hint: '炮镇中路、马卧槽，士象不全防马炮冷着。'
  },
  {
    id: 228, name: '马炮仕胜单缺士', chapter: 'endgame', type: 'win', drawMoves: 80, fen: '2b1k1b2/9/5a3/9/9/9/4C4/4A4/7N1/4K4 r', hint: '炮镇中路牵制单士，马换象或破士，两翼皆失。'
  },
  {
    id: 229, name: '马炮仕胜单缺象', chapter: 'endgame', type: 'win', drawMoves: 80, fen: '3aka3/9/2b6/9/9/9/4C4/7N1/9/3AKA2 r', hint: '马炮借仕为架牵制士象，先迫孤象归边，再破象擒王。'
  },
  {
    id: 230, name: '马炮仕胜光将', chapter: 'endgame', type: 'win', drawMoves: 80, fen: '4k4/9/9/9/9/9/4C4/4A4/7N1/4K4 r', hint: '马炮联攻借仕架成马后炮，光将无处可躲。'
  },
  {
    id: 231, name: '马炮仕胜双士', chapter: 'endgame', type: 'win', drawMoves: 80, fen: '3aka3/9/9/9/9/9/4C4/4A4/7N1/4K4 r', hint: '炮借仕架镇中，马绕肋道挂角，双士顾此失彼。'
  },
  {
    id: 232, name: '马双兵胜单士', chapter: 'endgame', type: 'win', drawMoves: 80, fen: '3ak4/9/9/9/4P4/3P5/9/7N1/9/4K4 r', hint: '马控将门，双兵逼宫换士，孤士难以两全。'
  },
  {
    id: 233, name: '马双兵胜双士', chapter: 'endgame', type: 'win', drawMoves: 80, fen: '3aka3/9/9/9/4P4/3P5/9/7N1/9/4K4 r', hint: '马控将门、双兵逼宫，换士后成杀。'
  },
  {
    id: 234, name: '炮兵仕胜单象', chapter: 'endgame', type: 'win', drawMoves: 80, fen: '4k4/9/2b6/9/4P4/9/1C7/4A4/9/4K4 r', hint: '兵逼将位，炮借仕架打象，孤象必失。'
  },
  {
    id: 235, name: '炮兵仕胜双士', chapter: 'endgame', type: 'win', drawMoves: 80, fen: '3aka3/9/9/9/4P4/9/1C7/4A4/9/4K4 r', hint: '炮借仕架镇中，兵入九宫换士，双士联防也必破。'
  },
  {
    id: 236, name: '炮双兵胜单缺象', chapter: 'endgame', type: 'win', drawMoves: 80, fen: '3aka3/9/2b6/9/4P4/5P3/1C7/9/9/4K4 r', hint: '炮镇中路牵制，双兵渡河东进，先破孤象再破士。'
  },
  {
    id: 237, name: '炮双仕胜单士', chapter: 'endgame', type: 'win', drawMoves: 80, fen: '3ak4/9/9/9/9/9/4C4/4A4/3A5/4K4 r', hint: '双仕连环为炮架，孤士动弹不得，炮镇中路即成杀。'
  },
  {
    id: 238, name: '双兵胜单士', chapter: 'endgame', type: 'win', drawMoves: 80, fen: '3ak4/9/9/9/4P4/3P5/9/9/9/4K4 r', hint: '一高一低双兵携手，低兵换士、高兵贴将即胜。'
  },
  {
    id: 239, name: '马擒单士', chapter: 'endgame', type: 'win', drawMoves: 80, fen: '3ak4/9/9/9/9/9/9/7N1/9/3K5 r', hint: '帅先占中，运马禁将再吃孤士，古谱称“七步成诗”，单士必失。'
  },
  {
    id: 240, name: '炮双仕胜单象', chapter: 'endgame', type: 'win', drawMoves: 80, fen: '4kb3/9/9/9/9/9/9/4C4/9/3AKA2 r', hint: '炮以仕为架、帅控将门，把象逼到边角即可破象擒王。'
  },
  {
    id: 241, name: '单车胜双士', chapter: 'endgame', type: 'win', drawMoves: 80, fen: '3aka3/9/9/9/9/9/9/9/R8/3K5 r', hint: '车借帅力占肋或沉底，双士联防也必被各个击破。'
  },
  {
    id: 242, name: '单车胜单马', chapter: 'endgame', type: 'win', drawMoves: 80, fen: '4k4/9/2n6/9/9/9/9/9/R8/3K5 r', hint: '赶马退到边线与将同侧，车帅联合擒马，马失则将亡。'
  },
  {
    id: 243, name: '单车胜单炮', chapter: 'endgame', type: 'win', drawMoves: 80, fen: '4k4/9/2c6/9/9/9/9/9/R8/3K5 r', hint: '炮离将则车擒炮，炮归家护将则车借帅力破之。'
  },
  {
    id: 244, name: '海底捞月', chapter: 'endgame', type: 'win', drawMoves: 80, fen: '3k5/3r5/9/9/9/9/9/4R4/9/2C1K4 r', hint: '车占中路，炮借帅力沉到将后打车，黑车被逼离肋即成杀。'
  },
  {
    id: 245, name: '马兵胜单士', chapter: 'endgame', type: 'win', drawMoves: 80, fen: '4ka3/9/9/9/4P4/9/7N1/9/9/3K5 r', hint: '马控将门、兵冲九宫贴将，孤士难以两全。'
  },
  {
    id: 246, name: '高低兵胜双士', chapter: 'endgame', type: 'win', drawMoves: 80, fen: '3aka3/9/4P4/9/3P5/9/9/9/9/3K5 r', hint: '一高一下两兵呼应，低兵占花心、高兵换士即胜。'
  },
  {
    id: 247, name: '炮兵仕胜单士', chapter: 'endgame', type: 'win', drawMoves: 80, fen: '3ak4/9/9/9/4P4/9/2C6/9/4A4/4K4 r', hint: '炮以仕为架，兵冲九宫，孤士无法兼顾炮架与兵锋。'
  },
  {
    id: 248, name: '车兵胜双士', chapter: 'endgame', type: 'win', drawMoves: 80, fen: '3aka3/9/4P4/9/9/9/9/9/R8/3K5 r', hint: '车占肋道，兵入九宫换士，随即成杀。'
  },
  {
    id: 249, name: '兵和炮双士', chapter: 'endgame', type: 'draw', humanSide: 'b', drawMoves: 80, fen: '3aka3/9/4c4/9/4P4/9/9/9/9/3K5 r', hint: '你执黑：炮镇中路、双士联防，孤兵难破。'
  },
  {
    id: 250, name: '兵仕和双士', chapter: 'endgame', type: 'draw', humanSide: 'b', drawMoves: 80, fen: '3aka3/9/9/9/4P4/9/9/4A4/9/4K4 r', hint: '你执黑：双士联防将前，单兵借仕也难破。'
  },
  {
    id: 251, name: '单兵和单马', chapter: 'endgame', type: 'draw', humanSide: 'b', drawMoves: 80, fen: '4k4/9/2n6/9/4P4/9/9/9/9/3K5 r', hint: '你执黑：马走闲牵制，孤兵无后援难胜马。'
  },
  {
    id: 252, name: '单兵和单士', chapter: 'endgame', type: 'draw', humanSide: 'b', drawMoves: 80, fen: '3ak4/9/9/9/4P4/9/9/9/9/4K4 r', hint: '你执黑：士在将前走闲，单兵无仕相助难破单士。'
  },
  {
    id: 253, name: '单兵和双象', chapter: 'endgame', type: 'draw', humanSide: 'b', drawMoves: 80, fen: '2b1k1b2/9/9/9/4P4/9/9/9/9/3K5 r', hint: '你执黑：双象连环守中，孤兵无后援难破。'
  },
  {
    id: 254, name: '单马和单炮', chapter: 'endgame', type: 'draw', humanSide: 'b', drawMoves: 80, fen: '4k4/9/2n6/9/9/9/4C4/9/9/4K4 r', hint: '你执黑：马走闲牵制，炮无仕相为架不能成杀。'
  },
  {
    id: 255, name: '单马和士象全', chapter: 'endgame', type: 'draw', humanSide: 'b', drawMoves: 80, fen: '2bakab2/9/9/9/9/9/9/7N1/9/3K5 r', hint: '你执黑：士象全正位，单马难困毙。'
  },
  {
    id: 256, name: '单马和双士', chapter: 'endgame', type: 'draw', humanSide: 'b', drawMoves: 80, fen: '3aka3/9/9/9/9/9/9/7N1/9/3K5 r', hint: '你执黑：双士在将前联防，单马无炮架难困毙。'
  },
  {
    id: 257, name: '单马和双象', chapter: 'endgame', type: 'draw', humanSide: 'b', drawMoves: 80, fen: '2b1k1b2/9/9/9/9/9/9/7N1/9/3K5 r', hint: '你执黑：双象连环走闲，单马无炮架难困毙。'
  },
  {
    id: 258, name: '单炮和双士', chapter: 'endgame', type: 'draw', humanSide: 'b', drawMoves: 80, fen: '3aka3/9/9/9/9/9/4C4/9/9/4K4 r', hint: '你执黑：双士联防走闲，炮无架不能成杀。'
  },
  {
    id: 259, name: '单炮和双象', chapter: 'endgame', type: 'draw', humanSide: 'b', drawMoves: 80, fen: '2b1k1b2/9/9/9/9/9/4C4/9/9/3K5 r', hint: '你执黑：双象连环守中路，炮无仕相为架难破。'
  },
  {
    id: 260, name: '低兵和单缺象', chapter: 'endgame', type: 'draw', humanSide: 'b', drawMoves: 80, fen: '2b1ka3/5P3/9/9/9/9/9/9/9/3K5 r', hint: '你执黑：低兵已无力换士，士象联防固守即和。'
  },
  {
    id: 261, name: '低兵和炮双士', chapter: 'endgame', type: 'draw', humanSide: 'b', drawMoves: 80, fen: '3aka3/9/4c4/5P3/9/9/9/9/9/3K5 r', hint: '你执黑：炮镇中路、双士联防，低兵无力换士。'
  },
  {
    id: 262, name: '低兵和双士', chapter: 'endgame', type: 'draw', humanSide: 'b', drawMoves: 80, fen: '3aka3/5P3/9/9/9/9/9/9/9/3K5 r', hint: '你执黑：低兵已到底线无力，双士联防走闲即和。'
  },
  {
    id: 263, name: '马和炮单士', chapter: 'endgame', type: 'draw', humanSide: 'b', drawMoves: 80, fen: '3ak4/9/2c6/9/9/9/9/7N1/9/3K5 r', hint: '你执黑：炮护士角、将走闲，单马难擒炮士。'
  },
  {
    id: 264, name: '马和炮双士', chapter: 'endgame', type: 'draw', humanSide: 'b', drawMoves: 80, fen: '3aka3/9/4c4/9/9/9/9/7N1/9/3K5 r', hint: '你执黑：炮镇中路、双士联防，马无炮架难破。'
  },
  {
    id: 265, name: '双兵和炮士象全', chapter: 'endgame', type: 'draw', humanSide: 'b', drawMoves: 80, fen: '2bakab2/9/1c7/9/4P4/5P3/9/9/9/3K5 r', hint: '你执黑：炮守中路、士象联防，双兵难破。'
  },
  {
    id: 266, name: '双兵和士象全', chapter: 'endgame', type: 'draw', humanSide: 'b', drawMoves: 80, fen: '2bakab2/9/9/9/4P4/5P3/9/9/9/4K4 r', hint: '你执黑：士象全守中路，双兵难破联防。'
  },
  {
    id: 267, name: '双马和炮士象全', chapter: 'endgame', type: 'draw', humanSide: 'b', drawMoves: 80, fen: '2bakab2/9/1c7/9/9/9/2N6/7N1/9/3K5 r', hint: '你执黑：炮守中路、士象联防，双马难破。'
  },
  {
    id: 268, name: '士象全和单车', chapter: 'endgame', type: 'draw', humanSide: 'b', drawMoves: 80, fen: '2bakab2/9/9/9/9/9/9/9/R8/3K5 r', hint: '你执黑方：士象保持中路联防正位，车无从破士象，守满 40 回合即和。'
  },
  {
    id: 269, name: '孤将和单马', chapter: 'endgame', type: 'draw', humanSide: 'b', drawMoves: 80, fen: '4k4/9/9/9/9/9/9/7N1/9/3K5 r', hint: '你执黑方光将：单马无法困毙活动的孤将，将走闲着、切勿贴边角即和。'
  },
  {
    id: 270, name: '孤将和单炮', chapter: 'endgame', type: 'draw', humanSide: 'b', drawMoves: 80, fen: '4k4/9/9/9/9/9/9/4C4/9/3K5 r', hint: '你执黑方光将：炮无仕相为架不能成杀，光将从容走闲即和。'
  },
  {
    id: 271, name: '双士和单兵', chapter: 'endgame', type: 'draw', humanSide: 'b', drawMoves: 80, fen: '3aka3/9/9/4P4/9/9/9/9/9/3K5 r', hint: '你执黑方：双士在将前联防不乱动，单兵无力破士，守满即和。'
  }
];
