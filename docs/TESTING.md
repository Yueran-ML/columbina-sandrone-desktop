# 验证记录 · 2026-10-25

本记录针对交付的 Electron 43.3.0 Windows x64 便携包及同目录源码。

GitHub 整理版保留相同应用逻辑与两位角色的最终图集，重新整理文档和构建/打包入口，并补充依赖锁文件与 GitHub Actions 配置。仓库路径不依赖原作者的本机目录。

整理版已完成锁文件安装、语法检查、10 项测试，以及将源码包解压到新的目录后执行 `npm ci`、`npm run build:portable` 和最终 EXE 隐藏窗口自测。新构建的 `ok`、`codeChecksPassed`、`assetsPassed` 均为 `true`。本地使用 Node.js 24.14.0；GitHub Actions 配置为 Node.js 22，远端 workflow 尚未运行。

## 自动化与实际运行

- Node 核心测试与主进程回归：**10/10 通过**。
- 覆盖状态持久化（含两位独立坐标）、损坏记录处理、截止计时、暂停/恢复/取消、重启结算与只计一次、接口地址限制、离线无惩罚、休息恢复、工作区边界和本地规则对话。
- 两项主进程回归直接在 VM 中运行真实 `main.cjs`：两位位于相向外边界时独立转向并继续走动；开始休息计时使用休息台词与等待动作，不播放专注开始台词。
- 真实打包 EXE 隐藏窗口测试：**进程 exit 0，ok=true，codeChecksPassed=true，assetsPassed=true**。实际创建两位角色窗口与小屋，验证 preload 隔离、IPC、角色素材加载、计时启停、双人气泡分窗投递、先后顺序与场景冷却。
- 本机临时 HTTP fixture 验证 OpenAI 兼容请求路径、授权头、角色提示和响应解析；Windows safeStorage 实际加密成功，磁盘无明文测试密钥，渲染端快照不含密文或密钥。未调用真实付费 API。
- 实际窗口截图已目视：小屋与四页布局、哥伦比娅和桑多涅的透明窗截图。完整图集尺寸分别为 1536×2288 与 1536×1040；未出现角色裁切。

原生 Electron 在工具沙箱内启动异常退出，改用获准的沙箱外隐藏窗口自测后正常完成。所有自测使用项目内独立测试目录，没有读取或覆盖用户的正常应用记录，也没有留下运行中的自测进程。

## 尚未人工验收的部分

未完成真人鼠标拖动手感、实际多屏/不同 DPI 组合、Windows 通知到达、长时间运行的 CPU/内存测量。通知调用已实现，系统勿扰和通知设置仍可能影响显示。图集逐帧视觉与方向审核属于制作流程的独立检查；本文件只描述桌面应用侧测试。

## 重跑

`npm test` 或 `node --test test/core.test.cjs test/desktop-regression.test.cjs`。

`portable/Columbina.exe --smoke-test --smoke-test-dir=<独立绝对路径>/profile`。报告与 PNG 截图保存在 profile 的上一级；缺少任意角色的最终图集时，报告会明确返回 `assetsPassed=false` 与 `ok=false`。
