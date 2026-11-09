# dsh-quark

把夸克网盘接进 DeepSeek Harness，以便agent直接调用网盘文件。左侧栏有主面板，会话右侧栏有标签页，agent 也能调用官方网盘工具。

插件不自带网盘 SDK，包装的是夸克官方的 [quarkclouddrive](https://b.quark.cn/apps/quarkcloud_skill_info/routes/V-sc7gOBT) Skill 里的 CLI。授权、签名、限流都交给官方工具，插件只把 CLI 变成可点的界面和 agent 能调的工具。

![面板结构](docs/preview.svg)

## 装上之后

| 位置 | 内容 |
| --- | --- |
| 左侧栏 → 夸克网盘 | 主面板：账号容量、逐级浏览、搜索、底栏 9 个操作 |
| 会话右侧栏 → 夸克网盘 | 同一个面板的窄版，聊天时翻文件、把文件引用进对话 |
| agent 工具 `quark_*` | 15 个工具，查环境、列目录、搜文件、下载、整理 |

两个入口各有一个显示开关，在插件详情页里。关掉左侧栏会把入口真的摘掉，不是隐藏。

## 能做什么

| 能力 | 怎么用 | 限制 |
| --- | --- | --- |
| 查找 | 面板顶部搜索框，或 `quark_search` / `quark_list_files` | 搜的是文件名，不是正文 |
| 引用到会话 | 文件行右侧的「引用到会话」 | 只是把文件名和 `fid` 写进对话框，读文件仍需 agent 自己做 |
| 解析内容 | `quark_summary` / `quark_qa`，或先下载再让 agent 读本地文件 | 前者需要 SVIP+，后者不限会员 |

「解析」不是插件自己解析文件格式，而是把文件交给夸克 AI 助手，或者交给对话里的 agent。

## 使用要求

- DeepSeek Harness（Web 或 desktop）。右侧栏标签页需要带右侧栏的版本，老版本只有左侧主面板。
- Node.js 18 或更高。
- 夸克网盘官方 Skill（插件不复制也不修改它，只调用里面的 `scripts/quark-drive.cjs`）。
- 夸克账号。文件浏览、上传下载、移动、分享、重命名不限会员等级；AI 总结、智能搜索、相册整理走夸克自己的 AI 能力，需要 SVIP+。

## 安装官方 Skill

插件不替你装 Skill。它是夸克官方发行的包，含账号授权流程，装好之后插件会自动找到并复用，以后升级或重装插件都不用再装。

官方页面：<https://b.quark.cn/apps/quarkcloud_skill_info/routes/V-sc7gOBT>
页面上的「下载 Skill」按钮给当前版本，旁边有安装指南。

**方式一：让 agent 装**

在对话里粘贴官方给的那段提示词：

```
请安装 夸克网盘Skill,并授权账号
技能地址：https://pdds.quark.cn/download/stfile/eekkigineefiegmgo/quarkclouddrive-1.0.25.zip
授权码：CAC-***
```

agent 会按官方说明装好，再引导你完成账号授权。

**方式二：手动装**

下载官方 zip（页面按钮，或下面这个直链）：

```
https://pdds.quark.cn/download/stfile/eekkigineefiegmgo/quarkclouddrive-1.0.25.zip
```

这个直链指向 1.0.25。要最新版用页面上的按钮。

把 zip 解压到 `<DSH_HOME>/skills/quarkclouddrive/`，解压后结构是：

```
<DSH_HOME>/skills/quarkclouddrive/
├── SKILL.md
├── references/          12 个 .md
└── scripts/
    ├── quark-drive.cjs
    ├── install.sh
    ├── uninstall.sh
    └── hash-worker.cjs
```

解压完 CLI 已经可用。再跑一次安装脚本做环境自检和版本对齐：

```bash
cd <DSH_HOME>/skills/quarkclouddrive
bash scripts/install.sh
```

成功时返回 `{"type":"install_result","success":true,...}`。

以下两点容易踩：

1. `install.sh` 要在 Git Bash 或 WSL 里跑，不要用 PowerShell。脚本依赖 `curl`、`unzip`、`node`，PowerShell 的 PATH 里一般没有 `unzip`。Git for Windows 的 `C:\Program Files\Git\bin\bash.exe` 里三样都齐全。
2. 先解压 zip，再跑 `install.sh`。只把 `install.sh` 拷到空目录里跑，会因为找不到同级的 `quark-drive.cjs` 报 `CLI 入口文件不存在`，还会在 `scripts/` 下多套一层 `scripts/`。脚本靠「同目录有没有 `quark-drive.cjs`」判断这是首次安装还是升级。

验证：

```bash
node <DSH_HOME>/skills/quarkclouddrive/scripts/quark-drive.cjs -V
node <DSH_HOME>/skills/quarkclouddrive/scripts/quark-drive.cjs get-user-info
```

第一条打印版本号，例如 `1.0.25-876f30d`；第二条打印昵称和容量。第二条如果返回 `{"code":-103,"msg":"未登录..."}`，说明 CLI 正常、只是还没授权，执行 `login` 或让 agent 引导即可。

**已经装过会怎样**

- 只装插件、Skill 已在：插件只做只读探测（`fs.statSync` 看文件在不在），不覆盖、不改动、不重装。
- 重复跑官方 `install.sh`：脚本幂等，已是最新版时返回 `{"success":true,"updated":false,"from_version":"1.0.25","to_version":"1.0.25"}`。

**装在别的位置**

- `DSH_QUARK_SKILL_DIR` 指向 skill 目录本身（它下面应有 `scripts/quark-drive.cjs`）
- `DSH_QUARK_CLI` 直接指向 `quark-drive.cjs`

**确认当前状态**

让 agent 调 `quark_check_env`，或看面板顶部提示。它会说明 Skill 装没装、版本、CLI 路径、账号授权状态。

官方 `install.sh` 要求 Node 16 以上，本插件要求 18 以上。装 18+ 两边都满足。

## 安装插件

**方式一：让 agent 装**

把仓库放到本地，然后让 agent 装这个目录，要绝对路径：

```js
plugin_manager({ action: 'install_bundle', target: '<仓库目录的绝对路径>' })
```

**方式二：先 clone 再装**

```bash
git clone https://github.com/Bennie96/dsh-quark.git ~/dsh-quark
```

```js
plugin_manager({ action: 'install_bundle', target: '<~/dsh-quark 的绝对路径>' })
```

`install_bundle` 接受任何本地包目录，放哪都行。它会把目录登记到当前 profile 的 `package.json`（写成 `link:` 依赖），并把 `dsh-quark` 加进 `dsh.profile.bundles`。

装完一般当场生效，返回里有 `"application":"applied"`。如果左侧栏没出现云朵图标，让 agent 重挂一次：

```js
plugin_manager({ action: 'set_plugin', target: 'include:dsh-quark', enabled: false })
plugin_manager({ action: 'set_plugin', target: 'include:dsh-quark', enabled: true })
```

`set_plugin` 的 `target` 是 entryId `include:dsh-quark`，不是包名 `dsh-quark`。传包名会报 `unknown-plugin`。

还是没出现，按顺序看：

1. 插件详情页（设置 → 插件 → dsh-quark）里两个显示开关是不是关掉了。
2. 面板顶部有没有提示「还没装夸克网盘官方 Skill」。那是 Skill 没装，不是插件没装。
3. 让 agent 调 `quark_check_env`，Skill 路径、版本、授权状态会一次说清。

**卸载**

```js
plugin_manager({ action: 'remove_bundle', target: 'dsh-quark' })
```

卸载插件不影响官方 Skill，也不撤销夸克账号授权。

## 使用方法

### 浏览和搜索

点左侧栏图标进主面板，网盘根目录的内容会列出来。

- 进文件夹：点文件夹名
- 回上一级：顶部有一排路径（`我的网盘 / 资料 / 2026`），点任意一级跳回去
- 搜索：顶部搜索框按文件名搜，结果显示在「搜索结果」页签，切回「文件」页签回到当前目录

### 引用到会话

每个文件行右边有「引用到会话」和「复制名称」。引用到会话的行为取决你在哪个入口点：

| 入口 | 行为 |
| --- | --- |
| 右侧栏 | 直接写进当前对话框，AI 总结还会顺手发送 |
| 主面板 | 先弹框让你选「放到当前会话」还是「开一个新会话」，选完自动跳过去 |

### AI 总结

点「AI 总结」，插件不直接调夸克助手，而是把你的选择写成一段请求交给对话里的 agent：

- 选了文件：逐行列名字、大小、类型和 `fid`
- 没选：以当前文件夹为范围，让 agent 先看目录里有什么再总结

夸克助手接口经常返回 `-1501`（上游临时异常）或 `-1507`（5 分钟轮询超时，实测单篇 PDF 也可能超时）。在面板里等这种请求只能干等，交给 agent 则可以自己决定调 `quark_summary` 还是换方式读文件，也能跟你讨论。

点这个按钮本身不消耗会员权益，它只是往对话框里写字。真正调用 `quark_summary` / `quark_qa` 才需要 SVIP+。

### 解析文件内容

两条路都能用：

| 路线 | 怎么做 | 适合 | 代价 |
| --- | --- | --- | --- |
| 走夸克 AI 助手 | `quark_summary` 总结，`quark_qa` 提问，`fid_list` 单次不超过 100 | 不想下载到本机；批量看一批文件 | 需要 SVIP+；单篇 PDF 也可能跑满 5 分钟；遇到 `-1501` / `-1507` 要重试或缩小范围 |
| 下载后本地读 | `quark_download` 或用面板下载，再让 agent 读本机文件 | 要稳定、反复追问细节、跨文件比对 | 占本地空间；不受会员等级限制 |

夸克官方文档里提到过一个 `read-file` 命令，用来直接读文件内容，但当前随 Skill 发布的 CLI（v1.0.25）还没有这个子命令，执行会报 `unknown command 'read-file'`。所以插件没有包装它。

### 移动

点「移动」打开目录选择器，从根目录开始浏览，可以逐级进子目录、点路径回退，底部按钮写着你选中的目标（`移到「资料」`）。目标正好是文件当前所在目录时不会发请求，而是提示换一个。

### 其他底栏操作

- 上传：填本机绝对路径，一行一个
- 下载：默认落到系统「下载」文件夹（Windows 读注册表 Known Folder，macOS `~/Downloads`，Linux `$XDG_DOWNLOAD_DIR`）
- 分享：默认建私密链接带提取码，有效期永久
- 批量重命名：一行一个「原文件名 → 新文件名」，走官方 `rename`，30 天内可用原 batch ID 撤销
- 相册整理：一句话描述，例如「把去年在青岛拍的照片按地点整理」。默认复制，超过 500 个文件会二次确认复制还是移动。需要 SVIP+
- 整批归类：四步 `init → check → apply → undo`，任务目录默认在 `~/Documents/夸克整理记录`，撤回窗口 30 天

### 让 agent 用

装好后直接说人话：

> 看看我夸克网盘根目录有什么
> 把网盘里的「项目书.zip」下载下来
> 总结一下网盘里的 JCIS 那篇 PDF
> 把搜索结果里这几个文件批量重命名成 2026-01 开头的

agent 会自己选工具，15 个工具见下表。

## agent 工具

| 工具 | 用途 |
| --- | --- |
| `quark_check_env` | 自检：Skill 装没装、版本、CLI 路径、账号授权状态 |
| `quark_get_user_info` | 昵称、会员类型、容量、到期时间 |
| `quark_list_files` | 列目录直接子项，`parent_fid="0"` 为根 |
| `quark_search` | 关键词搜索，找文件夹传 `search_type="dir"` |
| `quark_create_folder` | 新建文件夹 |
| `quark_upload` | 上传本机文件或文件夹 |
| `quark_download` | 下载到本机，默认系统下载文件夹 |
| `quark_move` | 移动文件或文件夹 |
| `quark_share` | 创建分享链接，`url_type=2` 为带提取码的私密链接 |
| `quark_rename` | 批量重命名，1~5000 条一批，`revert` 撤销 |
| `quark_organize_album` | 相册整理，按人脸、地点、场景归类媒体，需要 SVIP+ |
| `quark_organize_files` | 整批归类四步：init / check / apply / undo |
| `quark_summary` / `quark_qa` | 夸克 AI 助手总结和问答，`fid_list` 不超过 100，需要 SVIP+ |
| `quark_login` | 登录授权 |

## 常见问题

**点引用提示「已填入」，但输入框里没内容**
DSH 输入框是 Lexical 受控编辑器，不是 textarea，改 DOM 会被覆盖。插件走宿主公开通道 `inputActions.insertText` → `setDraft` → `conversation` 服务 → 剪贴板，四级降级。都失败时退成剪贴板并提示你粘贴。

**右侧栏按钮提示「打不开，可能当前不在会话里」**
右侧栏要有一个屏上会话才能开。先在中间开一个对话，再点。

**面板提示找不到 Skill**
按上面「安装官方 Skill」装一次，装完不用重装插件，刷新页面即可。也可以用 `DSH_QUARK_SKILL_DIR` 指向已有安装。

**AI 总结一直卡住或报「上游助手服务异常」**
`-1501` 是夸克服务端临时问题，过几分钟重试；`-1507` 是 5 分钟没答完，缩小范围重试。非会员还会碰到会员提示，那是权益限制，不是故障。

**`{"code":-104,"msg":"无法识别当前 Agent 环境"}`**
官方 CLI 要求进程环境里有 `DSH_HOME` 或 `DSH_SESSION_ID`。插件在 `runCli` 里会补齐，看到这个错说明你是在插件外面手动跑的 CLI。

**搜索搜不到正文内容**
`quark_search` 搜文件名。按内容找可以用 `quark_qa` 对一批候选文件提问（需要 SVIP+），或下载后让 agent 读。

**能直接读网盘里 PDF / Word 的正文吗**
能，但走间接路线：`quark_summary` / `quark_qa` 让夸克 AI 助手解析（需要 SVIP+），或下载后由 agent 读本地文件。插件本身不做格式解析，官方 CLI 的 `read-file` 在 v1.0.25 里还不存在。

**左侧栏开关关掉后图标没消失**
刷新一次页面。槽位释放是即时的，但侧栏要重新渲染。

## 实现说明

插件分成后台和界面两块。

**后台（`lib/index.js`，跑在 Host 进程）**

- 包装 `quark-drive.cjs`。子进程用临时文件接 stdout 和 stderr，不用管道：既绕开 DSH 沙箱对 piped stdio 的限制，也吃得下大输出。
- 解析 CLI 的 NDJSON 协议，`type` 有 `result`、`progress`、`list`、`artifact`。
- 注册 15 个 `quark_*` 工具，以及 `/api/quark/*` 同源 HTTP 路由给面板用，绕开 CORS。
- 不注册 `agent/pre-step`。不在每轮对话里塞账号快照或文件清单，你提到网盘时才去查。

**界面（`lib/client.js`，跑在浏览器里）**

- `sidebar.panellist` 和 `main`：左侧栏入口和主面板，受开关控制，可装卸。
- `sidebarRightTabs.register` 配 `sidebar.right.pane.tab` 和 `.title`：右侧栏标签页。只注册正文不构成 tab，必须同时注册类型。
- `plugins.bundle.config`：插件详情页的两个开关。
- `conversation.input.left`：一个渲染 `null` 的桥组件，只为了拿到当前会话的 `inputActions`。

样式只用 `--dsw-alias-*` 主题 token，控件自己画，不动 `document.body`，资源都挂在 `ctx.effect` 上随插件卸载释放。

## 隐私

- 插件不收集、不上传任何数据，没有埋点。
- 授权凭据由官方 Skill 管理，存在 `<skill-dir>/deepseek/config.json`。插件只通过 CLI 间接使用，不读取也不复制。
- 面板里的账号信息（昵称、容量）每次从 CLI 现取，不落盘。
- 下载文件落到本机；上传只上传你明确指定的路径。

## 许可

MIT
