/**
 * Client half of dsh-session-titler.
 *
 * Registers three seats in the Web page:
 *   - a header action right of the cost chip   (`conversation.session.header.actions`, order 0)
 *   - a session-menu row under "Rename"        (`sidebar.workspaces.session.menu.item`, order 250)
 *   - the confirmation dialog                  (`shell.overlay`)
 *
 * Both entries open the same store; the dialog shows the host's proposal in an
 * editable field and only the explicit confirm calls the shipped rename path
 * (`ctx.sessions.using(...).binding.session.rename`), so a cancelled dialog
 * writes nothing.
 *
 * Hand-written bundle: the module loader materializes `factory(require)` and
 * takes its return value as the module exports. React comes from the browser
 * module table, and no Harness Client package is imported.
 */
window.__ModuleLoader__.load({
  id: 'dsh-session-titler',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    /** Locale namespace and slot ids of this plugin. */
    const NS = 'dsh-session-titler'
    /** Host route proposing a title for one session. */
    const ROUTE = '/session-titler/propose'
    /** Style element id, so a reload cannot stack duplicates. */
    const STYLE_ID = 'dsh-session-titler-style'

    const DICT = {
      zh: {
        action: '生成标题',
        blankHint: '会话还没有内容，无法生成标题',
        dialogTitle: '生成会话标题',
        dialogHint: '标题由整个会话总结得出，可编辑后确认。确认前不会修改会话。',
        currentTitle: '当前标题',
        placeholder: '输入或修改标题',
        apply: '确认修改',
        applying: '正在应用…',
        regenerate: '重新生成',
        cancel: '取消',
        generating: '正在总结整个会话…',
        usedModel: '使用模型：{model}',
        usedModelFallback: '使用模型：{model}（该会话记录的模型在当前 profile 不可用，已回退）',
        noContent: '该会话还没有可总结的内容。',
        noAdapter: '该会话记录的模型路由「{route}」在当前 profile 没有已注册的适配器，默认模型也不可用。请换一个模型，或为当前 profile 配置该 provider。',
        noAdapterUnknown: '当前 profile 里没有可用的模型路由（会话没有记录过模型，默认模型也未注册适配器）。请先在模型选择里指定一个可用模型。',
        forbidden: '本机未授权该请求（插件路由需要 loopback 或受信任主机）。',
        unavailable: '插件 Host 侧不可用，请确认已安装并在当前 profile 中启用。',
        renameFailed: '重命名失败。',
        failed: '生成失败：{message}',
      },
      en: {
        action: 'Generate title',
        blankHint: 'This session has no content to summarize yet',
        dialogTitle: 'Generate session title',
        dialogHint: 'The title summarizes the whole session. Edit it before confirming; nothing is changed until you do.',
        currentTitle: 'Current title',
        placeholder: 'Type a title',
        apply: 'Apply',
        applying: 'Applying…',
        cancel: 'Cancel',
        regenerate: 'Regenerate',
        generating: 'Summarizing the whole session…',
        usedModel: 'Model: {model}',
        usedModelFallback: 'Model: {model} (the model this session recorded is unavailable in this profile, so this is a fallback)',
        noContent: 'This session has nothing to summarize yet.',
        noAdapter: 'The model route this session recorded ("{route}") has no registered adapter in this profile, and neither has the default model. Pick another model, or configure that provider for this profile.',
        noAdapterUnknown: 'No usable model route is available in this profile: the session recorded none and the default model has no registered adapter. Pick an available model first.',
        forbidden: 'This request is not authorized (the plugin route needs a loopback or trusted host).',
        unavailable: 'The plugin host half is unavailable; make sure it is installed and enabled in this profile.',
        renameFailed: 'Rename failed.',
        failed: 'Generation failed: {message}',
      },
    }

    const CSS = `
.st-chip{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 10px;border:none;
border-radius:var(--dsw-radius-sm);cursor:pointer;font-size:12px;line-height:18px;
color:var(--dsw-alias-label-primary);background:var(--dsw-alias-button-tool-bar-fill)}
.st-chip:hover:not(:disabled){background:var(--dsw-alias-button-tool-bar-hover)}
.st-chip:disabled{opacity:.4;cursor:not-allowed}
.st-chip .st-glyph{display:inline-flex;width:14px;height:14px;align-items:center;justify-content:center}
.st-chip .st-glyph svg{width:14px;height:14px}

.st-item{display:flex;align-items:center;gap:6px;width:100%;min-height:34px;padding:6px 8px;border:none;
border-radius:var(--dsw-radius-md);background:transparent;cursor:pointer;font-size:13px;line-height:20px;
color:var(--dsw-alias-label-primary);text-align:left}
.st-item:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.st-item:focus-visible:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);outline:none}
.st-item:disabled{opacity:.4;cursor:not-allowed}
.st-item-icon{display:inline-flex;flex:none;width:14px;height:14px;align-items:center;justify-content:center;
color:var(--dsw-alias-menu-icon)}
.st-item-icon svg{width:14px;height:14px}
.st-item-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

.st-root{pointer-events:auto;position:fixed;inset:0;z-index:1000;display:flex;align-items:center;
justify-content:center;padding:max(24px,var(--dsh-frame-overlay-top,24px)) 24px}
.st-mask{position:absolute;inset:var(--dsh-frame-chrome-top,0px) 0 0;backdrop-filter:var(--dsw-mask-blur)}
.st-mask:after{content:'';position:absolute;inset:0;background:var(--dsw-alias-bg-mask-1)}
.st-dialog{box-sizing:border-box;position:relative;z-index:1;display:flex;flex-direction:column;gap:14px;
width:min(460px,100%);padding:22px 24px 20px;border:0;border-radius:var(--dsw-radius-panel);
background:var(--dsw-alias-bg-layer-2);box-shadow:var(--dsw-elevation-prominent);
color:var(--dsw-alias-label-primary)}
.st-head{display:flex;align-items:center;justify-content:space-between;gap:8px}
.st-title{margin:0;font-size:16px;line-height:24px;font-weight:500}
.st-close{flex:none;display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;
border:none;border-radius:var(--dsw-radius-sm);background:transparent;cursor:pointer;
color:var(--dsw-alias-label-secondary)}
.st-close:hover{background:var(--dsw-alias-interactive-bg-hover)}
.st-note{margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);
overflow-wrap:anywhere}
.st-field{display:flex;align-items:center;gap:6px;height:34px;padding:0 10px;
border:.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-1)}
.st-field:focus-within{border-color:var(--dsw-alias-state-business-primary)}
.st-input{flex:1;min-width:0;border:none;outline:none;background:transparent;font-size:14px;
line-height:22px;color:var(--dsw-alias-label-primary)}
.st-input::placeholder{color:var(--dsw-alias-label-dimmed)}
.st-progress{display:flex;align-items:center;gap:8px;height:34px;font-size:13px;
color:var(--dsw-alias-label-secondary)}
.st-spinner{width:14px;height:14px;border-radius:50%;border:2px solid var(--dsw-alias-border-l3);
border-top-color:var(--dsw-alias-state-business-primary);animation:st-spin 900ms linear infinite}
@keyframes st-spin{to{transform:rotate(360deg)}}
.st-error{margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-state-error-primary);
overflow-wrap:anywhere}
.st-footer{display:flex;align-items:center;justify-content:flex-end;gap:8px}
.st-btn{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;gap:4px;
height:32px;padding:0 14px;border:none;border-radius:var(--dsw-radius-md);cursor:pointer;font-size:14px;
line-height:22px;color:var(--dsw-alias-label-primary);background:transparent}
.st-btn:disabled{cursor:not-allowed;opacity:.4}
.st-btn-ghost{border:.5px solid var(--dsw-alias-border-l3)}
.st-btn-ghost:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.st-btn-primary{background:var(--dsw-alias-button-primary-fill);
color:var(--dsw-alias-label-primary-foreground)}
.st-btn-primary:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover)}
@media (prefers-reduced-motion:reduce){.st-spinner{animation:none}}
`

    /** Four-point sparkle used by both entries. */
    function SparkGlyph() {
      return h(
        'svg',
        { viewBox: '0 0 16 16', 'aria-hidden': 'true', focusable: 'false' },
        h('path', {
          d: 'M6.2 1.6l1.15 2.95L10.3 5.7 7.35 6.85 6.2 9.8 5.05 6.85 2.1 5.7l2.95-1.15L6.2 1.6z',
          fill: 'currentColor',
        }),
        h('path', {
          d: 'M11.4 8.6l.8 2.05 2.05.8-2.05.8-.8 2.05-.8-2.05-2.05-.8 2.05-.8.8-2.05z',
          fill: 'currentColor',
        }),
      )
    }

    /** Small close cross of the dialog header. */
    function CloseGlyph() {
      return h(
        'svg',
        { viewBox: '0 0 16 16', width: 14, height: 14, 'aria-hidden': 'true', focusable: 'false' },
        h('path', {
          d: 'M4 4l8 8M12 4l-8 8',
          fill: 'none',
          stroke: 'currentColor',
          'stroke-width': '1.5',
          'stroke-linecap': 'round',
        }),
      )
    }

    /** Best-effort message of an unknown thrown value. */
    function messageOf(error) {
      if (error instanceof Error) return error.message
      return String(error)
    }

    /**
     * One shared titling session for both entries.
     *
     * @param {object} sessions - the Client `sessions` service (retain + rename).
     * @param {(key: string, params?: object) => string} t - namespace translator.
     */
    function createStore(sessions, t) {
      const idle = () => ({
        open: false,
        phase: 'idle',
        sessionId: null,
        currentTitle: '',
        proposal: '',
        error: null,
        meta: null,
      })
      let state = idle()
      let controller = null
      let disposed = false
      const listeners = new Set()

      const emit = () => {
        for (const listener of [...listeners]) listener()
      }
      const set = (patch) => {
        state = { ...state, ...patch }
        emit()
      }
      const subscribe = (listener) => {
        listeners.add(listener)
        return () => {
          listeners.delete(listener)
        }
      }

      /** Turn one failed envelope into the sentence the dialog shows. */
      const describeFailure = (error) => {
        const code = typeof error?.code === 'string' ? error.code : ''
        if (code === 'no-content') return t('noContent')
        if (code === 'forbidden') return t('forbidden')
        if (code === 'no-adapter') {
          return typeof error?.route === 'string' && error.route !== ''
            ? t('noAdapter', { route: error.route })
            : t('noAdapterUnknown')
        }
        if (error?.status === 404 && code === 'http-404') return t('unavailable')
        return t('failed', { message: typeof error?.message === 'string' ? error.message : '' })
      }

      async function generate() {
        const sessionId = state.sessionId
        if (sessionId === null) return
        if (controller !== null) controller.abort()
        const own = new AbortController()
        controller = own
        set({ phase: 'generating', error: null })
        try {
          const response = await fetch(ROUTE, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ sessionId }),
            signal: own.signal,
          })
          const body = await response.json().catch(() => null)
          if (own.signal.aborted || disposed) return
          if (!response.ok || body === null || body.ok !== true) {
            const failure = body && body.error ? body.error : null
            set({
              phase: 'error',
              error: describeFailure(
                failure ?? { code: `http-${response.status}`, message: `HTTP ${response.status}`, status: response.status },
              ),
            })
            return
          }
          set({ phase: 'ready', proposal: body.value.title, meta: body.value, error: null })
        } catch (error) {
          if (own.signal.aborted || disposed) return
          set({ phase: 'error', error: t('failed', { message: messageOf(error) }) })
        } finally {
          if (controller === own) controller = null
        }
      }

      async function confirm() {
        const sessionId = state.sessionId
        const title = state.proposal.trim()
        if (sessionId === null || title === '') return
        set({ phase: 'applying', error: null })
        try {
          const result = await sessions.using(sessionId, { source: 'workspaceOperation' }, (reference) =>
            reference.binding.session.rename(title),
          )
          if (disposed) return
          if (!result || result.ok !== true) {
            throw new Error(result && result.error ? result.error.message : t('renameFailed'))
          }
          state = idle()
          emit()
        } catch (error) {
          if (disposed) return
          set({ phase: 'ready', error: messageOf(error) })
        }
      }

      return {
        subscribe,
        getSnapshot: () => state,
        open(input) {
          if (!input || typeof input.sessionId !== 'string' || input.sessionId === '') return
          state = {
            ...idle(),
            open: true,
            phase: 'generating',
            sessionId: input.sessionId,
            currentTitle: typeof input.currentTitle === 'string' ? input.currentTitle : '',
          }
          emit()
          void generate()
        },
        setProposal(value) {
          set({ proposal: typeof value === 'string' ? value : '' })
        },
        regenerate() {
          void generate()
        },
        confirm() {
          return confirm()
        },
        cancel() {
          if (controller !== null) {
            controller.abort()
            controller = null
          }
          state = idle()
          emit()
        },
        dispose() {
          disposed = true
          if (controller !== null) {
            controller.abort()
            controller = null
          }
          listeners.clear()
        },
      }
    }

    /** Header action: a chip sitting right of the session's cost chip. */
    function HeaderAction(props) {
      const { sessionId, useSession, t, open } = props
      // `useSession` is a standard prop of this slot; the branch never flips
      // for a mounted occurrence, so the hook stays unconditional in practice.
      const blank = typeof useSession === 'function' ? useSession((snapshot) => snapshot?.blank === true) : false
      const disabled = typeof sessionId !== 'string' || sessionId === '' || blank === true
      return h(
        'button',
        {
          type: 'button',
          className: 'st-chip',
          disabled,
          title: disabled ? t('blankHint') : t('action'),
          'aria-label': t('action'),
          onClick: () => {
            open({ sessionId, currentTitle: '' })
          },
        },
        h('span', { className: 'st-glyph' }, SparkGlyph()),
        h('span', null, t('action')),
      )
    }

    /** Session "..." menu row, placed right under the shipped "Rename" row. */
    function GenerateTitleMenuItem(props) {
      const { sessionId, displayTitle, useMenuOpenState, t, open } = props
      const menuState = typeof useMenuOpenState === 'function' ? useMenuOpenState() : null
      return h(
        'button',
        {
          type: 'button',
          role: 'menuitem',
          className: 'st-item',
          onClick: () => {
            // The list's keyboard walk and focus return read the DOM; the menu
            // stays owned by its own open state, which this row must dismiss.
            if (Array.isArray(menuState) && typeof menuState[1] === 'function') menuState[1](false)
            open({
              sessionId,
              currentTitle: typeof displayTitle === 'string' ? displayTitle : '',
            })
          },
        },
        h('span', { className: 'st-item-icon' }, SparkGlyph()),
        h('span', { className: 'st-item-label' }, t('action')),
      )
    }

    /** Confirmation dialog rendered in the frame-wide overlay layer. */
    function GenerateTitleDialog(props) {
      const { t, store } = props
      const state = React.useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
      const inputRef = React.useRef(null)
      const restoreRef = React.useRef(null)

      React.useEffect(() => {
        if (!state.open) return undefined
        const previous = document.activeElement
        restoreRef.current = previous
        return () => {
          if (previous && typeof previous.focus === 'function') previous.focus()
        }
      }, [state.open])

      React.useEffect(() => {
        if (!state.open) return undefined
        const onKeyDown = (event) => {
          if (event.key !== 'Escape') return
          event.stopPropagation()
          store.cancel()
        }
        document.addEventListener('keydown', onKeyDown, true)
        return () => document.removeEventListener('keydown', onKeyDown, true)
      }, [state.open, store])

      React.useEffect(() => {
        if (state.phase !== 'ready') return
        const input = inputRef.current
        if (input) {
          input.focus()
          input.select()
        }
      }, [state.phase, state.proposal])

      if (!state.open) return null

      const busy = state.phase === 'generating' || state.phase === 'applying'
      const title = state.proposal.trim()
      // The host answers which route actually produced the proposal, so a
      // fallback to another model is visible instead of silent.
      const usedModel =
        state.meta !== null && typeof state.meta.provider === 'string' && typeof state.meta.model === 'string'
          ? `${state.meta.provider}/${state.meta.model}`
          : ''

      return h(
        'div',
        {
          className: 'st-root',
          onMouseDown: (event) => {
            if (event.target === event.currentTarget) store.cancel()
          },
        },
        h('div', { className: 'st-mask', 'aria-hidden': 'true' }),
        h(
          'div',
          {
            className: 'st-dialog',
            role: 'dialog',
            'aria-modal': 'true',
            'aria-labelledby': 'st-dialog-title',
          },
          h(
            'div',
            { className: 'st-head' },
            h('h2', { className: 'st-title', id: 'st-dialog-title' }, t('dialogTitle')),
            h(
              'button',
              {
                type: 'button',
                className: 'st-close',
                'aria-label': t('cancel'),
                onClick: () => store.cancel(),
              },
              CloseGlyph(),
            ),
          ),
          state.currentTitle === ''
            ? null
            : h('p', { className: 'st-note' }, `${t('currentTitle')}: ${state.currentTitle}`),
          h('p', { className: 'st-note' }, t('dialogHint')),
          usedModel === ''
            ? null
            : h(
                'p',
                { className: 'st-note' },
                t(state.meta.fallback === true ? 'usedModelFallback' : 'usedModel', { model: usedModel }),
              ),
          state.phase === 'generating'
            ? h(
                'div',
                { className: 'st-progress', role: 'status' },
                h('span', { className: 'st-spinner' }),
                h('span', null, t('generating')),
              )
            : h(
                'div',
                { className: 'st-field' },
                h('input', {
                  ref: inputRef,
                  className: 'st-input',
                  type: 'text',
                  value: state.proposal,
                  maxLength: 200,
                  disabled: state.phase === 'applying',
                  placeholder: t('placeholder'),
                  'aria-label': t('dialogTitle'),
                  onChange: (event) => store.setProposal(event.target.value),
                  onKeyDown: (event) => {
                    if (event.key !== 'Enter') return
                    event.preventDefault()
                    void store.confirm()
                  },
                }),
              ),
          state.error === null ? null : h('p', { className: 'st-error', role: 'alert' }, state.error),
          h(
            'div',
            { className: 'st-footer' },
            h(
              'button',
              {
                type: 'button',
                className: 'st-btn st-btn-ghost',
                disabled: busy,
                onClick: () => store.cancel(),
              },
              t('cancel'),
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'st-btn st-btn-ghost',
                disabled: busy,
                onClick: () => store.regenerate(),
              },
              t('regenerate'),
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'st-btn st-btn-primary',
                disabled: busy || title === '',
                onClick: () => void store.confirm(),
              },
              state.phase === 'applying' ? t('applying') : t('apply'),
            ),
          ),
        ),
      )
    }

    return {
      inject: ['slots', 'locale', 'sessions'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, DICT), 'session-titler: dictionaries')
        ctx.effect(() => {
          const element = document.createElement('style')
          element.setAttribute('data-plugin', NS)
          element.textContent = CSS
          document.head.appendChild(element)
          return () => {
            element.remove()
          }
        }, 'session-titler: styles')

        const t = ctx.locale.bind(NS)
        const store = createStore(ctx.sessions, t)
        ctx.effect(() => () => store.dispose(), 'session-titler: store')

        ctx.slots.inject('conversation.session.header.actions', () =>
          ctx.slots.register(
            {
              name: 'conversation.session.header.actions',
              id: 'session-titler',
              // Sits right after the agent-preset chip (order -10) and keeps the
              // two cost chips adjacent: cost-meter is -5 and its details row 1.
              order: -8,
              locale: NS,
              inject: () => ({ t, open: store.open }),
            },
            HeaderAction,
          ),
        )

        ctx.slots.inject('sidebar.workspaces.session.menu.item', () =>
          ctx.slots.register(
            {
              name: 'sidebar.workspaces.session.menu.item',
              id: 'session-titler',
              order: 250,
              locale: NS,
              inject: () => ({ t, open: store.open }),
            },
            GenerateTitleMenuItem,
          ),
        )

        ctx.slots.inject('shell.overlay', () =>
          ctx.slots.register(
            {
              name: 'shell.overlay',
              id: 'session-titler-dialog',
              order: 0,
              label: () => NS,
              inject: () => ({ t, store }),
            },
            GenerateTitleDialog,
          ),
        )
      },
    }
  },
})
