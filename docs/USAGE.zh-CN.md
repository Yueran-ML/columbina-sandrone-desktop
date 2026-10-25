# 哥伦比娅 · 月下同伴

Windows 10/11 x64 的独立桌面同伴。双击 **Launch-Columbina.cmd**，或直接打开 **portable/Columbina.exe**。便携包包含 Electron，不需要自行安装 Node.js、npm 或 Python；请保留完整 portable 文件夹。

首次启动打开“月下小屋”与两位透明桌面角色：哥伦比娅、桑多涅。两位可独立拖动并保存位置；小屋或托盘的“一同出现”开关可隐藏/显示桑多涅，哥伦比娅也可单独收起。关闭小屋只关闭面板；桌面同伴与计时仍继续。退出请使用角色右键菜单或系统托盘菜单的“退出”。本应用不添加开机启动、不安装全局软件、不修改系统设置。

## 使用

- 拖动角色移动位置，靠近屏幕工作区边缘时吸附；位置会记住。
- 单击轻轻拍拍，双击打开小屋，右键显示菜单。反复戳弄会让她平静表示想停一下，不扣分。
- 鼠标移到角色附近可见工具条：对话、分享点心、专注、设置、收起。
- “月下小屋”：打招呼、分享点心、轻拍、休息；精神、心情和熟悉度只记录本应用里的相处，离线没有惩罚。
- “一起专注”：自定 1–180 分钟专注与 1–60 分钟休息，支持暂停、继续、取消、累计记录和完成提醒。
- “偏好设置”：大小、不透明度、动作速度、置顶、边缘吸附、目光跟随、桌面散步、减少动态、提醒声音。
- “工作时的样子”是**手动状态演示**，可切换闲坐、等候、思考、阅览与遇到难题；没有自动监听 Codex、其他应用、屏幕或游戏。ChatGPT 宠物库的状态动画由 ChatGPT 客户端驱动，属于另一个独立交付。

双人联动：靠近时彼此招呼，分享点心/休息时另一位回应，专注或休息完成时先后接话。相遇场景间隔至少 90 秒，其他联动至少 20 秒，不连续刷气泡。场景是根据角色性格编写的原创日常，不是官方新剧情。两位共享相处数值与计时；聊天面板和可选 API 当前扮演哥伦比娅，桑多涅是独立桌面副角色。

计时器保存实际截止时间。睡眠或退出期间不会发送通知；恢复/重启后结算已经完成的计时，不会重复累计。原生通知能否出现受 Windows 通知设置与勿扰模式影响，小屋和桌面气泡也会显示完成提示。

## 对话与角色

默认是明确标注的**本地规则对话**：关键词匹配加预写原创短句，不是假装接通大模型。资料核对日期为 2026-10-25，详细事实、适用剧情阶段、中文语气与官方来源见 [CHARACTER.md](CHARACTER.md) 与 [SANDRONE.md](SANDRONE.md)。台词为原创改编，不是游戏原文。采用归乡后能自在生活、温暖亲近朋友的哥伦比娅，以及回归后的桑多涅；不预设主人/恋人关系、不用离开制造内疚，也不把早期剧情冻结为当下状态。

可选 OpenAI 兼容 `/chat/completions` 接口：在设置中填写 HTTPS 根地址（如 `https://api.openai.com/v1`）、该服务实际提供的模型 ID 和 API Key，勾选启用并保存。本机服务允许 `http://localhost:端口/v1`、`http://127.0.0.1:端口/v1` 或 IPv6 loopback；其他 HTTP 地址拒绝。完整 `/chat/completions` 地址也接受。请求超时 45 秒，不跟随重定向。

启用后，**角色系统提示、当前消息、最近 12 条 API 对话**会发送给所填服务。本地规则对话不自动上传。接口服务可能计费，规则由所用服务决定。API Key 使用 Electron safeStorage / Windows DPAPI 加密保存，只在主进程解密，不回传给界面。聊天文本本地保存为可读 JSON；“清空记录”可以清除。应用不提供任何模型工具或命令执行能力。模型输出不能保证始终符合人设，提示词与来源可在 persona.json 查阅。

角色与原作设计归 HoYoverse 及相应权利人所有。本项目是非官方同人作品；无官方语音、游戏内联动或账号接入。

## 数据与源码

普通运行的数据目录：`%APPDATA%/ColumbinaMoonlitCompanion/`。`state.json` 保存偏好、位置、互动状态、计时、最近 60 条对话及加密后的密钥。退出后可备份；移除文件可重置。密钥的加密绑定 Windows 用户环境，不能保证复制到另一台电脑后仍可解密。无法读取的旧记录保留为 `state.json.unreadable-时间戳`。

源文件：`main.cjs`（窗口、托盘、IPC、API）、`preload.cjs`（有限接口）、`core.cjs`（状态与计时）、`index.html` / `styles.css` / `renderer.js`（界面）、`persona.json` 与 `persona-sandrone.json`（角色规范与对话）、`assets/sprites.json` 与 `assets/sprites-sandrone.json`（图集布局）。没有渲染端 Node.js、远程页面或任意 IPC 执行接口。

以下命令均在仓库根目录运行：`npm ci` 安装锁定的开发依赖，`npm start` 启动程序；不需要额外前端构建步骤。`npm test` 验证截止计时/暂停恢复/持久化/边界/状态规则；`npm run check` 做语法检查。`npm run build:portable` 使用已安装的 Electron 构建便携包；也可使用官方 Electron 43.3.0 Windows x64 ZIP 运行 `powershell -ExecutionPolicy Bypass -File scripts/build-portable.ps1 -ElectronArchive <路径>`。缺少已安装运行时时，构建脚本会尝试本机同版本 Electron 缓存。

本次运行与测试范围见 [TESTING.md](TESTING.md)。`npm run pack:windows` 将源码和便携运行目录分别打包到仓库根目录的 `dist/`；仅打包源码使用 `npm run pack:source`。

内建真实 Electron 冒烟测试：`portable/Columbina.exe --smoke-test --smoke-test-dir=<绝对路径>/profile`。它使用独立数据目录，创建两位角色和面板的隐藏窗口，验证 preload/IPC、分享、规则对话、计时启停和不安全接口拒绝，同时在临时 loopback HTTP fixture 上验证兼容请求、响应、Windows 密钥加密以及密钥不进入渲染端。结果和窗口截图写到 profile 的上一级；不会开启托盘或显示真实通知。此测试不会声称已接通真实付费模型，或完成了人工拖动、多屏 DPI、Windows 通知到达测试。

## 精灵图接口

`assets/sprite-sheet.png`：透明 RGBA，1536×2288，8 列 × 11 行，每格 192×208。第 0 行闲坐 6 帧；第 1–2 行右/左走路各 8 帧；第 3 行招呼 4 帧；第 4 行跳跃 5 帧；第 5 行遇到难题 8 帧；第 6–8 行等候/思考/阅览各 6 帧。第 9–10 行共 16 个注视方向，从正上方开始，每 22.5° 顺时针递增。未用格透明。角色动画是同人改编，不是提取的官方动作。

如果图集缺失，界面明确显示“角色图集尚未就绪”，不会以别的角色或占位人物冒充。图集与角色资料更新后，重新运行构建脚本即可同步到便携包。

桑多涅图集 `assets/sprite-sheet-sandrone.png` 为 1536×1040，同样每格 192×208、8 列，5 行依次为闲坐 6 帧、向右/向左走路各 8 帧、招呼 4 帧、思考 6 帧。其等候与休息复用闲坐，阅览/遇到难题复用思考；没有虚构额外方向注视动作。

## 官方资料入口

- [官网角色页](https://genshin.hoyoverse.com/en/character/snezhnaya?char=15)
- [官方角色介绍](https://www.hoyolab.com/article/43294279)
- [HoYoWiki 的游戏语音与服装文本](https://wiki.hoyolab.com/pc/genshin/entry/9121?lang=en-us)
- [官方 2026 节日短文](https://www.hoyolab.com/article/43774899)
- [COGNOSPHERE 后续版本公告](https://prtimes.jp/main/html/rd/p/000000417.000096124.html)

Electron 的系统密钥保存语义见 [官方 safeStorage 文档](https://www.electronjs.org/docs/latest/api/safe-storage)。本包固定 Electron 43.3.0，使用该版本的同步 safeStorage API；新版本文档中的弃用说明从 Electron 45 开始。
