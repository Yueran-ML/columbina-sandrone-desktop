# 上传到 GitHub

建议仓库名：`columbina-sandrone-desktop`。仓库根目录应直接看到 `package.json`、`README.md` 与 `main.cjs`；不要把工作区外层目录一起上传。

## Git 命令方式

在 GitHub 创建空仓库，然后在本项目根目录运行（把 `YOUR_NAME` 换成自己的账号）：

```powershell
git init
git branch -M main
git add .
git status --short
git commit -m "Initial release: Columbina and Sandrone desktop companions"
git remote add origin https://github.com/YOUR_NAME/columbina-sandrone-desktop.git
git push -u origin main
```

提交预览应只有源码、测试、必要角色素材、文档、预览图和 GitHub workflow。`.gitignore` 会排除 `node_modules/`、`portable/`、`dist/`、`test-output/`、日志、ZIP 与本地配置。

也可以通过 GitHub Desktop 的 Add existing repository 上传本地初始化后的仓库。使用网页上传时，将源码目录里的文件与子目录放到仓库根部，并确认 `.github/`、`.gitignore` 和 `.gitattributes` 也已上传；不要仅上传整个源码 ZIP 当作仓库内容。

## 提供可直接运行的版本

1. 按 README 构建并执行 `npm run pack:windows`。
2. 在 GitHub Releases 创建一个版本，例如 `v1.0.0`。
3. 上传 `dist/columbina-sandrone-desktop-win-x64.zip` 作为 Release 附件。
4. 发布说明列出双人联动、计时器、本地规则对话与可选 API 配置入口。

便携运行包包含 Electron，体积明显大于源码，应作为 Release 附件；不要提交进 Git 历史。

## 项目边界

此目录只包含哥伦比娅与桑多涅。没有其他角色、宠物库账户 ID、Library 页面 ID、API 密钥、聊天记录或测试浏览器 profile。

代码目前保留 `UNLICENSED`。如果希望他人以某个开源许可证使用、修改或分发代码，请由维护者明确选择许可证；角色和同人图像的权利说明需要单独保留。
