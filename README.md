# 局域网象棋（纯静态 · 局域网 P2P）

一个可以直接部署到任意静态托管（GitHub Pages / Cloudflare Pages / 内网 Nginx）的中国象棋手机版网页：
**人机对弈、好友近场对战、实时观战、揭棋、残局闯关、复盘打谱、计时、悔棋/求和/认输、聊天**。
联机为浏览器之间 **WebRTC DataChannel 直连，`iceServers: []`，不配置任何 STUN/TURN/中继，数据不经过互联网**；
第三方库与字体全部本地化，配合 Service Worker，打开过一次后可离线使用。

## 快速开始

### 本机预览
```bash
cd xiangqi-lan
python3 -m http.server 8901
# 浏览器打开 http://127.0.0.1:8901
```

### 部署上云（拿一个 https 网址即可，无需服务器）
网页摄像头（扫码）与 WebRTC 要求安全上下文，托管平台默认提供 HTTPS，二选一：

- **Cloudflare Pages（最快，推荐）**：登录 dash.cloudflare.com → Workers & Pages → Create → Pages → Upload assets，
  把本目录（含 index.html 的整个文件夹）拖进去，部署后得到 `https://xxx.pages.dev` 网址，手机浏览器打开即可。
- **GitHub Pages**：新建仓库，上传本目录全部文件 → Settings → Pages → 选 `main` 分支根目录 → Save，
  得到 `https://用户名.github.io/仓库名/`。
- 任意静态 Web 空间 / 内网 Nginx 也可（公网环境须 HTTPS；纯内网 HTTP 可用，Chrome 下 localhost 例外）。

> 网站本身只是"安装包/入口"。网页从云端加载后，**所有对局数据只在同一局域网的两台设备之间直连传输，云端不参与、也无法参与对局**。

## 怎么和好友下棋（重要：关于"自动发现"）

LocalSend 是原生 App，可以用 UDP 广播 / mDNS 在局域网里零交互自动发现好友；
**网页没有这两项系统能力（浏览器沙箱禁止网页发布 mDNS 服务或发 UDP 广播）**，因此本应用用**两轮扫码配对**完成近场连接：

1. 房主：首页「局域网对战 → 创建对局房间」，屏幕出现**轮播二维码**（信令较大，自动分成 2~3 屏轮播）。
2. 好友：首页「扫描房主的房间二维码」（选择"加入对战"或"旁观棋局"），用摄像头扫房主屏幕。
3. 好友手机随后出现**自己的二维码**，房主用屏幕下方摄像头扫回。
4. 房主手机上弹出「加入请求」，点「同意对战 / 允许观战」即连通；之后可继续邀请观战者。

双方必须在**同一局域网（同一 WiFi / 同一手机热点）**。没有摄像头或同设备双开时，配对页提供**文本信令兜底**
（复制全部邀请文本发给对方 → 对方粘贴生成回答 → 再粘回）。断线后 90 秒内同名重扫可恢复座位。

## 功能清单

- **人机对弈**：五级棋力（negamax + alpha-beta + 置换表 + MVV-LVA + 静态搜索 + 迭代加深，AI 运行于 Web Worker），可执红/执黑。
- **局域网对战 / 观战**：房主固定执红、房主权威结算；支持多人旁观、实时同步、聊天、悔棋请求、求和、认输、断线等待重连。
- **揭棋**：双方各 15 枚暗子随机布于原位、将帅明置；暗子按所在位置对应明子走第一步、落地翻开；翻开后士/象可过河；
  暗子可吃将；被吃暗子仅吃子方知真身；排列用 commit-reveal（SHA-256 承诺）防止作弊，终局公开校验；
  连续 40 回合（80 半回合）无吃子判和。
- **残局闯关**：12 个经穷举求解器验证的红先连将杀/困毙关卡，限定步数，含提示、过关进度、下一关。
- **复盘打谱**：战绩与棋谱仅存本机，可逐步/首末手/自动播放，上一手高亮。
- **计时**：不限时、5/10/20 分钟包干、5+3、10+3 加秒、10 分钟+30 秒读秒。
- **规则**：困毙判负、长将判负、重复局面判和、将军高亮、合法着法点/可吃子提示、黑方视角翻转。
- **观感**：棋子文字采用新魏体风格矢量字形（华文新魏/STXinwei 优先，内嵌开源毛笔楷体 woff2 子集兜底），
  SVG 棋盘任意缩放清晰，走子补间/翻牌动画，木色/青瓷/墨玉三套棋盘主题，WebAudio 合成音效与振动，PWA 可添加到主屏幕。

## 目录结构

```
index.html / manifest.webmanifest / sw.js   入口、PWA、离线缓存
css/style.css                               全部样式（含主题/动画）
js/engine.js                                规则引擎（经典+揭棋、序列化/复盘）
js/ai.js / js/ai.worker.js                  五级 AI
js/puzzles.js                               12 关残局（经强制杀求解器验证）
js/net-codec.js                             信令压缩编码（deflate + RFC9285 Base45 + 分片帧）
js/net-peer.js                              WebRTC 封装（iceServers: []）
js/room.js                                  房间状态机（房主权威/观战/时钟/揭棋握手）
js/qrcode-ui.js                             二维码轮播播放 + 摄像头扫描
js/pair.js                                  两轮扫码/文本信令配对流程
js/board-view.js / game-controller.js       SVG 棋盘 / 对局控制
js/app.js                                   路由与各页面
vendor/                                     pako、qrcode-generator、jsQR（全部本地化）
fonts/chess.woff2                           棋子用字子集
test/                                       node 测试 133 项 + 浏览器 WebRTC 冒烟页
```

## 测试

```bash
node test/engine.test.mjs   # 82 项规则
node test/ai.test.mjs       # 10 项 AI
node test/net.test.mjs      # 14 项信令编解码
node test/room.test.mjs     # 27 项房间状态机（loopback 驱动：对战/揭棋隔离/悔棋/求和/认输/超时/断线/观战/非法着法）
node test/puzzle-check.js   # 残局强制杀穷举校验
```
浏览器真实 WebRTC DataChannel 端到端冒烟：部署后打开 `test/webrtc-smoke.html`（页面自动建连并跑完全链路断言）。

## 已知限制（v1）

- 网页无系统级 mDNS/UDP 权限，近场发现以两轮扫码实现，无法做到 LocalSend 式完全零交互（浏览器能力边界）。
- 联机"再来一局"需重新建房（终局弹窗已引导回大厅）。
- 人机揭棋 AI 为全知视角（单机无信息隔离需求，强度偏高）。
- 部分企业 AP 开启"客户端隔离"时同 WiFi 设备间无法直连，改用一方手机开热点即可。
