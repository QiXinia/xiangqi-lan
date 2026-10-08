# 中国象棋 · 纯静态单文件版（局域网 P2P）

一个可直接部署到任意静态托管的**手机版中国象棋网页**。全部功能打包进**单个 HTML 文件**，
无后端、无数据库、无账号，打开即玩。

- **在线预览**：<https://qixinia.github.io/xiangqi-lan/>（由 GitHub Actions 自动构建部署）
- **联机**：浏览器之间 **WebRTC DataChannel 直连**，`iceServers: []`，不配置任何 STUN/TURN/中继，对局数据不经过互联网；
- **第三方库与字体全部本地化内联**（vendor pako / qrcode / jsQR + 棋子 woff2），构建产物零外链、可完全离线运行。

## 特性

- **人机对弈**：经典引擎（稳健全面）+ 激进引擎（攻杀锐利）双引擎，各 5 档棋力（入门→大师），设置页可切换并持久化。
- **观战 AI 对战**：红黑各选引擎+档位，两台 AI 自动对弈学棋，支持暂停/继续、暂停单步、慢中快调速、重开、换配置、着法回看。
- **残局系统**：500+ 残局独立分类页（连将杀 [一至七步] / 古谱名局 / 例胜定式 / 守和定式），含提示与通关进度；
  - **AI 演示正解**：杀局按标注步数最短将死（确定性强制杀求解器），例胜/守和定式演示运子与防守；
  - **双 AI 对弈残局**：双方各选引擎档位从残局 FEN 自动对弈，结果如实判定（不伪装成功）。
- **古谱棋谱打谱**：70+ 主流开局与《橘中秘》《梅花谱》《韬略元机》等古谱名局，可逐步/自动播放推演。
- **同台对坐**：手机平放两人中间，棋子各朝己方，全屏交接防偷看。
- **局域网联机 / 观战**：同 WiFi/热点下建房，多标签（同设备）自动发现；跨设备靠扫码或房间码；房主权威结算、多人观战、断线重连提示。
- **对局工具**：悔棋、求和、认输、计时（包干/读秒加秒）、战绩记录、棋谱导出（标准中文记谱纯文本）。
- **观感**：新旧两套界面皮肤、桌面三栏布局、将军/绝杀动画与 WebAudio 合成音效、走子过渡动画。

## 隐私与能力边界

- **无服务器、无 STUN/TURN/中继**：网页只是入口，对局在浏览器间直连，云端不参与。
- **跨设备联机**：浏览器沙箱禁止网页做 mDNS/UDP 广播，故跨设备靠**扫码或房间码**配对；**同设备多标签可自动发现**；全程纯局域网、不经互联网。
- **揭棋（暗子）**：断线重连需重开局；明暗象棋（经典）不受影响。
- **无收集、无统计、无广告**。

## 本地运行

直接打开构建产物即可：

```bash
# 方式一：直接双击打开 xiangqi-lan-standalone.html（单文件，零依赖）
# 方式二：起本地静态服务（摄像头/扫码需要 http(s) 环境）
python3 -m http.server 8901
# 浏览器打开 http://127.0.0.1:8901/xiangqi-lan-standalone.html
```

## 自行构建

项目**零 npm 依赖**，构建脚本仅用 Node 内置模块：

```bash
node build-single.mjs
# 产物：xiangqi-lan-standalone.html（递归内联全部 ESM / worker Blob / 字体 / vendor）
```

## 测试

```bash
node test/engine.test.mjs        # 规则引擎
node test/notation.test.mjs      # 中文记谱互逆
node test/ai.test.mjs             # 经典 AI 自对弈
node test/room.test.mjs           # 房间状态机
node test/spectate.test.mjs       # 观战 AI 驱动
node test/puzzle-ai-demo.test.mjs # 残局 AI 演示
node test/net.test.mjs            # 信令编解码
# 残局穷举 / 开局库校验：node test/puzzle-check.js、node test/openings-check.mjs
```

## 目录结构

```
build-single.mjs                 单文件打包脚本（零 npm 依赖）
index.html                       开发态入口（加载 js/ 源码）
css/style.css                    全部样式（new/classic 双皮肤 / 动画）
js/engine.js                    规则引擎
js/ai.js / ai-pro.js             经典 / 激进双引擎
js/ai.worker.js                  Worker 消息路由
js/puzzles.js / openings.js      残局 / 棋谱数据
js/ai-spectate.js               观战 AI 驱动
js/puzzle-ai-demo.js             残局 AI 演示 / 双 AI
js/net-peer.js / room.js / pair.js  联机（iceServers: []）
js/board-view.js / game-controller.js  SVG 棋盘 / 对局控制
vendor/                          pako / qrcode / jsQR（本地化）
fonts/chess.woff2                棋子用字子集
test/                            node 测试
.github/workflows/               GitHub Pages / Release CI
```

## License

[MIT](./LICENSE) © QiXinia
