/**
 * dsh-quark — 浏览器半
 *
 * 两处注册：
 *   sidebar.panellist → 侧边栏「夸克网盘」图标（只能画图标，文字由侧边栏自己渲染）
 *   main             → key = dsh-quark 的主面板（账号头 + 面包屑浏览 + 搜索 + 文件操作）
 *
 * 所有数据来自 Host 半的 /api/quark/* 同源路由；这里不直接碰 CLI。
 */
window.__ModuleLoader__.load({
  id: 'dsh-quark',
  factory(require) {
    var react = require('react')
    var h = react.createElement

    var PANEL_ID = 'dsh-quark'
    var API = '/api/quark'
    // 右侧栏 tab 类型：id 与 kind 都用包名前缀，避免和别的插件撞。
    var TAB_ID = 'dsh-quark:drive'
    var TAB_KIND = 'dsh-quark-drive'

    // ── 样式 ──────────────────────────────────────────────────────────────
    var CSS = [
      '.dq-root{display:flex;flex-direction:column;height:100%;min-height:0;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:13px}',
      '.dq-head{display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid var(--dsw-alias-border-l1);flex:0 0 auto}',
      '.dq-avatar{width:32px;height:32px;border-radius:50%;background:var(--dsw-alias-bg-layer-2);display:flex;align-items:center;justify-content:center;color:var(--dsw-alias-label-secondary);flex:0 0 auto;font-weight:600}',
      '.dq-acct{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1 1 auto}',
      '.dq-name{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dq-meta{font-size:12px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dq-bar{display:flex;align-items:center;gap:8px;padding:8px 16px;border-bottom:1px solid var(--dsw-alias-border-l1);flex:0 0 auto;flex-wrap:wrap}',
      '.dq-crumbs{display:flex;align-items:center;gap:4px;flex:1 1 240px;min-width:0;overflow:hidden}',
      '.dq-crumb{background:none;border:0;padding:2px 6px;border-radius:6px;color:var(--dsw-alias-label-secondary);cursor:pointer;font:inherit;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dq-crumb:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',
      '.dq-crumb-last{color:var(--dsw-alias-label-primary);font-weight:600}',
      '.dq-sep{color:var(--dsw-alias-label-secondary);opacity:.6}',
      '.dq-search{display:flex;align-items:center;gap:6px}',
      '.dq-input{background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:8px;padding:5px 9px;color:var(--dsw-alias-label-primary);font:inherit;outline:none;min-width:150px}',
      '.dq-input:focus{border-color:var(--dsw-alias-brand-primary)}',
      '.dq-btn{background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:8px;padding:5px 10px;color:var(--dsw-alias-label-primary);font:inherit;cursor:pointer;white-space:nowrap}',
      '.dq-btn:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.dq-btn:disabled{opacity:.5;cursor:default}',
      '.dq-btn-p{background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-bg-base);font-weight:600}',
      '.dq-btn-p:hover{background:var(--dsw-alias-brand-primary);opacity:.9}',
      '.dq-body{flex:1 1 auto;min-height:0;overflow:auto}',
      '.dq-row{display:flex;align-items:center;gap:10px;padding:7px 16px;border-bottom:1px solid var(--dsw-alias-border-l1);cursor:default}',
      '.dq-row:hover{background:var(--dsw-alias-bg-layer-1)}',
      '.dq-row-sel{background:var(--dsw-alias-bg-layer-2)}',
      '.dq-check{flex:0 0 auto;accent-color:var(--dsw-alias-brand-primary)}',
      '.dq-ico{flex:0 0 auto;width:18px;height:18px;display:flex;align-items:center;justify-content:center;color:var(--dsw-alias-label-secondary)}',
      '.dq-fname{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dq-fname-dir{cursor:pointer}',
      '.dq-fname-dir:hover{color:var(--dsw-alias-brand-primary)}',
      '.dq-fsize{flex:0 0 auto;font-size:12px;color:var(--dsw-alias-label-secondary);white-space:nowrap}',
      '.dq-act{flex:0 0 auto;display:flex;align-items:center;gap:4px}',
      '.dq-actbtn{display:inline-flex;align-items:center;gap:4px;background:none;border:1px solid transparent;border-radius:7px;padding:2px 7px;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;cursor:pointer;white-space:nowrap}',
      '.dq-actbtn:hover{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-border-l1);color:var(--dsw-alias-label-primary)}',
      '.dq-actbtn-p{color:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-border-l1)}',
      '.dq-actbtn-p:hover{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}',
      '.dq-empty{padding:40px 16px;text-align:center;color:var(--dsw-alias-label-secondary)}',
      '.dq-err{margin:12px 16px;padding:10px 12px;border-radius:8px;border:1px solid var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary);background:var(--dsw-alias-bg-layer-1);white-space:pre-wrap}',
      '.dq-foot{display:flex;align-items:center;gap:8px;padding:8px 16px;border-top:1px solid var(--dsw-alias-border-l1);flex:0 0 auto;flex-wrap:wrap}',
      '.dq-sel{font-size:12px;color:var(--dsw-alias-label-secondary);margin-right:auto}',
      '.dq-toast{position:absolute;left:50%;bottom:64px;transform:translateX(-50%);background:var(--dsw-alias-bg-overlay);border:1px solid var(--dsw-alias-border-l2);border-radius:10px;padding:8px 14px;box-shadow:0 6px 24px rgba(0,0,0,.18);max-width:70%;white-space:pre-wrap;z-index:20}',
      '.dq-modal-mask{position:absolute;inset:0;background:rgba(0,0,0,.32);display:flex;align-items:center;justify-content:center;z-index:30}',
      '.dq-modal{background:var(--dsw-alias-bg-overlay);border:1px solid var(--dsw-alias-border-l2);border-radius:12px;padding:16px;width:min(460px,86%);display:flex;flex-direction:column;gap:10px;box-shadow:0 12px 40px rgba(0,0,0,.24)}',
      '.dq-modal-title{font-weight:600}',
      '.dq-modal-actions{display:flex;justify-content:flex-end;gap:8px}',
      '.dq-pre{margin:0;max-height:240px;overflow:auto;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:8px;padding:8px;font-size:12px;white-space:pre-wrap;word-break:break-word}',
      '.dq-textarea{background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:8px;padding:7px 9px;color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;outline:none;resize:vertical;min-height:60px;white-space:pre;font-family:inherit}',
      '.dq-textarea:focus{border-color:var(--dsw-alias-brand-primary)}',
      '.dq-hint{font-size:12px;color:var(--dsw-alias-label-secondary);line-height:1.5}',
      '.dq-link{color:var(--dsw-alias-brand-primary);word-break:break-all}',
      '.dq-spin{padding:24px 16px;text-align:center;color:var(--dsw-alias-label-secondary)}',
      '.dq-tabs{display:flex;gap:6px;padding:8px 16px 0;flex:0 0 auto}',
      '.dq-tab{background:none;border:0;border-bottom:2px solid transparent;padding:5px 8px;color:var(--dsw-alias-label-secondary);cursor:pointer;font:inherit}',
      '.dq-tab-on{color:var(--dsw-alias-label-primary);border-bottom-color:var(--dsw-alias-brand-primary);font-weight:600}',
      '.dq-set{display:flex;flex-direction:column;gap:10px}',
      '.dq-set-row{display:flex;align-items:center;gap:12px;padding:10px 12px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1)}',
      '.dq-set-text{display:flex;flex-direction:column;gap:3px;flex:1 1 auto;min-width:0}',
      '.dq-set-title{font-weight:600}',
      '.dq-set-desc{font-size:12px;color:var(--dsw-alias-label-secondary);line-height:1.5}',
      '.dq-set-plain{align-items:flex-start}',
      '.dq-thanks-title{font-weight:600;font-size:12px;color:var(--dsw-alias-label-secondary)}',
      '.dq-target{display:flex;flex-direction:column;gap:8px;min-height:0}',
      '.dq-mv{display:flex;flex-direction:column;gap:8px;min-height:0}',
      '.dq-mv-crumbs{display:flex;align-items:center;gap:2px;flex-wrap:wrap}',
      '.dq-mv-list{display:flex;flex-direction:column;max-height:240px;overflow:auto;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1)}',
      '.dq-mv-row{display:flex;align-items:center;gap:8px;background:none;border:0;border-bottom:1px solid var(--dsw-alias-border-l1);padding:7px 10px;color:var(--dsw-alias-label-primary);cursor:pointer;font:inherit;text-align:left}',
      '.dq-mv-row:last-child{border-bottom:0}',
      '.dq-mv-row:hover{background:var(--dsw-alias-bg-layer-2)}',
    ].join('\n')

    function injectStyle(tagId, css) {
      if (typeof document === 'undefined') return
      if (document.getElementById(tagId)) return
      var el = document.createElement('style')
      el.id = tagId
      el.setAttribute('data-plugin', PANEL_ID)
      el.setAttribute('data-plugin-css', '')
      el.textContent = css
      document.head.appendChild(el)
    }

    // ── 请求 ──────────────────────────────────────────────────────────────
    function api(path, opts) {
      opts = opts || {}
      var init = { method: opts.method || 'GET', headers: {} }
      if (opts.body !== undefined) {
        init.headers['content-type'] = 'application/json'
        init.body = JSON.stringify(opts.body)
      }
      return fetch(API + path, init).then(function (res) {
        return res.json().catch(function () {
          return { ok: false, error: 'HTTP ' + res.status }
        })
      }).catch(function (e) {
        return { ok: false, error: '请求失败：' + e.message }
      })
    }

    function fmtSize(text) {
      return text || ''
    }

    // ── 把文件引用到会话 ────────────────────────────────────────────────────
    // 剪贴板兜底：写输入框失败时至少让用户能粘贴。
    function fallbackCopy(text) {
      try {
        var ta = document.createElement('textarea')
        ta.value = text
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
        return true
      } catch (e) {
        return false
      }
    }

    function copyText(text) {
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(null, function () { fallbackCopy(text) })
          return true
        }
      } catch (e) { /* 走兜底 */ }
      return fallbackCopy(text)
    }

    // DSH 的对话输入框是 Lexical 受控编辑器，不是 textarea、也不是普通
    // contenteditable：直接改 DOM 会被它的受控状态覆盖（现象就是「提示已填入、
    // 界面上却没有内容」）。正确写法只有两条通道：
    //   A. 宿主公开的 inputActions（composer 工具行组件的 props）
    //        captureInsertion() -> { ...caretSpan, draftRev }
    //        insertText(text, span) -> boolean（可撤销的纯文本插入）
    //        setDraft(text) -> 整体替换草稿（会把已有引用 chip 摊平）
    //   B. conversation 服务：conversation.input.for(actx).setDraft(...)，
    //      或用 slash/input-insert-text 事件在保留 chip 的前提下追加
    // 两条都拿不到时退回静默复制。
    var composerBridge = { sessionId: null, inputActions: null, draft: '' }
    var clientCtx = null

    function draftLead(cur) {
      if (cur.trim() === '') return ''
      return /\s$/.test(cur) ? '' : ' '
    }

    function appendViaBridge(text) {
      var actions = composerBridge.inputActions
      if (!actions) return false
      try {
        if (typeof actions.insertText === 'function' && typeof actions.captureInsertion === 'function') {
          if (actions.insertText(text, actions.captureInsertion())) return true
        }
      } catch (e) { /* 退到 setDraft */ }
      try {
        if (typeof actions.setDraft === 'function') {
          var cur = composerBridge.draft || ''
          actions.setDraft(cur + draftLead(cur) + text)
          return true
        }
      } catch (e) { /* 退到服务通道 */ }
      return false
    }

    function appendViaService(text) {
      if (!clientCtx || !composerBridge.sessionId) return false
      try {
        var sessions = clientCtx.get('sessions')
        var conversation = clientCtx.get('conversation')
        if (!sessions || !conversation) return false
        var actx = sessions.scope(composerBridge.sessionId)
        if (!actx) return false
        var input = conversation.input.for(actx)
        if (!input || !input.state) return false
        var snap = input.state.getSnapshot()
        var draft = snap.draft || ''
        var occurrences = snap.occurrences || []
        var hasChips = occurrences.length > 0 || snap.phase === 'claimed'
        if (hasChips) {
          // setDraft 会把 chip 摊平，只能走宿主的内部插入事件。
          if (typeof snap.draftRev !== 'number') return false
          var at = snap.draft.length
          for (var i = 0; i < occurrences.length; i++) {
            var o = occurrences[i]
            if (at >= o.offset + o.length) at -= (o.length - 1)
            else if (at > o.offset) { at = o.offset + 1; break }
          }
          actx.emit('slash/input-insert-text', {
            text: draftLead(draft) + text,
            span: { draftRev: snap.draftRev, start: at, end: at },
          })
          return input.state.getSnapshot().draftRev !== snap.draftRev
        }
        input.setDraft(draft + draftLead(draft) + text)
        return true
      } catch (e) {
        return false
      }
    }

    /** 把一段文字填到对话输入框；返回 'inserted' | 'copied' | 'failed' */
    function sendToConversation(text) {
      if (appendViaBridge(text)) return 'inserted'
      if (appendViaService(text)) return 'inserted'
      return copyText(text) ? 'copied' : 'failed'
    }

    /** 引用一个网盘文件时填进对话的文本 */
    function refText(f) {
      var meta = []
      if (f.isFolder) {
        meta.push(f.includeItems ? '文件夹，' + f.includeItems + ' 个文件' : '文件夹')
      } else {
        if (f.sizeText) meta.push(f.sizeText)
        if (f.type && f.type !== '文件夹') meta.push(f.type)
      }
      var title = '请读取我夸克网盘中的文件：' + f.name
      if (meta.length) title += '（' + meta.join('，') + '）'
      return title + '\nfid: ' + f.fid
    }

    /**
     * 空渲染的桥：挂在 composer 工具行上，把宿主给的 sessionId / inputActions /
     * 当前草稿记到 composerBridge，供面板里的「引用到会话」使用。
     * 渲染值固定为 null，不占任何视觉空间。
     */
    function ComposerBridge(props) {
      var draft = ''
      try {
        if (props && typeof props.useInput === 'function') {
          draft = props.useInput(function (s) { return (s && s.draft) || '' }) || ''
        }
      } catch (e) { /* 读不到就按空草稿处理 */ }
      composerBridge.sessionId = (props && props.sessionId) || null
      composerBridge.inputActions = (props && props.inputActions) || null
      composerBridge.draft = draft
      return null
    }

    // ── 图标 ──────────────────────────────────────────────────────────────
    function Glyph(props) {
      var size = (props && props.size) || 20
      var active = !!(props && props.active)
      var color = active ? 'var(--dsw-alias-brand-primary)' : 'var(--dsw-alias-label-secondary)'
      return h('svg', {
        viewBox: '0 0 24 24', width: size, height: size, fill: 'none',
        stroke: color, strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round',
        'aria-hidden': true, style: { display: 'block' },
      },
        h('path', { d: 'M7.2 18.5A4.2 4.2 0 0 1 7 10.1a5.4 5.4 0 0 1 10.4-1.2 3.9 3.9 0 0 1 .7 7.7' }),
        h('path', { d: 'M12 12.2v6.2' }),
        h('path', { d: 'M9.4 15.4 12 18l2.6-2.6' }),
      )
    }

    function FileGlyph(props) {
      var folder = !!(props && props.folder)
      if (folder) {
        return h('svg', { viewBox: '0 0 24 24', width: 16, height: 16, fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinejoin: 'round', 'aria-hidden': true },
          h('path', { d: 'M3.5 7.2a2 2 0 0 1 2-2h3.3l1.6 1.9h8.1a2 2 0 0 1 2 2v7.7a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z' }))
      }
      return h('svg', { viewBox: '0 0 24 24', width: 16, height: 16, fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinejoin: 'round', 'aria-hidden': true },
        h('path', { d: 'M6 3.8h7.2L18.5 9v11.2H6z' }),
        h('path', { d: 'M13.2 3.8V9h5.3' }))
    }

    /** 引用/链接图标（对齐 dsh-ima 的 QuoteGlyph） */
    function QuoteGlyph() {
      return h('svg', { viewBox: '0 0 16 16', width: 13, height: 13, fill: 'none', 'aria-hidden': true, style: { display: 'block' } },
        h('path', {
          d: 'M6 9.5L10 5.5M6.8 4.2l1.5-1.5a2.6 2.6 0 013.7 3.7l-1.5 1.5M9.2 11.8l-1.5 1.5a2.6 2.6 0 01-3.7-3.7l1.5-1.5',
          stroke: 'currentColor', strokeWidth: 1.1, strokeLinecap: 'round',
        }))
    }

    function CopyGlyph() {
      return h('svg', { viewBox: '0 0 16 16', width: 13, height: 13, fill: 'none', 'aria-hidden': true, style: { display: 'block' } },
        h('rect', { x: 5.5, y: 5.5, width: 8, height: 8, rx: 1.5, stroke: 'currentColor', strokeWidth: 1.1 }),
        h('path', { d: 'M10.5 3.5H4a1.5 1.5 0 00-1.5 1.5v6.5', stroke: 'currentColor', strokeWidth: 1.1 }))
    }

    // ── 错误边界 ──────────────────────────────────────────────────────────
    class PanelBoundary extends react.Component {
      constructor(props) {
        super(props)
        this.state = { err: null }
      }
      static getDerivedStateFromError(err) {
        return { err: err }
      }
      componentDidCatch(err) {
        if (typeof console !== 'undefined') console.error('[dsh-quark] 面板渲染失败：', err)
      }
      render() {
        if (this.state.err) {
          return h('div', { className: 'dq-root' },
            h('div', { className: 'dq-err' }, '面板渲染出错：' + (this.state.err && this.state.err.message)))
        }
        return this.props.children
      }
    }

    // ── 主面板 ────────────────────────────────────────────────────────────
    function QuarkPage(props) {
      var compact = !!(props && props.compact)
      var useState = react.useState
      var useEffect = react.useEffect

      var statusState = useState(null)
      var status = statusState[0]
      var setStatus = statusState[1]

      var stackState = useState([{ fid: '0', name: '我的网盘' }])
      var stack = stackState[0]
      var setStack = stackState[1]

      var filesState = useState([])
      var files = filesState[0]
      var setFiles = filesState[1]

      var loadingState = useState(false)
      var loading = loadingState[0]
      var setLoading = loadingState[1]

      var errState = useState(null)
      var error = errState[0]
      var setError = errState[1]

      var kwState = useState('')
      var keyword = kwState[0]
      var setKeyword = kwState[1]

      var searchState = useState(null)
      var searchResult = searchState[0]
      var setSearchResult = searchState[1]

      var selState = useState([])
      var selected = selState[0]
      var setSelected = selState[1]

      var toastState = useState(null)
      var toast = toastState[0]
      var setToast = toastState[1]

      var dialogState = useState(null)
      var dialog = dialogState[0]
      var setDialog = dialogState[1]

      var busyState = useState(false)
      var busy = busyState[0]
      var setBusy = busyState[1]

      var tabState = useState('files')
      var tab = tabState[0]
      var setTab = tabState[1]

      var cwd = stack[stack.length - 1]

      function say(msg) {
        setToast(msg)
        setTimeout(function () { setToast(null) }, 4000)
      }

      function refreshStatus() {
        return api('/status').then(function (r) {
          setStatus(r)
          return r
        })
      }

      function loadDir(fid) {
        setLoading(true)
        setError(null)
        setSelected([])
        return api('/browse?fid=' + encodeURIComponent(fid || '0') + '&size=100&all=1').then(function (r) {
          setLoading(false)
          if (!r.ok) {
            setError(r.error || '读取目录失败')
            setFiles([])
            return
          }
          setFiles(r.files || [])
        })
      }

      useEffect(function () {
        injectStyle('dsh-quark-style', CSS)
        refreshStatus()
        loadDir('0')
      }, [])

      function openDir(f) {
        setSearchResult(null)
        setTab('files')
        setStack(stack.concat([{ fid: f.fid, name: f.name }]))
        loadDir(f.fid)
      }

      function gotoCrumb(i) {
        var next = stack.slice(0, i + 1)
        setStack(next)
        setSearchResult(null)
        setTab('files')
        loadDir(next[next.length - 1].fid)
      }

      function runSearch() {
        var kw = (keyword || '').trim()
        if (!kw) return
        setLoading(true)
        setError(null)
        setSelected([])
        api('/search?keyword=' + encodeURIComponent(kw) + '&size=100').then(function (r) {
          setLoading(false)
          if (!r.ok) {
            setError(r.error || '搜索失败')
            setSearchResult(null)
            return
          }
          setSearchResult(r)
          setTab('search')
        })
      }

      function toggle(fid) {
        var idx = selected.indexOf(fid)
        if (idx >= 0) {
          var next = selected.slice()
          next.splice(idx, 1)
          setSelected(next)
        } else {
          setSelected(selected.concat([fid]))
        }
      }

      var visible = tab === 'search' && searchResult ? (searchResult.files || []) : files

      function afterWrite(msg) {
        setDialog(null)
        say(msg)
        refreshStatus()
        loadDir(cwd.fid)
        if (tab === 'search' && keyword) runSearch()
      }

      function doMkdir(name) {
        if (!name) return
        setBusy(true)
        api('/mkdir', { method: 'POST', body: { dirPath: name, parentFid: cwd.fid } }).then(function (r) {
          setBusy(false)
          if (!r.ok) return say(r.error || '新建失败')
          afterWrite('已创建文件夹：' + name)
        })
      }

      function doMove() {
        if (!selected.length) return say('先选中要移动的文件')
        // 打开目标目录选择器：默认从根目录开始浏览，不再写死成「当前目录」
        setDialog({
          kind: 'move',
          title: '移动 ' + selected.length + ' 项到…',
          fids: selected.slice(),
          targetFid: '0',
          path: [{ fid: '0', name: '我的网盘' }],
          dirs: [],
          loading: true,
        })
        loadMoveDir('0')
      }

      function loadMoveDir(fid) {
        api('/browse?fid=' + encodeURIComponent(fid) + '&size=100&all=1').then(function (r) {
          setDialog(function (cur) {
            if (!cur || cur.kind !== 'move') return cur
            if (!r.ok) {
              return Object.assign({}, cur, { loading: false, error: r.error || '读取目录失败', dirs: [] })
            }
            var dirs = (r.files || []).filter(function (f) { return f.isFolder })
            return Object.assign({}, cur, { loading: false, error: null, dirs: dirs, targetFid: fid })
          })
        })
      }

      function enterMoveDir(f) {
        setDialog(function (cur) {
          if (!cur || cur.kind !== 'move') return cur
          return Object.assign({}, cur, {
            path: cur.path.concat([{ fid: f.fid, name: f.name }]),
            targetFid: f.fid,
            dirs: [],
            loading: true,
            error: null,
          })
        })
        loadMoveDir(f.fid)
      }

      function moveCrumb(i) {
        setDialog(function (cur) {
          if (!cur || cur.kind !== 'move') return cur
          var next = cur.path.slice(0, i + 1)
          var last = next[next.length - 1]
          loadMoveDir(last.fid)
          return Object.assign({}, cur, { path: next, targetFid: last.fid, dirs: [], loading: true, error: null })
        })
      }

      function confirmMove() {
        if (!dialog || dialog.kind !== 'move') return
        var fids = dialog.fids
        var targetFid = dialog.targetFid
        var targetName = dialog.path[dialog.path.length - 1].name
        // 目标就是文件当前所在目录时没有意义，直接说清楚
        if (fids.length && cwd.fid === targetFid) {
          return say('选中的文件已经在「' + targetName + '」里了，请换一个目标文件夹')
        }
        setBusy(true)
        api('/move', { method: 'POST', body: { fids: fids, targetFid: targetFid } }).then(function (r) {
          setBusy(false)
          if (!r.ok) return say(r.error || '移动失败')
          afterWrite('已移动 ' + fids.length + ' 项到「' + targetName + '」')
        })
      }

      function doShare() {
        if (!selected.length) return
        setBusy(true)
        api('/share', { method: 'POST', body: { fids: selected, urlType: 2, expiredType: 1 } }).then(function (r) {
          setBusy(false)
          setDialog({
            kind: 'share',
            title: '分享链接',
            shareUrl: r.ok ? r.shareUrl : null,
            passcode: r.ok ? r.passcode : null,
            text: r.ok ? null : (r.error || '分享失败'),
          })
        })
      }

      function doDownload() {
        if (!selected.length) return say('先选中一个文件')
        setBusy(true)
        api('/download', { method: 'POST', body: { fid: selected[0] } }).then(function (r) {
          setBusy(false)
          if (!r.ok) return say(r.error || '下载失败')
          var dir = r.outputDir || '系统下载文件夹'
          say('已开始下载到：' + dir)
          setDialog({
            kind: 'download',
            title: '下载完成',
            text: '保存位置：' + dir + '\n\n' + JSON.stringify(r.data || {}, null, 2),
          })
        })
      }

      // ── 引用到会话 / 复制名称 ──
      // 右侧栏：直接作用于当前会话。
      // 主面板（左侧栏进来）：先问「当前会话 / 新会话」，再跳转到对话。
      function doQuote(f) {
        var text = refText(f)
        if (compact) {
          // 右侧栏本来就在会话里：直接写进当前对话框，不动中央区
          insertIntoCurrent(text, false, '已填入对话框：' + f.name, f.name, false)
          return
        }
        setDialog({
          kind: 'target',
          title: '把「' + f.name + '」引用到…',
          hint: '主面板不在任何会话里，先选一个去处。',
          payload: text,
          submit: false,
          fileName: f.name,
        })
      }

      /** 跳到对话视图（主面板被面板占据时先切回去） */
      function jumpToConversation() {
        try {
          var layout = clientCtx && clientCtx.get('layout')
          if (layout && typeof layout.selectPanel === 'function') layout.selectPanel(null)
        } catch (e) { /* 没有布局服务就只是不跳 */ }
      }

      /** 把文本插进当前会话的输入框；submit=true 时顺手发出去
       *  jump=true 时顺便把中央区切回对话（主面板占据中央时才需要）；
       *  右侧栏本来就在会话里，不动中央区，避免抢视图。 */
      function insertIntoCurrent(text, submit, okMsg, fileName, jump) {
        var res = sendToConversation(text)
        if (res === 'inserted') {
          if (jump) jumpToConversation()
          if (submit && submitComposer()) say('已发送总结请求，等待回答…')
          else say(okMsg || '已填入对话框')
          return true
        }
        if (res === 'copied') {
          say('已复制引用文本，粘贴到对话框即可')
          return true
        }
        say('引用失败，请手动复制' + (fileName ? '文件名' : '内容'))
        return false
      }

      /** 另开一个新会话并把文本预填进草稿（宿主的 prompt 只填草稿、不自动发送） */
      function startSessionWith(text) {
        var ws = clientCtx && clientCtx.get('uiWorkspace')
        if (ws && typeof ws.startSession === 'function') {
          try {
            ws.startSession(undefined, { prompt: text, whenDraftExists: 'append' })
            say('已在新会话里填好内容，按 Enter 发送')
            return true
          } catch (e) { /* 落到插入当前会话 */ }
        }
        say('打不开新会话，已改填当前对话框')
        return insertIntoCurrent(text, false, '已填入当前对话框')
      }

      function doCopyName(f) {
        copyText(f.name)
        say('已复制文件名')
      }

      // ── 上传 ──
      function doUpload() {
        setDialog({
          kind: 'upload',
          title: '上传到「' + cwd.name + '」',
          hint: '填本机文件或文件夹的绝对路径，多个用换行分隔',
          value: '',
        })
      }

      function runUpload(text) {
        var paths = String(text || '').split(/[\r\n]+/).map(function (s) { return s.trim() }).filter(Boolean)
        if (!paths.length) return
        setBusy(true)
        say('上传中，大文件会比较慢…')
        api('/upload', { method: 'POST', body: { paths: paths, parentFid: cwd.fid } }).then(function (r) {
          setBusy(false)
          if (!r.ok) {
            setDialog({ kind: 'text', title: '上传失败', text: r.error || '上传失败' })
            return
          }
          afterWrite('已上传 ' + paths.length + ' 项到「' + cwd.name + '」')
        })
      }

      // ── 批量重命名 ──
      function doRename() {
        if (!selected.length) return say('先选中要改名的文件')
        var rows = visible.filter(function (f) { return selected.indexOf(f.fid) >= 0 })
        var draft = rows.map(function (f) { return f.name + '\t' + f.name })
        setDialog({
          kind: 'rename',
          title: '批量重命名（' + rows.length + ' 项）',
          hint: '每行「原名 Tab 新名」，只改第二列；fid 会随方案一起生成',
          value: draft.join('\n'),
          rows: rows,
        })
      }

      function runRename(text, rows) {
        var lines = String(text || '').split(/[\r\n]+/).filter(function (l) { return l.trim() })
        var items = []
        var bad = []
        lines.forEach(function (line) {
          var parts = line.split('\t')
          if (parts.length < 2) return bad.push(line)
          var oldName = parts[0].trim()
          var newName = parts.slice(1).join('\t').trim()
          var hit = null
          for (var i = 0; i < rows.length; i++) {
            if (rows[i].name === oldName) { hit = rows[i]; break }
          }
          if (!hit || !newName || newName === oldName) return
          items.push({ fid: hit.fid, old_name: hit.name, new_name: newName })
        })
        if (bad.length) return setDialog({ kind: 'text', title: '格式有误', text: '这些行缺少 Tab 分隔：\n' + bad.join('\n') })
        if (!items.length) return say('没有需要改名的项')
        if (items.length > 5000) return say('单批最多 5000 条')
        setBusy(true)
        // 只允许改名的对象落在当前目录/当前搜索结果，避免误改
        var payload = {
          schema_version: 1,
          items: items,
        }
        api('/rename', { method: 'POST', body: { items: payload.items } }).then(function (r) {
          setBusy(false)
          if (!r.ok) {
            setDialog({ kind: 'text', title: '重命名失败', text: r.error || '重命名失败' })
            return
          }
          var batchId = (r.data && r.data.batch_id) || null
          afterWrite('已重命名 ' + items.length + ' 项' + (batchId ? '（批次 ' + batchId + '）' : ''))
        })
      }

      // ── 相册整理 ──
      function doOrganizeAlbum() {
        setDialog({
          kind: 'album',
          title: '相册整理',
          hint: '用一句话说清范围 + 分类方式，例如「把去年在青岛拍的照片按地点整理」',
          value: '',
        })
      }

      function runOrganizeAlbum(query) {
        if (!query) return
        setBusy(true)
        say('整理中，文件多时要等一会儿…')
        api('/organize-album', { method: 'POST', body: { query: query } }).then(function (r) {
          setBusy(false)
          if (r.needConfirm && r.taskId) {
            setDialog({
              kind: 'album-confirm',
              title: '需要选择整理方式',
              text: r.error || '',
              taskId: r.taskId,
            })
            return
          }
          if (!r.ok) {
            setDialog({ kind: 'text', title: '相册整理失败', text: r.error || '相册整理失败' })
            return
          }
          afterWrite('相册整理已提交')
          setDialog({ kind: 'text', title: '相册整理结果', text: formatResult(r.data) })
        })
      }

      function confirmAlbum(taskId, way) {
        setBusy(true)
        api('/organize-album', { method: 'POST', body: { confirm: way, taskId: taskId } }).then(function (r) {
          setBusy(false)
          if (!r.ok) {
            setDialog({ kind: 'text', title: '确认失败', text: r.error || '确认失败' })
            return
          }
          afterWrite('已按「' + (way === 'move' ? '移动' : '复制') + '」方式整理')
          setDialog({ kind: 'text', title: '相册整理结果', text: formatResult(r.data) })
        })
      }

      // ── 整批归类 ──
      function doOrganizeFiles() {
        setDialog({
          kind: 'batch',
          title: '整批归类',
          hint: '按方案新建目录并移动/改名文件，带预览与 30 天撤回。填一句整理方案描述，先把任务建起来',
          value: '',
        })
      }

      function runOrganizeFiles(desc) {
        if (!desc) return
        setBusy(true)
        api('/organize-files', { method: 'POST', body: { step: 'init', baseDir: '' , note: desc } }).then(function (r) {
          setBusy(false)
          if (!r.ok) {
            setDialog({ kind: 'text', title: '整批归类失败', text: r.error || '整批归类失败' })
            return
          }
          setDialog({
            kind: 'text',
            title: '已建整理任务',
            text: '任务目录：' + ((r.data && r.data.task_dir) || '(未返回)') +
              '\n\n后续 check / apply / undo 由 agent 用 quark_organize_files 工具完成（面板只负责建任务）。',
          })
        })
      }

      function formatResult(data) {
        try { return JSON.stringify(data || {}, null, 2) } catch (e) { return String(data) }
      }

      // ── AI 总结：交给对话里的 agent 做，而不是插件自己调上游助手 ──────────
      // 夸克官方助手的 /assistant/ask 经常直接返回 -1501（上游服务异常）或
      // -1507（5 分钟没答完），面板里干等一个弹层体验很差。改成把「要总结什么」
      // 写进对话，由 agent 用自己的工具（quark_summary / quark_qa / 读取文件）来完成。
      function summaryTargets() {
        // 有选中就总结选中的；没选中就把当前所在目录当作范围（与「文件夹总结」一致）
        var list = []
        if (selected.length) {
          for (var i = 0; i < visible.length; i++) {
            if (selected.indexOf(visible[i].fid) >= 0) list.push(visible[i])
          }
        }
        return list
      }

      function buildSummaryPrompt() {
        var picked = summaryTargets()
        var lines = []
        if (picked.length) {
          lines.push('请帮我总结我夸克网盘里的这些内容：')
          for (var i = 0; i < picked.length && i < 100; i++) {
            var f = picked[i]
            var meta = []
            if (f.isFolder) meta.push(f.includeItems ? '文件夹，' + f.includeItems + ' 个文件' : '文件夹')
            else {
              if (f.sizeText) meta.push(f.sizeText)
              if (f.type && f.type !== '文件夹') meta.push(f.type)
            }
            lines.push('- ' + f.name + (meta.length ? '（' + meta.join('，') + '）' : '') + '  fid: ' + f.fid)
          }
          if (picked.length > 100) lines.push('（只列了前 100 项，共 ' + picked.length + ' 项）')
          lines.push('')
          lines.push('请总结这些文件的主要内容；如果是一个文件夹，就把里面的文件一起看。')
          lines.push('可以用 quark_summary 工具（fid_list 传上面的 fid），失败再退回逐个读取。')
        } else {
          lines.push('请帮我总结我夸克网盘里「' + cwd.name + '」这个文件夹的内容。')
          lines.push('fid: ' + cwd.fid)
          lines.push('先用 quark_list_files 看看里面有什么，再用 quark_summary 总结。')
        }
        return lines.join('\n')
      }

      function doSummary() {
        var prompt = buildSummaryPrompt()
        if (compact) {
          // 右侧栏本来就在会话里：直接作用于当前会话，不动中央区
          insertIntoCurrent(prompt, true, '已填入对话框，按 Enter 发送', null, false)
          return
        }
        // 主面板：先问「当前会话 / 新会话」，选完再跳转
        setDialog({
          kind: 'target',
          title: 'AI 总结放到哪里？',
          hint: '主面板不在任何会话里，先选一个去处。',
          payload: prompt,
          submit: true,
          fileName: null,
        })
      }

      /** 尝试把当前草稿直接发出去；拿不到 submit 就返回 false，让用户按 Enter */
      function submitComposer() {
        var actions = composerBridge.inputActions
        if (actions && typeof actions.submit === 'function') {
          try {
            if (actions.submit() !== false) return true
          } catch (e) { /* 退到服务通道 */ }
        }
        try {
          if (!clientCtx || !composerBridge.sessionId) return false
          var sessions = clientCtx.get('sessions')
          var conversation = clientCtx.get('conversation')
          if (!sessions || !conversation) return false
          var actx = sessions.scope(composerBridge.sessionId)
          if (!actx) return false
          var input = conversation.input.for(actx)
          if (input && typeof input.submit === 'function') {
            input.submit()
            return true
          }
        } catch (e) { /* 忽略 */ }
        return false
      }

      function doLogin() {
        setBusy(true)
        say('已发起登录，请在弹出的浏览器里完成授权…')
        api('/login', { method: 'POST', body: {} }).then(function (r) {
          setBusy(false)
          if (!r.ok) return say(r.error || '登录失败')
          say('登录成功')
          refreshStatus()
          loadDir('0')
        })
      }

      function doLogout() {
        setBusy(true)
        api('/logout', { method: 'POST', body: {} }).then(function (r) {
          setBusy(false)
          if (!r.ok) return say(r.error || '退出失败')
          say('已退出登录')
          setFiles([])
          refreshStatus()
        })
      }

      // ── 头部 ──
      var account = status && status.account
      var head = h('div', { className: 'dq-head' },
        h('div', { className: 'dq-avatar' }, account && account.nickname ? account.nickname.slice(0, 1) : 'Q'),
        h('div', { className: 'dq-acct' },
          h('div', { className: 'dq-name' }, account ? (account.nickname || '夸克网盘') : (status && status.bound === false ? '未登录' : '夸克网盘')),
          h('div', { className: 'dq-meta' },
            account
              ? ((account.vipType ? account.vipType + ' · ' : '') + (account.usedText || '0 B') + ' / ' + (account.capacityText || '0 B'))
              : (status && status.cliFound === false ? '未找到 quarkclouddrive skill' : '读取账号信息…'))),
        account
          ? h('button', { className: 'dq-btn', onClick: doLogout, disabled: busy }, '退出')
          : h('button', { className: 'dq-btn dq-btn-p', onClick: doLogin, disabled: busy }, '登录授权'),
      )

      // ── 工具条 ──
      var crumbs = stack.map(function (node, i) {
        var last = i === stack.length - 1
        return h('span', { key: 'c' + i, style: { display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 } },
          i > 0 ? h('span', { className: 'dq-sep' }, '/') : null,
          h('button', {
            className: 'dq-crumb' + (last ? ' dq-crumb-last' : ''),
            onClick: function () { gotoCrumb(i) },
            title: node.name,
          }, node.name))
      })

      var bar = h('div', { className: 'dq-bar' },
        h('div', { className: 'dq-crumbs' }, crumbs),
        h('div', { className: 'dq-search' },
          h('input', {
            className: 'dq-input',
            placeholder: '搜索网盘文件',
            value: keyword,
            onChange: function (e) { setKeyword(e.target.value) },
            onKeyDown: function (e) { if (e.key === 'Enter') runSearch() },
          }),
          h('button', { className: 'dq-btn', onClick: runSearch, disabled: loading }, '搜索'),
        ),
      )

      // ── 列表 ──
      var listBody
      if (loading) {
        listBody = h('div', { className: 'dq-spin' }, '加载中…')
      } else if (error) {
        listBody = h('div', { className: 'dq-err' }, error)
      } else if (!visible.length) {
        listBody = h('div', { className: 'dq-empty' }, tab === 'search' ? '没有搜到匹配的文件' : '这个目录是空的')
      } else {
        listBody = visible.map(function (f, i) {
          var isSel = selected.indexOf(f.fid) >= 0
          return h('div', {
            key: f.fid || ('r' + i),
            className: 'dq-row' + (isSel ? ' dq-row-sel' : ''),
          },
            h('input', {
              className: 'dq-check', type: 'checkbox', checked: isSel,
              onChange: function () { toggle(f.fid) },
            }),
            h('span', { className: 'dq-ico' }, h(FileGlyph, { folder: f.isFolder })),
            h('span', {
              className: 'dq-fname' + (f.isFolder ? ' dq-fname-dir' : ''),
              title: f.name,
              onClick: f.isFolder ? function () { openDir(f) } : undefined,
            }, f.name),
            // 文件名右侧：引用到会话 + 复制名称（对齐 dsh-ima 的行内按钮组）
            h('span', { className: 'dq-act' },
              h('button', {
                className: 'dq-actbtn dq-actbtn-p',
                title: '把它交给对话里的 agent 读取',
                onClick: function (e) { e.stopPropagation(); doQuote(f) },
              }, h(QuoteGlyph), '引用到会话'),
              h('button', {
                className: 'dq-actbtn',
                title: '复制文件名',
                onClick: function (e) { e.stopPropagation(); doCopyName(f) },
              }, h(CopyGlyph), '复制名称'),
            ),
            h('span', { className: 'dq-fsize' }, fmtSize(f.sizeText)),
          )
        })
      }

      var tabs = h('div', { className: 'dq-tabs' },
        h('button', {
          className: 'dq-tab' + (tab === 'files' ? ' dq-tab-on' : ''),
          onClick: function () { setTab('files') },
        }, '文件'),
        h('button', {
          className: 'dq-tab' + (tab === 'search' ? ' dq-tab-on' : ''),
          onClick: function () { setTab('search') },
          disabled: !searchResult,
        }, '搜索结果' + (searchResult ? '（' + (searchResult.count || 0) + '）' : '')),
      )

      // ── 底栏（顺序固定：新建文件夹、上传、下载、移动、分享、批量重命名、相册整理、整批归类、AI 总结）──
      var foot = h('div', { className: 'dq-foot' },
        h('span', { className: 'dq-sel' }, selected.length ? '已选 ' + selected.length + ' 项' : '未选中文件'),
        h('button', {
          className: 'dq-btn',
          onClick: function () { setDialog({ kind: 'mkdir', title: '新建文件夹', value: '' }) },
          disabled: busy,
        }, '新建文件夹'),
        h('button', { className: 'dq-btn', onClick: doUpload, disabled: busy }, '上传'),
        h('button', { className: 'dq-btn', onClick: doDownload, disabled: busy || !selected.length }, '下载'),
        h('button', { className: 'dq-btn', onClick: doMove, disabled: busy }, '移动'),
        h('button', { className: 'dq-btn', onClick: doShare, disabled: busy || !selected.length }, '分享'),
        h('button', { className: 'dq-btn', onClick: doRename, disabled: busy || !selected.length }, '批量重命名'),
        h('button', { className: 'dq-btn', onClick: doOrganizeAlbum, disabled: busy }, '相册整理'),
        h('button', { className: 'dq-btn', onClick: doOrganizeFiles, disabled: busy }, '整批归类'),
        h('button', { className: 'dq-btn', onClick: doSummary, disabled: busy }, 'AI 总结'),
        // 右侧栏：窄面板里不显示（自己就是右侧栏），主面板里给一个直达入口。
        compact ? null : h('button', {
          className: 'dq-btn',
          onClick: function () {
            if (openRightPane()) say('已在右侧栏打开')
            else say('右侧栏打不开，可能当前不在会话里')
          },
        }, '右侧栏'),
      )

      // ── 弹层 ──
      var modal = null
      if (dialog) {
        var body = null
        var extraBtn = null
        var hintLine = dialog.hint ? h('div', { className: 'dq-hint' }, dialog.hint) : null

        if (dialog.kind === 'mkdir') {
          body = h('input', {
            className: 'dq-input', autoFocus: true, placeholder: '文件夹名称',
            value: dialog.value,
            onChange: function (e) { setDialog({ kind: 'mkdir', title: '新建文件夹', value: e.target.value }) },
            onKeyDown: function (e) { if (e.key === 'Enter') doMkdir(dialog.value.trim()) },
          })
          extraBtn = h('button', {
            className: 'dq-btn dq-btn-p',
            onClick: function () { doMkdir((dialog.value || '').trim()) },
            disabled: busy || !(dialog.value || '').trim(),
          }, '创建')
        } else if (dialog.kind === 'upload') {
          body = h('textarea', {
            className: 'dq-textarea', autoFocus: true, rows: 4,
            placeholder: '一个文件的绝对路径，一行一个\n例如 /home/you/Documents/a.pdf',
            value: dialog.value,
            onChange: function (e) { setDialog({ kind: 'upload', title: dialog.title, hint: dialog.hint, value: e.target.value }) },
          })
          extraBtn = h('button', {
            className: 'dq-btn dq-btn-p',
            onClick: function () { runUpload(dialog.value) },
            disabled: busy || !(dialog.value || '').trim(),
          }, '上传')
        } else if (dialog.kind === 'rename') {
          body = h('textarea', {
            className: 'dq-textarea', autoFocus: true, rows: 8,
            value: dialog.value,
            onChange: function (e) { setDialog({ kind: 'rename', title: dialog.title, hint: dialog.hint, value: e.target.value, rows: dialog.rows }) },
          })
          extraBtn = h('button', {
            className: 'dq-btn dq-btn-p',
            onClick: function () { runRename(dialog.value, dialog.rows || []) },
            disabled: busy || !(dialog.value || '').trim(),
          }, '执行改名')
        } else if (dialog.kind === 'album') {
          body = h('textarea', {
            className: 'dq-textarea', autoFocus: true, rows: 3,
            placeholder: '把去年在青岛拍的照片按地点整理',
            value: dialog.value,
            onChange: function (e) { setDialog({ kind: 'album', title: dialog.title, hint: dialog.hint, value: e.target.value }) },
          })
          extraBtn = h('button', {
            className: 'dq-btn dq-btn-p',
            onClick: function () { runOrganizeAlbum((dialog.value || '').trim()) },
            disabled: busy || !(dialog.value || '').trim(),
          }, '开始整理')
        } else if (dialog.kind === 'album-confirm') {
          body = h('div', { className: 'dq-err' }, dialog.text || '')
          extraBtn = h('div', { style: { display: 'flex', gap: 8 } },
            h('button', {
              className: 'dq-btn', disabled: busy,
              onClick: function () { confirmAlbum(dialog.taskId, 'copy') },
            }, '复制整理'),
            h('button', {
              className: 'dq-btn dq-btn-p', disabled: busy,
              onClick: function () { confirmAlbum(dialog.taskId, 'move') },
            }, '移动整理'),
          )
        } else if (dialog.kind === 'batch') {
          body = h('textarea', {
            className: 'dq-textarea', autoFocus: true, rows: 3,
            placeholder: '按文件类型把根目录的文档归到「资料」下',
            value: dialog.value,
            onChange: function (e) { setDialog({ kind: 'batch', title: dialog.title, hint: dialog.hint, value: e.target.value }) },
          })
          extraBtn = h('button', {
            className: 'dq-btn dq-btn-p',
            onClick: function () { runOrganizeFiles((dialog.value || '').trim()) },
            disabled: busy || !(dialog.value || '').trim(),
          }, '建整理任务')
        } else if (dialog.kind === 'move') {
          var mvCrumbs = h('div', { className: 'dq-mv-crumbs' },
            dialog.path.map(function (p, i) {
              return h('button', {
                key: p.fid + '-' + i,
                className: 'dq-crumb' + (i === dialog.path.length - 1 ? ' dq-crumb-last' : ''),
                onClick: function () { moveCrumb(i) },
              }, p.name)
            })
          )
          var mvBody
          if (dialog.loading) {
            mvBody = h('div', { className: 'dq-spin' }, '读取目录…')
          } else if (dialog.error) {
            mvBody = h('div', { className: 'dq-err' }, dialog.error)
          } else if (!dialog.dirs.length) {
            mvBody = h('div', { className: 'dq-spin' }, '这个目录下没有子文件夹')
          } else {
            mvBody = h('div', { className: 'dq-mv-list' },
              dialog.dirs.map(function (f) {
                return h('button', {
                  key: f.fid,
                  className: 'dq-mv-row',
                  onClick: function () { enterMoveDir(f) },
                }, h(FileGlyph, { folder: true }), h('span', { className: 'dq-fname' }, f.name))
              })
            )
          }
          body = h('div', { className: 'dq-mv' },
            h('div', { className: 'dq-hint' }, '当前目标：' + dialog.path[dialog.path.length - 1].name + '（点文件夹进去，或直接确认）'),
            mvCrumbs,
            mvBody,
          )
          extraBtn = h('button', {
            className: 'dq-btn dq-btn-p',
            onClick: confirmMove,
            disabled: busy || dialog.loading,
          }, '移到「' + dialog.path[dialog.path.length - 1].name + '」')
        } else if (dialog.kind === 'target') {
          // 主面板点「引用到会话 / AI 总结」时的去处选择
          body = h('div', { className: 'dq-target' },
            h('pre', { className: 'dq-pre' }, (dialog.payload || '').slice(0, 1200)),
          )
          var currentLabel = composerBridge.sessionId ? '放到当前会话' : '放到当前会话（当前没有会话）'
          extraBtn = h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap' } },
            h('button', {
              className: 'dq-btn dq-btn-p',
              disabled: busy || !composerBridge.sessionId,
              onClick: function () {
                setDialog(null)
                insertIntoCurrent(dialog.payload, dialog.submit, null, dialog.fileName, true)
              },
            }, currentLabel),
            h('button', {
              className: 'dq-btn',
              disabled: busy,
              onClick: function () {
                setDialog(null)
                startSessionWith(dialog.payload)
              },
            }, '开一个新会话'),
          )
        } else if (dialog.kind === 'share') {
          body = dialog.text
            ? h('div', { className: 'dq-err' }, dialog.text)
            : h('div', { style: { display: 'flex', flexDirection: 'column', gap: 6 } },
                h('div', null, '链接：', h('a', { className: 'dq-link', href: dialog.shareUrl, target: '_blank', rel: 'noreferrer' }, dialog.shareUrl || '')),
                dialog.passcode ? h('div', null, '提取码：', h('b', null, dialog.passcode)) : null)
        } else {
          body = h('pre', { className: 'dq-pre' }, dialog.text || '')
        }

        modal = h('div', { className: 'dq-modal-mask', onClick: function () { setDialog(null) } },
          h('div', { className: 'dq-modal', onClick: function (e) { e.stopPropagation() } },
            h('div', { className: 'dq-modal-title' }, dialog.title),
            hintLine,
            body,
            h('div', { className: 'dq-modal-actions' },
              h('button', { className: 'dq-btn', onClick: function () { setDialog(null) } }, '关闭'),
              extraBtn,
            ),
          ),
        )
      }

      return h('div', { className: 'dq-root', style: { position: 'relative' } },
        head,
        bar,
        tabs,
        h('div', { className: 'dq-body' }, listBody),
        foot,
        toast ? h('div', { className: 'dq-toast' }, toast) : null,
        modal,
      )
    }

    // ── 显示偏好：左侧栏入口（主面板）+ 右侧栏标签页 ──────────────────────
    // 两个开关都是纯客户端偏好，存在 localStorage；设置页
    // （plugins.bundle.config）里各有一行。
    var RIGHT_PREF_KEY = 'dsh-quark:rightbar-enabled'
    var PANEL_PREF_KEY = 'dsh-quark:panel-enabled'
    var rightPref = { enabled: true, listeners: [], onEnable: null }
    var panelPref = { enabled: true, listeners: [], onEnable: null }

    /** 读一个布尔偏好的通用实现：缺省 true，存不下来就只在内存里生效 */
    function makePref(key) {
      var pref = { enabled: true, listeners: [], onEnable: null }
      pref.load = function () {
        try {
          var raw = window.localStorage.getItem(key)
          pref.enabled = raw === null ? true : raw === '1'
        } catch (e) { pref.enabled = true }
      }
      pref.set = function (next) {
        var was = pref.enabled
        pref.enabled = !!next
        try { window.localStorage.setItem(key, pref.enabled ? '1' : '0') } catch (e) { /* 只内存生效 */ }
        for (var i = 0; i < pref.listeners.length; i++) {
          try { pref.listeners[i](pref.enabled) } catch (e) { /* 单个订阅失败不影响其它 */ }
        }
        if (pref.enabled && !was && typeof pref.onEnable === 'function') {
          try { pref.onEnable() } catch (e) { /* 打不开就算了 */ }
        }
      }
      return pref
    }

    rightPref = makePref(RIGHT_PREF_KEY)
    panelPref = makePref(PANEL_PREF_KEY)

    function loadRightPref() { rightPref.load() }
    function setRightPref(next) { rightPref.set(next) }
    function setPanelPref(next) { panelPref.set(next) }

    function usePref(pref) {
      var pair = react.useState(pref.enabled)
      var value = pair[0]
      var setValue = pair[1]
      react.useEffect(function () {
        var fn = function (next) { setValue(next) }
        pref.listeners.push(fn)
        setValue(pref.enabled)
        return function () {
          var i = pref.listeners.indexOf(fn)
          if (i >= 0) pref.listeners.splice(i, 1)
        }
      }, [])
      return [value, pref.set]
    }

    /** 兼容旧调用点：只关心右侧栏开关的地方用这个 */
    function useRightPref() { return usePref(rightPref) }
    function usePanelPref() { return usePref(panelPref) }

    /** 在右侧栏打开夸克网盘；kind 未注册或没有屏上会话时返回 false */
    function openRightPane() {
      try {
        var right = clientCtx && clientCtx.get('sidebarRight')
        if (!right || typeof right.openTab !== 'function') return false
        right.openTab(TAB_KIND)
        return true
      } catch (e) {
        return false
      }
    }

    /** 右侧栏标签页是否已经成功向宿主注册（设置页用它显示状态） */
    var tabTypeState = { registered: false, listeners: [] }

    function setTabTypeState(registered) {
      if (tabTypeState.registered === registered) return
      tabTypeState.registered = registered
      for (var i = 0; i < tabTypeState.listeners.length; i++) {
        try { tabTypeState.listeners[i](registered) } catch (e) { /* 忽略 */ }
      }
    }

    function useTabTypeState() {
      var pair = react.useState(tabTypeState.registered)
      var setValue = pair[1]
      react.useEffect(function () {
        var fn = function (next) { setValue(next) }
        tabTypeState.listeners.push(fn)
        setValue(tabTypeState.registered)
        return function () {
          var i = tabTypeState.listeners.indexOf(fn)
          if (i >= 0) tabTypeState.listeners.splice(i, 1)
        }
      }, [])
      return pair[0]
    }

    /** 右侧栏 tab 的标题（chip 上用） */
    function RightTitle() {
      return h('span', null, '夸克网盘')
    }

    /** 右侧栏 tab 的主体：与主面板同一套界面，只是更窄 */
    function RightPaneBody(props) {
      var pair = useRightPref()
      var enabled = pair[0]
      if (!enabled) {
        return h('div', { className: 'dq-root' },
          h('div', { className: 'dq-head' },
            h('div', { className: 'dq-acct' },
              h('div', { className: 'dq-name' }, '右侧栏已关闭'),
              h('div', { className: 'dq-meta' }, '在「插件 → dsh-quark」里重新打开，或用下面的按钮'),
            ),
          ),
          h('div', { className: 'dq-body' },
            h('div', { className: 'dq-spin' },
              h('button', { className: 'dq-btn dq-btn-p', onClick: function () { setRightPref(true) } }, '重新开启'),
            ),
          ),
        )
      }
      return h(PanelBoundary, null, h(QuarkPage, { compact: true, sessionId: props && props.sessionId }))
    }

    /** 设置页里的开关：plugins.bundle.config，key = 包名 */
    function SettingsSection() {
      var panelPair = usePanelPref()
      var panelOn = panelPair[0]
      var rightPair = useRightPref()
      var rightOn = rightPair[0]
      var tabReady = useTabTypeState()
      return h('div', { className: 'dq-set' },
        h('div', { className: 'dq-set-row' },
          h('div', { className: 'dq-set-text' },
            h('div', { className: 'dq-set-title' }, '在左侧栏显示夸克网盘（主面板）'),
            h('div', { className: 'dq-set-desc' }, '打开后，左侧栏会多出一个「夸克网盘」入口，点开是主面板：浏览、搜索、上下载、整理都在这里做。'),
          ),
          h('button', {
            className: panelOn ? 'dq-btn dq-btn-p' : 'dq-btn',
            onClick: function () { setPanelPref(!panelOn) },
          }, panelOn ? '已开启' : '已关闭'),
        ),
        h('div', { className: 'dq-set-row' },
          h('div', { className: 'dq-set-text' },
            h('div', { className: 'dq-set-title' }, '在右侧栏显示夸克网盘（会话侧边）'),
            h('div', { className: 'dq-set-desc' }, '打开后，会话右侧栏会多出一个「夸克网盘」标签页，聊天时可以直接翻网盘文件。'),
            h('div', { className: 'dq-set-desc' }, tabReady ? '右侧栏支持：已就绪' : '右侧栏支持：未检测到（这个版本可能没有右侧栏）'),
          ),
          h('button', {
            className: rightOn ? 'dq-btn dq-btn-p' : 'dq-btn',
            onClick: function () { setRightPref(!rightOn) },
          }, rightOn ? '已开启' : '已关闭'),
        ),
        h('div', { className: 'dq-set-row' },
          h('div', { className: 'dq-set-text' },
            h('div', { className: 'dq-set-desc' }, '也可以随时在夸克网盘面板底部点「右侧栏」手动打开。'),
          ),
          h('button', {
            className: 'dq-btn',
            onClick: function () {
              if (!openRightPane()) sayGlobal('右侧栏打不开，可能当前不在会话里')
            },
          }, '现在打开'),
        ),
        h('div', { className: 'dq-set-row dq-set-plain' },
          h('div', { className: 'dq-set-text' },
            h('div', { className: 'dq-thanks-title' }, '致谢'),
            h('div', { className: 'dq-set-desc' }, '整体做法借鉴了 dsh-ima（github.com/ikevss/dsh-ima）；网盘操作全部由夸克官方的 quarkclouddrive skill 提供，本插件只做包装。'),
          ),
        ),
      )
    }

    /** 设置页这类不在 QuarkPage 里的地方也要能提示一句话 */
    function sayGlobal(msg) {
      try { console.warn('[dsh-quark] ' + msg) } catch (e) { /* 忽略 */ }
    }

    // ── 注册 ──────────────────────────────────────────────────────────────
    function apply(ctx) {
      clientCtx = ctx
      loadRightPref()
      panelPref.load()
      // 打开右侧栏开关时顺手把面板拉出来
      rightPref.onEnable = function () { openRightPane() }
      // 打开左侧栏开关时把主面板切到前面
      panelPref.onEnable = function () {
        try {
          var layout = ctx.get('layout')
          if (layout && typeof layout.selectPanel === 'function') layout.selectPanel(PANEL_ID)
        } catch (e) { /* 打不开就算了 */ }
      }
      injectStyle('dsh-quark-style', CSS)

      ctx.effect(function () {
        return function () {
          var el = document.getElementById('dsh-quark-style')
          if (el && el.parentNode) el.parentNode.removeChild(el)
          clientCtx = null
        }
      }, 'dsh-quark: styles')

      // 左侧栏入口 + 主面板：受「左侧栏」开关控制。关掉时把两个槽位的注册
      // 一起释放（入口图标消失，主面板也不可被选中）；重新打开时再注册。
      var panelDisposers = []
      function disposePanel() {
        for (var i = 0; i < panelDisposers.length; i++) {
          try { panelDisposers[i]() } catch (e) { /* 忽略 */ }
        }
        panelDisposers = []
      }
      function mountPanel() {
        disposePanel()
        panelDisposers.push(ctx.slots.inject('sidebar.panellist', function () {
          return ctx.slots.register({
            name: 'sidebar.panellist',
            id: PANEL_ID,
            order: 1,
            label: '夸克网盘',
          }, Glyph)
        }))
        panelDisposers.push(ctx.slots.inject('main', function () {
          return ctx.slots.register({
            name: 'main',
            key: PANEL_ID,
          }, function QuarkPageGuarded(props) {
            return h(PanelBoundary, null, h(QuarkPage, props))
          })
        }))
      }
      function syncPanel() {
        if (panelPref.enabled) mountPanel()
        else disposePanel()
      }
      panelPref.listeners.push(syncPanel)
      ctx.effect(function () {
        return function () {
          var i = panelPref.listeners.indexOf(syncPanel)
          if (i >= 0) panelPref.listeners.splice(i, 1)
          disposePanel()
        }
      }, 'dsh-quark: panel mount')
      syncPanel()

      // composer 工具行上的空渲染桥：只为拿到本会话的 inputActions / 草稿。
      // 放在左端，视觉上不可见（渲染 null）。
      ctx.slots.inject('conversation.input.left', function () {
        return ctx.slots.register({
          name: 'conversation.input.left',
          id: 'dsh-quark-composer-bridge',
          order: -100,
        }, ComposerBridge)
      })

      // 设置页开关：bundle 详情页里的一块配置（key = 包名）
      ctx.slots.inject('plugins.bundle.config', function () {
        return ctx.slots.register({
          name: 'plugins.bundle.config',
          key: 'dsh-quark',
        }, SettingsSection)
      })

      // 右侧栏 tab：正文与标题注册到 keyed 槽位（只注册正文不构成 tab，
      // 还必须用 sidebarRightTabs.register 声明类型）。两处槽位注册与
      // 类型注册都挂在插件自己的 effect 上，卸载时一起释放。
      ctx.slots.inject('sidebar.right.pane.tab', function () {
        return ctx.slots.register({
          name: 'sidebar.right.pane.tab',
          key: TAB_ID,
        }, RightPaneBody)
      })

      ctx.slots.inject('sidebar.right.pane.tab.title', function () {
        return ctx.slots.register({
          name: 'sidebar.right.pane.tab.title',
          key: TAB_ID,
        }, RightTitle)
      })

      // 右侧栏 tab 类型：sidebarRightTabs 是宿主用 ctx.reflect.provide 注入的
      // 服务，动态客户端插件的 ctx 不一定有 inject()，所以三条路依次尝试：
      // ctx.inject → ctx.on('internal/service') → 立即 ctx.get 一次。
      function registerTabType() {
        var tabs = ctx.get('sidebarRightTabs')
        if (!tabs || typeof tabs.register !== 'function') return false
        ctx.effect(function () {
          return tabs.register({
            id: TAB_ID,
            kind: TAB_KIND,
            title: function () { return '夸克网盘' },
            guide: [{
              id: 'open',
              order: 30,
              title: function () { return '夸克网盘' },
              description: function () { return '在会话右侧翻看和操作夸克网盘文件' },
            }],
          })
        }, 'dsh-quark: rightbar tab type')
        setTabTypeState(true)
        return true
      }

      var tabTypeReady = false
      try { tabTypeReady = registerTabType() } catch (e) { tabTypeReady = false }
      if (!tabTypeReady && typeof ctx.on === 'function') {
        // 服务还没发布：订阅服务注册事件，等它出现再注册一次。
        ctx.on('internal/service', function (name) {
          if (name !== 'sidebarRightTabs' || tabTypeReady) return
          try { tabTypeReady = registerTabType() } catch (e) { /* 下次再说 */ }
        })
      }
    }

    return {
      inject: ['slots'],
      apply: apply,
    }
  },
})
