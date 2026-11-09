/**
 * dsh-quark — Host 半
 *
 * 做两件事：
 *   1. 注册 quark_* agent 工具（inject: ['tools'] + ctx.tools.register）
 *   2. 注册 /api/quark/* HTTP 路由（浏览器半同源 fetch，绕开 CLI 的沙箱写限制）
 *
 * 刻意不注册 agent/pre-step：不在每轮对话里主动注入账号快照或文件信息。
 * agent 只在用户真的提到网盘时才调用上面的工具去查。
 *
 * 所有网盘操作都转调官方 skill 的 CLI：
 *   <DSH_HOME>/skills/quarkclouddrive/scripts/quark-drive.cjs
 * 由 Host 进程（不受 agent 文件沙箱限制）执行，因此 search 落盘、login 授权都能正常跑。
 */

const path = require('path')
const os = require('os')
const fs = require('fs')
const { spawn } = require('child_process')

const CONTEXT_KIND = 'dsh-quark-context'
const CONTEXT_REFRESH_MS = 10 * 60 * 1000
const CLI_TIMEOUT_MS = 180 * 1000

// ── CLI 定位 ──────────────────────────────────────────────────────────────
function dshHome() {
  return process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
}

/** 官方 Skill 的安装目录（可被 DSH_QUARK_SKILL_DIR 覆盖） */
function skillDir() {
  return process.env.DSH_QUARK_SKILL_DIR
    || path.join(dshHome(), 'skills', 'quarkclouddrive')
}

/** 官方 Skill 的 CLI 入口候选路径（找不到就返回 null） */
function resolveCli() {
  const candidates = [
    process.env.DSH_QUARK_CLI,
    path.join(skillDir(), 'scripts', 'quark-drive.cjs'),
    path.join(os.homedir(), '.dsh', 'skills', 'quarkclouddrive', 'scripts', 'quark-drive.cjs'),
  ].filter(Boolean)
  for (const c of candidates) {
    try {
      if (fs.statSync(c).isFile()) return c
    } catch { /* 下一个 */ }
  }
  return null
}

/** 官方 Skill 的入口脚本（用户需要自己跑它来安装/更新） */
function installScript() {
  return path.join(skillDir(), 'scripts', 'install.sh')
}

/** 读 SKILL.md 的 frontmatter version（拿不到就 null），用来告知用户版本是否对得上 */
function skillVersion() {
  try {
    const md = fs.readFileSync(path.join(skillDir(), 'SKILL.md'), 'utf8')
    const m = md.match(/^version:\s*(\S+)/m)
    return m ? m[1] : null
  } catch {
    return null
  }
}

/** Electron 下 process.execPath 是 app 本体，必须用 ELECTRON_RUN_AS_NODE 当 node 跑 */
function nodeRunner() {
  if (process.versions && process.versions.electron) {
    return { cmd: process.execPath, env: { ELECTRON_RUN_AS_NODE: '1' } }
  }
  return { cmd: process.execPath, env: {} }
}

function workDir() {
  const d = path.join(os.tmpdir(), 'dsh-quark-work')
  try { fs.mkdirSync(d, { recursive: true }) } catch { /* ignore */ }
  return d
}

/**
 * 系统「下载」文件夹。
 * Windows 走 Known Folder 注册表（用户可能把下载重定向到别的盘），
 * 读不到就退回 ~/Downloads；macOS / Linux 用 ~/Downloads 与 XDG。
 */
function downloadsDir() {
  const home = os.homedir()
  if (process.platform === 'win32') {
    const guid = '{374DE290-123F-4565-9164-39C4925E467B}'
    try {
      const { execFileSync } = require('child_process')
      const out = execFileSync('reg', ['query',
        'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders',
        '/v', guid], { encoding: 'utf8', windowsHide: true, timeout: 5000 })
      const m = /REG_(?:EXPAND_)?SZ\s+(.+?)\s*$/m.exec(out)
      if (m && m[1]) {
        const raw = m[1].replace(/%([^%]+)%/g, (_, name) => process.env[name] || '')
        if (raw) return raw
      }
    } catch { /* 退回默认 */ }
    return path.join(home, 'Downloads')
  }
  if (process.platform === 'darwin') return path.join(home, 'Downloads')
  const xdg = process.env.XDG_DOWNLOAD_DIR
  if (xdg) return xdg.replace(/^\$HOME/, home)
  return path.join(home, 'Downloads')
}

let sessionId = null
function getSessionId() {
  if (!sessionId) {
    const t = Math.floor(Date.now() / 1000)
    const r = Math.random().toString(36).slice(2, 8).padEnd(6, '0')
    sessionId = `${t}-${r}`
  }
  return sessionId
}

/**
 * 跑一次 CLI，解析 NDJSON。
 * @returns {Promise<{ok:boolean, code:number, msg:string, action:string, data:object,
 *                    lists:object[], artifacts:object[], notices:string[], stderr:string}>}
 */
function runCli(args, options = {}) {
  const cli = resolveCli()
  if (!cli) {
    return Promise.resolve({
      ok: false, code: -1, action: (args[0] || ''), data: {},
      msg: '还没装夸克网盘官方 Skill，没有可调用的 CLI。\n'
        + '装法（二选一）：\n'
        + '  1) 在对话里说「请安装 夸克网盘 Skill，并授权账号」，agent 会引导你装；\n'
        + '  2) 手动执行官方包里的安装脚本：bash "' + installScript() + '"\n'
        + '装好后应该存在：' + path.join(skillDir(), 'scripts', 'quark-drive.cjs') + '\n'
        + '（装在别处的话，用环境变量 DSH_QUARK_SKILL_DIR 或 DSH_QUARK_CLI 指过去）',
      lists: [], artifacts: [], notices: [], stderr: '',
    })
  }

  const argv = [cli, ...args]
  // 会话公共参数（skill 要求：同对话复用同一 session-id）
  if (!argv.includes('--session-id')) {
    argv.push('--session-id', getSessionId())
  }
  if (!argv.includes('--session-input') && options.sessionInput) {
    argv.push('--session-input', String(options.sessionInput).slice(0, 200))
  }

  const runner = nodeRunner()
  const env = { ...process.env, ...runner.env }
  // CLI 会校验「当前 Agent 环境」：至少要能读到 DSH_HOME 或 DSH_SESSION_ID，
  // 否则返回 {"code":-104,"msg":"无法识别当前 Agent 环境，禁止继续使用"}。
  // Host 进程的 env 不一定带这些变量，这里补齐。
  if (!env.DSH_HOME) env.DSH_HOME = dshHome()
  if (!env.DSH_SESSION_ID) env.DSH_SESSION_ID = getSessionId()

  // 子进程输出走临时文件而不是管道：既不受 DSH 沙箱对 piped stdio 的限制，
  // 也能容纳 browse --all 这类较大的 NDJSON 输出。
  const stamp = Date.now() + '-' + Math.random().toString(36).slice(2, 8)
  const outFile = path.join(workDir(), 'cli-' + stamp + '.out.ndjson')
  const errFile = path.join(workDir(), 'cli-' + stamp + '.err.log')

  let outFd = null
  let errFd = null
  try {
    outFd = fs.openSync(outFile, 'w')
    errFd = fs.openSync(errFile, 'w')
  } catch (e) {
    return Promise.resolve({
      ok: false, code: -1, action: (args[0] || ''), data: {},
      msg: '创建临时输出文件失败：' + e.message,
      lists: [], artifacts: [], notices: [], stderr: '',
    })
  }

  const closeFds = () => {
    try { if (outFd !== null) fs.closeSync(outFd) } catch { /* ignore */ }
    try { if (errFd !== null) fs.closeSync(errFd) } catch { /* ignore */ }
    outFd = null
    errFd = null
  }

  const readFileSafe = (p) => {
    try { return fs.readFileSync(p, 'utf8') } catch { return '' }
  }

  const cleanFiles = () => {
    try { fs.unlinkSync(outFile) } catch { /* ignore */ }
    try { fs.unlinkSync(errFile) } catch { /* ignore */ }
  }

  return new Promise((resolve) => {
    let child
    try {
      child = spawn(runner.cmd, argv, {
        cwd: options.cwd || workDir(),
        env,
        windowsHide: true,
        stdio: ['ignore', outFd, errFd],
      })
    } catch (e) {
      closeFds()
      cleanFiles()
      resolve({
        ok: false, code: -1, action: (args[0] || ''), data: {},
        msg: '启动 CLI 失败：' + e.message,
        lists: [], artifacts: [], notices: [], stderr: '',
      })
      return
    }

    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      try { child.kill() } catch { /* ignore */ }
    }, options.timeoutMs || CLI_TIMEOUT_MS)

    const finish = (exitCode) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      closeFds()

      const stdout = readFileSafe(outFile)
      const stderr = readFileSafe(errFile)
      cleanFiles()
      const lines = stdout.split(/\r?\n/).filter((l) => l.trim())

      let result = null
      const lists = []
      const artifacts = []
      const notices = []

      for (const line of lines) {
        let obj
        try { obj = JSON.parse(line) } catch { continue }
        if (!obj || typeof obj !== 'object') continue
        if (obj.type === 'result') result = obj
        else if (obj.type === 'list') lists.push(obj)
        else if (obj.type === 'artifact') artifacts.push(obj)
        else if (obj.type === 'progress') continue
        if (obj.notice && obj.notice.text) notices.push(String(obj.notice.text))
      }

      if (!result) {
        // 没拿到 type:"result" 行。常见两种情况：
        //   a) 命令被超时杀掉（progress 还在刷，但没有结论）
        //   b) CLI 崩在启动阶段，stderr 才有信息
        // 既不要把 progress 行当错误原文抛给用户，也不要吞掉它。
        const lastProgress = lines.slice().reverse().find((l) => l.indexOf('"progress"') >= 0) || ''
        let retry = 0
        const m = lastProgress.match(/"retry"\s*:\s*(\d+)/)
        if (m) retry = Number(m[1]) || 0
        const timedOut = retry > 0
        resolve({
          ok: false,
          code: timedOut ? -1507 : (exitCode || -1),
          action: (args[0] || ''),
          data: {},
          msg: timedOut
            ? '夸克 AI 助手还没答完就被中断了（已轮询 ' + retry + ' 次）'
            : (stderr.trim().slice(0, 500) || 'CLI 未返回结果'),
          lists, artifacts, notices, stderr: stderr.trim(),
        })
        return
      }

      resolve({
        ok: result.code === 0,
        code: typeof result.code === 'number' ? result.code : (exitCode ? -1 : 0),
        action: result.action || (args[0] || ''),
        msg: result.msg || '',
        data: result.data || {},
        lists, artifacts, notices, stderr: stderr.trim(),
      })
    }

    child.on('error', (e) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      closeFds()
      cleanFiles()
      resolve({
        ok: false, code: -1, action: (args[0] || ''), data: {},
        msg: '执行 CLI 出错：' + e.message,
        lists: [], artifacts: [], notices: [], stderr: '',
      })
    })
    child.on('close', (code) => finish(code))
  })
}

// ── 业务封装 ──────────────────────────────────────────────────────────────
function errText(r) {
  const bits = [r.msg || '操作失败']
  if (r.code === -1408) bits.push('（需要在面板里点「登录授权」，或让 agent 调用 quark_login）')
  // 夸克 AI 助手的几个专属错误码，直接给可操作的下一步，别让用户对着错误码猜
  if (r.code === -1501) {
    bits.push('（夸克上游 AI 服务这一次没接单，通常是服务端临时问题：过几分钟再试。也可以改用面板上的「AI 总结」按钮，让对话里的 agent 直接汇总）')
  } else if (r.code === -1505) {
    bits.push('（这几个文件夸克还在后台解析，通常要等约 24 小时后再问）')
  } else if (r.code === -1506) {
    bits.push('（单次最多 100 个 FID，请分批）')
  } else if (r.code === -1507) {
    bits.push('（夸克助手 5 分钟内没答完：减少文件数量，或缩小到一个文件夹再试）')
  } else if (r.code === -1502 || r.code === -1503) {
    bits.push('（助手任务失败，可稍后重试或缩小范围）')
  }
  for (const n of r.notices || []) bits.push(n)
  return bits.join('\n')
}

/** browse：CLI 需要 --task-dir 目录已存在，之后读 artifact JSONL 拿完整列表 */
async function browse(parentFid, pageSize, all) {
  const stamp = Date.now() + '-' + Math.random().toString(36).slice(2, 8)
  const taskDir = path.join(workDir(), 'browse-' + stamp)
  fs.mkdirSync(taskDir, { recursive: true })

  const args = ['browse', '--parent-fid', String(parentFid || '0'), '--task-dir', taskDir]
  if (all) args.push('--all')
  else args.push('--page-size', String(Math.min(100, Math.max(1, Number(pageSize) || 100))))

  const r = await runCli(args, { sessionInput: '浏览夸克网盘目录' })
  if (!r.ok) return { ok: false, error: errText(r), code: r.code }

  const filePath = r.data && r.data.file_path
  let files = []
  if (filePath) {
    try {
      const text = fs.readFileSync(filePath, 'utf8')
      files = text.split(/\r?\n/).filter((l) => l.trim()).map((l) => {
        try { return JSON.parse(l) } catch { return null }
      }).filter(Boolean)
    } catch (e) {
      return { ok: false, error: '读取浏览结果失败：' + e.message }
    }
  }

  return {
    ok: true,
    parentFid: r.data.parent_fid || String(parentFid || '0'),
    count: files.length,
    hasMore: !!r.data.hasMore,
    files: files.map(normalizeFile),
    notices: r.notices,
  }
}

function normalizeFile(f) {
  return {
    fid: f.fid,
    parentFid: f.parent_fid,
    name: f.filename,
    size: typeof f.size === 'number' ? f.size : null,
    category: typeof f.category === 'number' ? f.category : null,
    categoryText: f.obj_category || categoryName(f.category),
    isFolder: f.file_type === 0 || f.category === 0,
    fileType: f.file_type,
    updatedAt: f.updated_at || null,
    createdAt: f.created_at || null,
    includeItems: f.includeItems,
    source: f.source_display || null,
    thumbnail: f.big_thumbnail || null,
    checkLink: f.check_link || null,
  }
}

function categoryName(c) {
  return ['文件夹', '视频', '音频', '图片', '文档', '种子', '其他', '压缩包', '应用'][c] || '文件'
}

async function search(keyword, opts = {}) {
  const args = ['search', '--keyword', String(keyword).slice(0, 50)]
  if (opts.parentFid) args.push('--parent-fid', String(opts.parentFid))
  if (opts.searchType) args.push('--search-type', String(opts.searchType))
  args.push('--size', String(Math.min(100, Math.max(1, Number(opts.size) || 50))))
  if (opts.stdoutOnly) args.push('--stdout-only')

  const r = await runCli(args, { sessionInput: '搜索夸克网盘：' + keyword })
  if (!r.ok) return { ok: false, error: errText(r), code: r.code }

  // 完整结果在 artifact 里；预览在 result.data.file_list
  let files = []
  const artifact = (r.artifacts || []).find((a) => a.data && a.data.file_path)
  if (artifact) {
    try {
      const text = fs.readFileSync(artifact.data.file_path, 'utf8')
      files = text.split(/\r?\n/).filter((l) => l.trim()).map((l) => {
        try { return JSON.parse(l) } catch { return null }
      }).filter(Boolean)
    } catch { /* 落到预览 */ }
  }
  if (!files.length && Array.isArray(r.data.file_list)) {
    files = r.data.file_list
  }

  return {
    ok: true,
    keyword,
    count: files.length,
    total: r.data.total,
    files: files.map(normalizeFile),
    checkAllLink: r.data.check_all_link || null,
    browseHint: r.data.browse_hint || null,
    notices: r.notices,
  }
}

async function account() {
  const r = await runCli(['get-user-info'], { sessionInput: '查看夸克网盘账号信息' })
  if (!r.ok) return { ok: false, error: errText(r), code: r.code, needLogin: r.code === -1408 }
  const d = r.data || {}
  return {
    ok: true,
    nickname: (d.userInfo && d.userInfo.nickname) || '',
    vipType: (d.vipInfo && d.vipInfo.vipType) || '',
    used: (d.vipInfo && d.vipInfo.used) || 0,
    capacity: (d.vipInfo && d.vipInfo.capacity) || 0,
    expiresAt: (d.vipInfo && d.vipInfo.expiresIn) || 0,
    notices: r.notices,
  }
}

// ── 工具输出格式 ──────────────────────────────────────────────────────────
function textOutput() {
  return {
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: { text: { type: 'string' } },
    },
    render: (_args, value) => [{ type: 'text', text: (value && value.text) || '' }],
  }
}

function jsonText(obj) {
  return { text: JSON.stringify(obj, null, 2) }
}

function withNotices(payload, notices) {
  if (!notices || !notices.length) return payload
  payload.notice = notices.join('\n')
  payload['notice_instruction'] = 'result.notice 是 CLI 返回的提示原文，必须原样另起一段展示给用户。'
  return payload
}

// ── 插件主体 ──────────────────────────────────────────────────────────────
let lastInjectedAt = 0
let accountCache = { at: 0, text: null }

module.exports = {
  name: 'dsh-quark',
  inject: ['tools', 'agents'],

  apply(ctx) {
    const register = (def) => ctx.tools.register({
      name: def.name,
      description: def.description,
      parameters: {
        type: 'object',
        properties: def.parameters || {},
        ...(def.required && def.required.length ? { required: def.required } : {}),
      },
      output: textOutput(),
      execute: def.execute,
    })

    // ── 工具 0：环境自检（装没装、能不能用）──
    register({
      name: 'quark_check_env',
      description: '检查夸克网盘环境是否就绪：官方 Skill 是否已安装、CLI 路径、版本、账号是否已授权。用户问"夸克网盘能不能用""装好没有""为什么没反应"时先调它。',
      parameters: {},
      async execute() {
        const cli = resolveCli()
        const ver = skillVersion()
        if (!cli) {
          return jsonText({
            ok: false,
            ready: false,
            reason: 'missing_skill',
            skillDir: skillDir(),
            installScript: installScript(),
            message: '还没装夸克网盘官方 Skill。装法：在对话里说「请安装 夸克网盘 Skill，并授权账号」，'
              + '或手动跑 bash "' + installScript() + '"。装好后会自动变成可用，不需要重装本插件。',
          })
        }
        const acc = await account()
        return jsonText(withNotices({
          ok: true,
          ready: !!acc.ok,
          skillInstalled: true,
          skillVersion: ver,
          cliPath: cli,
          skillDir: skillDir(),
          authorized: !!acc.ok,
          needLogin: !!acc.needLogin,
          nickname: acc.ok ? acc.nickname : null,
          vipType: acc.ok ? acc.vipType : null,
          message: acc.ok
            ? '环境就绪，可以直接操作网盘。'
            : 'Skill 已装好，但账号还没授权。让用户跑 quark_login，或在面板里点「登录授权」。',
        }, acc.notices || []))
      },
    })

    // ── 工具 1：账号信息 ──
    register({
      name: 'quark_get_user_info',
      description: '查看当前夸克网盘账号信息（昵称、会员类型、容量与到期时间）。用户问"我的夸克网盘""还剩多少空间""会员什么时候到期"时使用。',
      parameters: {},
      async execute() {
        const r = await account()
        if (!r.ok) return jsonText({ ok: false, error: r.error, needLogin: !!r.needLogin })
        return jsonText(withNotices({
          ok: true,
          nickname: r.nickname,
          vipType: r.vipType,
          usedBytes: r.used,
          usedText: humanBytes(r.used),
          capacityBytes: r.capacity,
          capacityText: humanBytes(r.capacity),
          expiresAt: r.expiresAt || null,
        }, r.notices))
      },
    })

    // ── 工具 2：浏览目录 ──
    register({
      name: 'quark_list_files',
      description: '列出夸克网盘某个目录的直接子项（不递归）。parent_fid 传 "0" 表示根目录；不传时按根目录处理。需要子目录 FID 时先用 quark_search 的 search_type="dir" 定位。',
      parameters: {
        parent_fid: { type: 'string', description: '目录 FID，"0" 表示根目录' },
        page_size: { type: 'integer', description: '单页条数 1-100，默认 100' },
        all: { type: 'boolean', description: '是否取该目录全部直接子项（自动分页）' },
      },
      async execute(args) {
        const r = await browse((args && args.parent_fid) || '0', (args && args.page_size) || 100, !!(args && args.all))
        if (!r.ok) return jsonText({ ok: false, error: r.error })
        return jsonText(withNotices({
          ok: true, parentFid: r.parentFid, count: r.count, hasMore: r.hasMore,
          files: r.files.map(compactFile),
        }, r.notices))
      },
    })

    // ── 工具 3：搜索 ──
    register({
      name: 'quark_search',
      description: '按关键词搜索夸克网盘文件（不是列目录）。找文件夹必须传 search_type="dir"。搜索无结果是正常结果，不要换词重搜。',
      parameters: {
        keyword: { type: 'string', description: '搜索关键词，最长 50 字符，保留用户原话里的主题与类型词' },
        parent_fid: { type: 'string', description: '可选，限定在该目录内搜索' },
        search_type: {
          type: 'string',
          description: 'mix / video / album / doc / audio / dir / package / other / app，默认 mix',
        },
        size: { type: 'integer', description: '单页条数 1-100，默认 50' },
      },
      required: ['keyword'],
      async execute(args) {
        if (!args || !args.keyword) return jsonText({ ok: false, error: '缺少 keyword' })
        const r = await search(args.keyword, {
          parentFid: args.parent_fid, searchType: args.search_type, size: args.size,
        })
        if (!r.ok) return jsonText({ ok: false, error: r.error })
        return jsonText(withNotices({
          ok: true, keyword: r.keyword, count: r.count, total: r.total,
          files: r.files.map(compactFile),
          checkAllLink: r.checkAllLink, browseHint: r.browseHint,
        }, r.notices))
      },
    })

    // ── 工具 4：新建文件夹 ──
    register({
      name: 'quark_create_folder',
      description: '在夸克网盘指定目录下新建文件夹。用户没指定位置时不要自动传 parent_fid（不传会建在平台默认目录，不是根目录）。',
      parameters: {
        dir_path: { type: 'string', description: '文件夹名或路径' },
        parent_fid: { type: 'string', description: '父目录 FID，用户明确说"建在根目录"时传 "0"' },
      },
      required: ['dir_path'],
      async execute(args) {
        if (!args || !args.dir_path) return jsonText({ ok: false, error: '缺少 dir_path' })
        const argv = ['create-folder', '--dir-path', String(args.dir_path)]
        if (args.parent_fid) argv.push('--parent-fid', String(args.parent_fid))
        const r = await runCli(argv, { sessionInput: '在夸克网盘新建文件夹：' + args.dir_path })
        if (!r.ok) return jsonText({ ok: false, error: errText(r) })
        return jsonText(withNotices({ ok: true, fid: r.data.fid, fullPath: r.data.full_path || null }, r.notices))
      },
    })

    // ── 工具 5：移动 ──
    register({
      name: 'quark_move',
      description: '把夸克网盘上的文件/文件夹移动到目标目录，单次最多 100 个 FID。执行前必须向用户确认目标目录。',
      parameters: {
        fids: { type: 'array', items: { type: 'string' }, description: '要移动的 FID 列表' },
        target_fid: { type: 'string', description: '目标目录 FID' },
      },
      required: ['fids', 'target_fid'],
      async execute(args) {
        if (!args || !Array.isArray(args.fids) || !args.fids.length) return jsonText({ ok: false, error: '缺少 fids' })
        if (!args.target_fid) return jsonText({ ok: false, error: '缺少 target_fid' })
        const r = await runCli(['move', ...args.fids.map(String), '--target-fid', String(args.target_fid)],
          { sessionInput: '移动夸克网盘文件' })
        if (!r.ok) return jsonText({ ok: false, error: errText(r) })
        return jsonText(withNotices({
          ok: true, fids: r.data.fids || args.fids, targetFid: r.data.targetFid || args.target_fid,
          movePath: r.data.move_path || null,
        }, r.notices))
      },
    })

    // ── 工具 6：分享 ──
    register({
      name: 'quark_share',
      description: '为夸克网盘文件创建分享链接。url_type=2 是私密链接，提取码由服务端自动生成并从 data.passcode 返回。',
      parameters: {
        fids: { type: 'array', items: { type: 'string' }, description: '要分享的 FID 列表' },
        title: { type: 'string', description: '分享标题' },
        url_type: { type: 'integer', description: '1=公开链接（默认），2=私密链接' },
        expired_type: { type: 'integer', description: '1=永久(默认) 2=1天 3=7天 4=30天 5=60天 6=100天 7=180天' },
      },
      required: ['fids'],
      async execute(args) {
        if (!args || !Array.isArray(args.fids) || !args.fids.length) return jsonText({ ok: false, error: '缺少 fids' })
        const argv = ['share', ...args.fids.map(String)]
        if (args.title) argv.push('--title', String(args.title))
        if (args.url_type) argv.push('--url-type', String(args.url_type))
        if (args.expired_type) argv.push('--expired-type', String(args.expired_type))
        const r = await runCli(argv, { sessionInput: '分享夸克网盘文件' })
        if (!r.ok) return jsonText({ ok: false, error: errText(r) })
        return jsonText(withNotices({
          ok: true, shareUrl: r.data.share_url || null, passcode: r.data.passcode || null,
        }, r.notices))
      },
    })

    // ── 工具 7：下载 ──
    register({
      name: 'quark_download',
      description: '把夸克网盘文件下载到本机（支持断点续传）。output_dir 不传时下载到系统「下载」文件夹。',
      parameters: {
        fid: { type: 'string', description: '文件 FID' },
        output_dir: { type: 'string', description: '本机输出目录绝对路径；不传则用系统下载文件夹' },
        overwrite: { type: 'boolean', description: '同名文件是否覆盖（默认自动重命名）' },
      },
      required: ['fid'],
      async execute(args) {
        if (!args || !args.fid) return jsonText({ ok: false, error: '缺少 fid' })
        const outDir = args.output_dir || downloadsDir()
        const argv = ['download', '--fid', String(args.fid), '--output-dir', String(outDir)]
        if (args.overwrite) argv.push('--overwrite')
        const r = await runCli(argv, { sessionInput: '下载夸克网盘文件', timeoutMs: 600000 })
        if (!r.ok) return jsonText({ ok: false, error: errText(r) })
        return jsonText(withNotices({ ok: true, outputDir: outDir, data: r.data }, r.notices))
      },
    })

    // ── 工具 8：上传 ──
    register({
      name: 'quark_upload',
      description: '把本机文件/文件夹上传到夸克网盘。parent_fid 是目标目录，用户未明确指定时不要自动填 "0"。',
      parameters: {
        paths: { type: 'array', items: { type: 'string' }, description: '本机文件/文件夹绝对路径列表' },
        parent_fid: { type: 'string', description: '目标目录 FID；用户未明确指定时不要传' },
      },
      required: ['paths'],
      async execute(args) {
        if (!args || !Array.isArray(args.paths) || !args.paths.length) return jsonText({ ok: false, error: '缺少 paths' })
        const argv = ['upload', ...args.paths.map(String)]
        if (args.parent_fid) argv.push('--parent-fid', String(args.parent_fid))
        const r = await runCli(argv, { sessionInput: '上传文件到夸克网盘', timeoutMs: 1800000 })
        if (!r.ok) return jsonText({ ok: false, error: errText(r) })
        return jsonText(withNotices({ ok: true, data: r.data }, r.notices))
      },
    })

    // ── 工具 9：批量重命名 ──
    register({
      name: 'quark_rename',
      description: '按确认批次批量重命名夸克网盘文件（1~5000 条/批，30 天内可用原批次 ID 撤销）。执行前必须已向用户确认改名清单。',
      parameters: {
        batch_id: { type: 'string', description: '16 位十六进制批次 ID；首次可省略由 CLI 生成，撤销时用同一 ID' },
        items_file: { type: 'string', description: '重命名 items JSON 文件路径（{"schema_version":1,"items":[{fid,old_name,new_name}]}）' },
        revert: { type: 'boolean', description: 'true 表示撤销该批次的改名（rename-revert）' },
      },
      required: ['items_file'],
      async execute(args) {
        if (!args || !args.items_file) return jsonText({ ok: false, error: '缺少 items_file' })
        if (args.revert) {
          if (!args.batch_id) return jsonText({ ok: false, error: '撤销需要 batch_id' })
          const rv = await runCli(['rename-revert', '--batch-id', String(args.batch_id)],
            { sessionInput: '撤销批量重命名', timeoutMs: 600000 })
          if (!rv.ok) return jsonText({ ok: false, error: errText(rv) })
          return jsonText(withNotices({ ok: true, reverted: true, data: rv.data }, rv.notices))
        }
        const argv = ['rename', '--items-file', String(args.items_file)]
        if (args.batch_id) argv.push('--batch-id', String(args.batch_id))
        const r = await runCli(argv, { sessionInput: '批量重命名网盘文件', timeoutMs: 900000 })
        if (!r.ok) return jsonText({ ok: false, error: errText(r) })
        return jsonText(withNotices({ ok: true, data: r.data }, r.notices))
      },
    })

    // ── 工具 10：相册整理 ──
    register({
      name: 'quark_organize_album',
      description: '相册整理：按人脸/地点/场景等智能挑选并归类照片与视频（自然语言指令，一次传入完整指令）。只处理媒体，不处理文档；用户要「移动」文件时不要用这个。',
      parameters: {
        query: { type: 'string', description: '完整整理指令，含范围 + 分类方式 + 限制条件' },
        confirm: { type: 'string', description: '文件过多需二次确认时传 copy 或 move，配合 task_id' },
        task_id: { type: 'string', description: '二次确认时的任务 ID（organize 返回的 data.task_id）' },
      },
      required: ['query'],
      async execute(args) {
        if (args && args.confirm) {
          if (!args.task_id) return jsonText({ ok: false, error: '确认整理需要 task_id' })
          const cmd = args.confirm === 'move' ? 'organize-move' : 'organize-copy'
          const rc = await runCli([cmd, '--task-id', String(args.task_id)],
            { sessionInput: '确认相册整理方式', timeoutMs: 600000 })
          if (!rc.ok) return jsonText({ ok: false, error: errText(rc) })
          return jsonText(withNotices({ ok: true, data: rc.data }, rc.notices))
        }
        if (!args || !args.query) return jsonText({ ok: false, error: '缺少 query' })
        const r = await runCli(['organize', '--query', String(args.query)],
          { sessionInput: '相册整理：' + args.query, timeoutMs: 300000 })
        if (!r.ok) {
          return jsonText({
            ok: false, error: errText(r), code: r.code, taskId: (r.data && r.data.task_id) || null,
            needConfirm: r.code === -1609,
          })
        }
        return jsonText(withNotices({ ok: true, data: r.data }, r.notices))
      },
    })

    // ── 工具 11：整批归类（file-organize 四步） ──
    register({
      name: 'quark_organize_files',
      description: '整批归类：按方案新建目录并移动/改名文件，带预览指纹与 30 天撤回。四步：init(建任务目录) → check(校验方案+预览) → apply(执行) → undo(撤回)。写操作只能走 apply。',
      parameters: {
        step: { type: 'string', description: 'init / check / apply / undo' },
        base_dir: { type: 'string', description: 'init 用：工作目录绝对路径，任务记录写在这里' },
        task_dir: { type: 'string', description: 'check/apply/undo 用：init 返回的 task_dir' },
        proposal_file: { type: 'string', description: 'check/apply 用：方案 JSON 路径' },
        digest: { type: 'string', description: 'apply 用：check 返回的 preview.plan_digest' },
        resume: { type: 'boolean', description: 'apply/undo 中断后接续' },
      },
      required: ['step'],
      async execute(args) {
        const step = args && args.step
        const argv = ['file-organize', String(step)]
        if (step === 'init') {
          if (!args.base_dir) return jsonText({ ok: false, error: 'init 需要 base_dir' })
          argv.push('--base-dir', String(args.base_dir))
        } else if (step === 'check') {
          if (!args.task_dir || !args.proposal_file) return jsonText({ ok: false, error: 'check 需要 task_dir 与 proposal_file' })
          argv.push('--task-dir', String(args.task_dir), '--proposal-file', String(args.proposal_file))
        } else if (step === 'apply') {
          if (!args.task_dir) return jsonText({ ok: false, error: 'apply 需要 task_dir' })
          argv.push('--task-dir', String(args.task_dir))
          if (args.resume) {
            argv.push('--resume')
          } else {
            if (!args.proposal_file || !args.digest) return jsonText({ ok: false, error: 'apply 需要 proposal_file 与 digest' })
            argv.push('--proposal-file', String(args.proposal_file), '--digest', String(args.digest))
          }
        } else if (step === 'undo') {
          if (!args.task_dir) return jsonText({ ok: false, error: 'undo 需要 task_dir' })
          argv.push('--task-dir', String(args.task_dir))
          if (args.resume) argv.push('--resume')
        } else {
          return jsonText({ ok: false, error: 'step 只能是 init / check / apply / undo' })
        }
        const r = await runCli(argv, { sessionInput: '整批归类网盘文件', timeoutMs: 900000 })
        if (!r.ok) return jsonText({ ok: false, error: errText(r), data: r.data })
        return jsonText(withNotices({ ok: true, data: r.data }, r.notices))
      },
    })

    // ── 工具 8：AI 总结 ──
    register({
      name: 'quark_summary',
      description: '用夸克网盘 AI 助手总结指定文件内容。fid_list 单次最多 100 个 FID。',
      parameters: {
        query: { type: 'string', description: '提问语句' },
        fid_list: { type: 'array', items: { type: 'string' }, description: '文件或文件夹 FID 列表，单次 ≤100' },
      },
      required: ['query', 'fid_list'],
      async execute(args) {
        if (!args || !args.query) return jsonText({ ok: false, error: '缺少 query' })
        if (!Array.isArray(args.fid_list) || !args.fid_list.length) return jsonText({ ok: false, error: '缺少 fid_list' })
        if (args.fid_list.length > 100) return jsonText({ ok: false, error: 'fid_list 单次最多 100 个' })
        const r = await runCli(['summary', '--query', String(args.query), '--fid-list', args.fid_list.map(String).join(',')],
          { sessionInput: '让夸克 AI 助手总结文件' })
        if (!r.ok) return jsonText({ ok: false, error: errText(r) })
        return jsonText(withNotices({ ok: true, data: r.data }, r.notices))
      },
    })

    // ── 工具 9：AI 问答 ──
    register({
      name: 'quark_qa',
      description: '就指定文件向夸克网盘 AI 助手提问。fid_list 单次最多 100 个 FID。',
      parameters: {
        query: { type: 'string', description: '问题' },
        fid_list: { type: 'array', items: { type: 'string' }, description: '文件或文件夹 FID 列表，单次 ≤100' },
      },
      required: ['query', 'fid_list'],
      async execute(args) {
        if (!args || !args.query) return jsonText({ ok: false, error: '缺少 query' })
        if (!Array.isArray(args.fid_list) || !args.fid_list.length) return jsonText({ ok: false, error: '缺少 fid_list' })
        if (args.fid_list.length > 100) return jsonText({ ok: false, error: 'fid_list 单次最多 100 个' })
        const r = await runCli(['qa', '--query', String(args.query), '--fid-list', args.fid_list.map(String).join(',')],
          { sessionInput: '就夸克网盘文件提问' })
        if (!r.ok) return jsonText({ ok: false, error: errText(r) })
        return jsonText(withNotices({ ok: true, data: r.data }, r.notices))
      },
    })

    // ── 工具 10：登录 ──
    register({
      name: 'quark_login',
      description: '启动夸克网盘登录授权（会打开浏览器，命令阻塞等待授权完成或超时）。只有在用户明确要求登录、或已有命令返回未授权并已向用户说明后才调用。',
      parameters: {
        token: { type: 'string', description: '可选：用户提供的 agent_auth_code，跳过浏览器授权流程' },
      },
      async execute(args) {
        const argv = ['login']
        if (args && args.token) argv.push('--token', String(args.token))
        const r = await runCli(argv, { sessionInput: '登录夸克网盘', timeoutMs: 300000 })
        if (!r.ok) return jsonText({ ok: false, error: errText(r) })
        return jsonText(withNotices({
          ok: true,
          status: r.data.status || null,
          message: r.data.msg || r.msg,
          vipUrl: r.data.skill_vip_url || null,
        }, r.notices))
      },
    })

    // ── 不做 agent/pre-step 注入 ──
    // 用户明确要求：不要在每轮对话里主动查网盘或注入账号快照，只有用户真的提到网盘时
    // 才由 agent 调用上面的工具去查。刻意保留这一段注释，避免以后又被加回去。

    // ── HTTP 路由 ──
    const sendJson = (res, obj, status = 200) => {
      const body = JSON.stringify(obj)
      res.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      })
      res.end(body)
    }

    const readBody = (req) => new Promise((resolve) => {
      const chunks = []
      req.on('data', (c) => chunks.push(c))
      req.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8')
        if (!raw) return resolve({})
        try { resolve(JSON.parse(raw)) } catch { resolve({}) }
      })
      req.on('error', () => resolve({}))
    })

    const routes = {
      '/api/quark/status': async () => {
        const cli = resolveCli()
        const acc = await account()
        return {
          ok: true,
          cliFound: !!cli,
          cliPath: cli,
          skillDir: skillDir(),
          installScript: installScript(),
          skillVersion: skillVersion(),
          bound: !!acc.ok,
          needLogin: !!acc.needLogin,
          account: acc.ok ? {
            nickname: acc.nickname,
            vipType: acc.vipType,
            used: acc.used,
            capacity: acc.capacity,
            usedText: humanBytes(acc.used),
            capacityText: humanBytes(acc.capacity),
            expiresAt: acc.expiresAt,
          } : null,
          error: acc.ok ? null : acc.error,
          caps: ['browse', 'search', 'mkdir', 'move', 'share', 'download', 'upload', 'rename', 'organize', 'summary', 'qa', 'login'],
        }
      },

      '/api/quark/browse': async (req, url) => {
        const fid = url.searchParams.get('fid') || '0'
        const size = Number(url.searchParams.get('size')) || 100
        const all = url.searchParams.get('all') === '1'
        return browse(fid, size, all)
      },

      '/api/quark/search': async (req, url) => {
        const keyword = url.searchParams.get('keyword') || ''
        if (!keyword) return { ok: false, error: '缺少 keyword' }
        return search(keyword, {
          parentFid: url.searchParams.get('fid') || undefined,
          searchType: url.searchParams.get('type') || undefined,
          size: Number(url.searchParams.get('size')) || 50,
        })
      },

      '/api/quark/mkdir': async (req) => {
        const body = await readBody(req)
        if (!body.dirPath) return { ok: false, error: '缺少 dirPath' }
        const argv = ['create-folder', '--dir-path', String(body.dirPath)]
        if (body.parentFid) argv.push('--parent-fid', String(body.parentFid))
        const r = await runCli(argv, { sessionInput: '新建文件夹：' + body.dirPath })
        if (!r.ok) return { ok: false, error: errText(r) }
        return { ok: true, fid: r.data.fid, fullPath: r.data.full_path || null, notices: r.notices }
      },

      '/api/quark/move': async (req) => {
        const body = await readBody(req)
        if (!Array.isArray(body.fids) || !body.fids.length) return { ok: false, error: '缺少 fids' }
        if (!body.targetFid) return { ok: false, error: '缺少 targetFid' }
        const r = await runCli(['move', ...body.fids.map(String), '--target-fid', String(body.targetFid)],
          { sessionInput: '移动文件' })
        if (!r.ok) return { ok: false, error: errText(r) }
        return { ok: true, fids: r.data.fids || body.fids, movePath: r.data.move_path || null, notices: r.notices }
      },

      '/api/quark/share': async (req) => {
        const body = await readBody(req)
        if (!Array.isArray(body.fids) || !body.fids.length) return { ok: false, error: '缺少 fids' }
        const argv = ['share', ...body.fids.map(String)]
        if (body.title) argv.push('--title', String(body.title))
        if (body.urlType) argv.push('--url-type', String(body.urlType))
        if (body.expiredType) argv.push('--expired-type', String(body.expiredType))
        const r = await runCli(argv, { sessionInput: '分享文件' })
        if (!r.ok) return { ok: false, error: errText(r) }
        return { ok: true, shareUrl: r.data.share_url || null, passcode: r.data.passcode || null, notices: r.notices }
      },

      '/api/quark/download': async (req) => {
        const body = await readBody(req)
        if (!body.fid) return { ok: false, error: '缺少 fid' }
        const outDir = body.outputDir || downloadsDir()
        const argv = ['download', '--fid', String(body.fid), '--output-dir', String(outDir)]
        if (body.overwrite) argv.push('--overwrite')
        const r = await runCli(argv, { sessionInput: '下载文件', timeoutMs: 600000 })
        if (!r.ok) return { ok: false, error: errText(r) }
        return { ok: true, outputDir: outDir, data: r.data, notices: r.notices }
      },

      '/api/quark/upload': async (req) => {
        const body = await readBody(req)
        if (!Array.isArray(body.paths) || !body.paths.length) return { ok: false, error: '缺少 paths' }
        const argv = ['upload', ...body.paths.map(String)]
        if (body.parentFid) argv.push('--parent-fid', String(body.parentFid))
        const r = await runCli(argv, { sessionInput: '上传文件', timeoutMs: 1800000 })
        if (!r.ok) return { ok: false, error: errText(r) }
        return { ok: true, data: r.data, notices: r.notices }
      },

      '/api/quark/rename': async (req) => {
        const body = await readBody(req)
        if (body.revert) {
          if (!body.batchId) return { ok: false, error: '撤销需要 batchId' }
          const rv = await runCli(['rename-revert', '--batch-id', String(body.batchId)],
            { sessionInput: '撤销批量重命名', timeoutMs: 600000 })
          if (!rv.ok) return { ok: false, error: errText(rv) }
          return { ok: true, reverted: true, data: rv.data, notices: rv.notices }
        }
        // 面板传 items 数组，这里落成 CLI 需要的 items JSON 文件
        let itemsFile = body.itemsFile ? String(body.itemsFile) : null
        if (!itemsFile) {
          const items = Array.isArray(body.items) ? body.items : null
          if (!items || !items.length) return { ok: false, error: '缺少 items 或 itemsFile' }
          if (items.length > 5000) return { ok: false, error: '单批最多 5000 条' }
          itemsFile = path.join(workDir(), 'rename-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.json')
          try {
            fs.writeFileSync(itemsFile, JSON.stringify({ schema_version: 1, items }, null, 2), 'utf8')
          } catch (e) {
            return { ok: false, error: '写 items 文件失败：' + e.message }
          }
        }
        const argv = ['rename', '--items-file', String(itemsFile)]
        if (body.batchId) argv.push('--batch-id', String(body.batchId))
        const r = await runCli(argv, { sessionInput: '批量重命名', timeoutMs: 900000 })
        if (!r.ok) return { ok: false, error: errText(r) }
        return { ok: true, data: r.data, notices: r.notices }
      },

      '/api/quark/organize-album': async (req) => {
        const body = await readBody(req)
        if (body.confirm) {
          if (!body.taskId) return { ok: false, error: '确认整理需要 taskId' }
          const cmd = body.confirm === 'move' ? 'organize-move' : 'organize-copy'
          const rc = await runCli([cmd, '--task-id', String(body.taskId)],
            { sessionInput: '确认相册整理方式', timeoutMs: 600000 })
          if (!rc.ok) return { ok: false, error: errText(rc) }
          return { ok: true, data: rc.data, notices: rc.notices }
        }
        if (!body.query) return { ok: false, error: '缺少 query' }
        const r = await runCli(['organize', '--query', String(body.query)],
          { sessionInput: '相册整理', timeoutMs: 300000 })
        if (!r.ok) {
          return {
            ok: false, error: errText(r), code: r.code,
            taskId: (r.data && r.data.task_id) || null, needConfirm: r.code === -1609,
          }
        }
        return { ok: true, data: r.data, notices: r.notices }
      },

      '/api/quark/organize-files': async (req) => {
        const body = await readBody(req)
        const step = body.step
        const argv = ['file-organize', String(step)]
        if (step === 'init') {
          // 任务目录要放一个重启后还在的位置：默认在本机「文档/夸克整理记录」
          let baseDir = body.baseDir ? String(body.baseDir) : null
          if (!baseDir) {
            baseDir = path.join(os.homedir(), 'Documents', '夸克整理记录')
            try { fs.mkdirSync(baseDir, { recursive: true }) } catch { /* ignore */ }
          }
          argv.push('--base-dir', baseDir)
        } else if (step === 'check') {
          if (!body.taskDir || !body.proposalFile) return { ok: false, error: 'check 需要 taskDir 与 proposalFile' }
          argv.push('--task-dir', String(body.taskDir), '--proposal-file', String(body.proposalFile))
        } else if (step === 'apply') {
          if (!body.taskDir) return { ok: false, error: 'apply 需要 taskDir' }
          argv.push('--task-dir', String(body.taskDir))
          if (body.resume) argv.push('--resume')
          else {
            if (!body.proposalFile || !body.digest) return { ok: false, error: 'apply 需要 proposalFile 与 digest' }
            argv.push('--proposal-file', String(body.proposalFile), '--digest', String(body.digest))
          }
        } else if (step === 'undo') {
          if (!body.taskDir) return { ok: false, error: 'undo 需要 taskDir' }
          argv.push('--task-dir', String(body.taskDir))
          if (body.resume) argv.push('--resume')
        } else {
          return { ok: false, error: 'step 只能是 init / check / apply / undo' }
        }
        const r = await runCli(argv, { sessionInput: '整批归类', timeoutMs: 900000 })
        if (!r.ok) return { ok: false, error: errText(r), data: r.data }
        return { ok: true, data: r.data, notices: r.notices }
      },

      '/api/quark/summary': async (req) => {
        const body = await readBody(req)
        if (!body.query || !Array.isArray(body.fidList) || !body.fidList.length) {
          return { ok: false, error: '缺少 query 或 fidList' }
        }
        const r = await runCli(['summary', '--query', String(body.query), '--fid-list', body.fidList.slice(0, 100).join(',')],
          { sessionInput: 'AI 总结', timeoutMs: 420000 })
        if (!r.ok) return { ok: false, error: errText(r), code: r.code }
        const tb = (r.data && r.data.text_block) || {}
        return {
          ok: true,
          taskId: r.data && r.data.task_id,
          title: tb.title || null,
          subTitle: tb.sub_title || null,
          text: tb.text || '',
          reasoning: tb.reasoning_text || '',
          raw: r.data,
          notices: r.notices,
        }
      },

      '/api/quark/qa': async (req) => {
        const body = await readBody(req)
        if (!body.query || !Array.isArray(body.fidList) || !body.fidList.length) {
          return { ok: false, error: '缺少 query 或 fidList' }
        }
        const r = await runCli(['qa', '--query', String(body.query), '--fid-list', body.fidList.slice(0, 100).join(',')],
          { sessionInput: 'AI 问答', timeoutMs: 420000 })
        if (!r.ok) return { ok: false, error: errText(r), code: r.code }
        const tb = (r.data && r.data.text_block) || {}
        return {
          ok: true,
          taskId: r.data && r.data.task_id,
          title: tb.title || null,
          subTitle: tb.sub_title || null,
          text: tb.text || '',
          reasoning: tb.reasoning_text || '',
          raw: r.data,
          notices: r.notices,
        }
      },

      '/api/quark/login': async (req) => {
        const body = await readBody(req)
        const argv = ['login']
        if (body.token) argv.push('--token', String(body.token))
        const r = await runCli(argv, { sessionInput: '登录夸克网盘', timeoutMs: 300000 })
        accountCache = { at: 0, text: null }
        if (!r.ok) return { ok: false, error: errText(r), code: r.code }
        return {
          ok: true,
          status: r.data.status || null,
          message: r.data.msg || r.msg,
          vipUrl: r.data.skill_vip_url || null,
          notices: r.notices,
        }
      },

      '/api/quark/logout': async () => {
        const r = await runCli(['logout'], { sessionInput: '退出夸克网盘登录' })
        accountCache = { at: 0, text: null }
        if (!r.ok) return { ok: false, error: errText(r) }
        return { ok: true, notices: r.notices }
      },
    }

    ctx.inject(['webServer'], (webCtx) => {
      webCtx.effect(() => webCtx.webServer.register({
        path: '/api/quark',
        handler: async (req, res) => {
          let url
          try { url = new URL(req.url || '/', 'http://x') } catch { return sendJson(res, { ok: false, error: 'bad url' }, 400) }

          const fn = routes[url.pathname]
          if (!fn) {
            return sendJson(res, {
              ok: false,
              error: 'unknown_action',
              message: '这个接口不存在（' + url.pathname + '）。通常是插件更新后 DSH 还没重启，重启一下即可。',
            }, 404)
          }
          try {
            const result = await fn(req, url)
            return sendJson(res, result)
          } catch (e) {
            console.warn('[dsh-quark] 路由处理失败：', e.message)
            return sendJson(res, { ok: false, error: e.code || 'unknown', message: e.message })
          }
        },
      }), 'dsh-quark: /api/quark routes')

      console.log('[dsh-quark] HTTP 路由已注册：/api/quark/{status,browse,search,mkdir,move,share,download,summary,qa,login,logout}')
    })

    ctx.effect(() => {
      console.log('[dsh-quark] 插件已加载，CLI=' + (resolveCli() || '(未找到)'))
      return () => {
        accountCache = { at: 0, text: null }
        console.log('[dsh-quark] 插件卸载')
      }
    })
  },
}

// ── 工具函数 ──────────────────────────────────────────────────────────────
function humanBytes(n) {
  const v = Number(n) || 0
  if (!v) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  let i = 0
  let x = v
  while (x >= 1024 && i < units.length - 1) { x /= 1024; i++ }
  return (Math.round(x * 100) / 100) + ' ' + units[i]
}

function compactFile(f) {
  return {
    fid: f.fid,
    name: f.name,
    sizeText: f.isFolder ? (f.includeItems ? f.includeItems + ' 个文件' : '文件夹') : humanBytes(f.size),
    type: f.categoryText,
    isFolder: f.isFolder,
    updatedAt: f.updatedAt,
    checkLink: f.checkLink,
  }
}
