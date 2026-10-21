window.__ModuleLoader__.load({
  id: '@local/dsh-selection-actions',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useEffect, useRef, useState } = React;

    const ID = '@local/dsh-selection-actions';
    const PLUGIN_VERSION = '1.9.1';
    const ASK_TAB_ID = '@local/dsh-selection-actions/ask';
    const ASK_KIND = 'sidebarask';
    const ASK_PREFIX = 'dsh-resource://sidebarask/session/';
    const NS = 'selection-actions';
    const MAX_QUOTE = 6000;
    const HIDDEN_STORAGE_KEY = 'dsh:selection-actions:hidden-sessions';
    const SIDE_TABS_STORAGE_KEY = 'dsh:selection-actions:side-tabs';
    /** Node kinds that are conversational plumbing rather than side-chat content. */
    const HIDDEN_KINDS = new Set(['context', 'system-prompt', 'turn-trigger']);

    const zh = {
      'action.addToChat': '加入对话',
      'action.askSide': '在侧边提问',
      'toolbar.label': '选中文字操作',
      'tab.title': '侧边提问',
      'chip.selection': '1 处选中',
      'chip.remove': '移除引用',
      'chip.hint': '发送时会一并带上这段选中内容',
      'toast.opened': '已在右侧栏打开侧边对话',
      'toast.noContext': '主对话正在运行，侧边对话已打开（未继承上下文）',
      'toast.createFailed': '侧边对话创建失败',
      'toast.failed': '侧边对话打开失败，选中内容已复制',
      'toast.sendFailed': '发送失败，内容已放回输入框，请手动发送',
      'toast.fallbackText': '附件方式不可用，已按普通消息发出',
    };
    const en = {
      'action.addToChat': 'Add to chat',
      'action.askSide': 'Ask in side chat',
      'toolbar.label': 'Selection actions',
      'tab.title': 'Side chat',
      'chip.selection': '1 selection',
      'chip.remove': 'Remove',
      'chip.hint': 'The selection is sent with your message',
      'toast.opened': 'Side chat opened in the right sidebar',
      'toast.noContext': 'Main conversation is busy; side chat opened without inherited context',
      'toast.createFailed': 'Side chat could not be created',
      'toast.failed': 'Side chat failed to open; the selection was copied',
      'toast.sendFailed': 'Send failed; the content is back in the composer for a manual send',
      'toast.fallbackText': 'Attachment unavailable; the message was sent as plain text',
    };

    /** Canonical side-chat address: session id plus the inherited-turn cutoff. */
    function askAddress(sessionId, cutoffTurn, snippet) {
      const query = new URLSearchParams();
      query.set('cutoffTurn', String(cutoffTurn));
      if (typeof snippet === 'string' && snippet !== '') query.set('snippet', snippet);
      return `${ASK_PREFIX}${encodeURIComponent(sessionId)}?${query}`;
    }

    function parseAskAddress(value) {
      let url;
      try {
        url = new URL(value);
      } catch (_invalid) {
        return undefined;
      }
      if (url.protocol !== 'dsh-resource:' || url.hostname.toLowerCase() !== 'sidebarask') return undefined;
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts.length !== 2 || parts[0] !== 'session') return undefined;
      let sessionId;
      try {
        sessionId = decodeURIComponent(parts[1]);
      } catch (_invalidEncoding) {
        return undefined;
      }
      const raw = url.searchParams.get('cutoffTurn');
      const parsedTurn = raw === null ? 0 : Number.parseInt(raw, 10);
      const snippet = url.searchParams.get('snippet') ?? undefined;
      return {
        sessionId,
        cutoffTurn: Number.isFinite(parsedTurn) && parsedTurn > 0 ? parsedTurn : 0,
        snippet,
      };
    }

    const CSS = [
      '.dshsel-bar{position:fixed;display:flex;align-items:center;gap:2px;padding:4px;border-radius:12px;',
      'background:var(--dsw-alias-bg-layer-2,rgba(255,255,255,.97));border:.5px solid var(--dsw-alias-border-l4,rgba(0,0,0,.1));',
      'box-shadow:0 10px 28px rgba(0,0,0,.18),0 2px 6px rgba(0,0,0,.08);z-index:2147483000;',
      'backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);user-select:none}',
      '.dshsel-btn{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 10px;border:none;border-radius:8px;',
      'background:transparent;color:var(--dsw-alias-label-primary,#111);font-size:12.5px;font-weight:500;line-height:18px;',
      'cursor:pointer;white-space:nowrap;font-family:inherit}',
      '.dshsel-btn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06))}',
      '.dshsel-btn:active{transform:translateY(.5px)}',
      '.dshsel-icon{flex:none;color:var(--dsw-alias-label-secondary,#555)}',
      '.dshsel-sep{width:1px;height:16px;flex:none;margin:0 2px;background:var(--dsw-alias-border-l3,rgba(0,0,0,.1))}',
      '.dshsel-toast{position:fixed;left:50%;bottom:96px;transform:translateX(-50%);z-index:2147483001;max-width:min(520px,80vw);',
      'padding:8px 14px;border-radius:10px;background:var(--dsw-alias-bg-overlay,rgba(20,20,24,.92));color:var(--dsw-alias-label-primary,#fff);',
      'font-size:12.5px;line-height:18px;box-shadow:0 12px 32px rgba(0,0,0,.24);pointer-events:none}',
      '.dshask-root{position:relative;display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden;background:var(--dsw-alias-bg-base)}',
      '.dshask-root>[data-conversation-content]{flex:1;min-height:0}',
      '.dshask-root [hidden]{display:none !important}',
      '.dshsel-chipdock{position:absolute;z-index:6;pointer-events:none;display:flex;align-items:flex-start;gap:6px;max-width:calc(100% - 24px)}',
      '.dshsel-chip{pointer-events:auto;display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 7px 0 9px;border-radius:999px;',
      'border:.5px solid var(--dsw-alias-border-l4,rgba(0,0,0,.1));background:var(--dsw-alias-bg-layer-2,#fff);color:var(--dsw-alias-label-secondary,#555);',
      'font-size:12px;line-height:18px;cursor:pointer;font-family:inherit;box-shadow:0 2px 8px rgba(0,0,0,.08);white-space:nowrap}',
      '.dshsel-chip:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06))}',
      '.dshsel-chip:active{transform:translateY(.5px)}',
      '.dshsel-chipIcon{flex:none;color:var(--dsw-alias-label-tertiary,#888)}',
      '.dshsel-chipRemove{pointer-events:auto;width:20px;height:20px;padding:0;border:none;border-radius:50%;background:transparent;',
      'color:var(--dsw-alias-label-caption,#999);font-size:14px;line-height:1;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;font-family:inherit}',
      '.dshsel-chipRemove:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06));color:var(--dsw-alias-label-primary,#111)}',
      '.dshsel-chipPopover{position:absolute;left:0;bottom:36px;z-index:7;min-width:260px;max-width:min(420px,calc(100vw - 64px));max-height:220px;overflow:auto;',
      'padding:10px 12px;border-radius:10px;border:.5px solid var(--dsw-alias-border-l4,rgba(0,0,0,.1));background:var(--dsw-alias-bg-layer-1,#fff);',
      'color:var(--dsw-alias-label-primary,#111);font-size:12px;line-height:18px;white-space:pre-wrap;box-shadow:0 12px 32px rgba(0,0,0,.18);pointer-events:auto}',
      '.dshsel-chipHint{margin-top:6px;color:var(--dsw-alias-label-caption,#999);font-size:11px;line-height:16px}',
    ].join('');

    function snippetOf(text) {
      const flat = text.replace(/\s+/g, ' ').trim();
      return flat.length > 14 ? flat.slice(0, 14) + '…' : flat;
    }

    /** The highest turn number currently rendered in the main conversation. */
    function mainConversationTurn() {
      let max = 0;
      for (const item of document.querySelectorAll('[data-conversation-content] [data-chat-flow-kind]')) {
        if (item.closest('[data-sidebar-ask-tab]') !== null || item.closest('[data-sidebar-chat]') !== null) continue;
        const turn = Number.parseInt(item.getAttribute('data-chat-turn') ?? '', 10);
        if (Number.isFinite(turn) && turn > max) max = turn;
      }
      return max;
    }

    /** Chips waiting to ride the next message, keyed by the Session's composer. */
    const composerChips = new Map();
    /** Mounted chip hosts per Session. */
    const chipListeners = new Map();
    /** Inherited-turn cutoff per side-chat session. */
    const sideCutoffs = new Map();
    /** Short tab-title snippets for side chats. */
    const sideSnippets = new Map();
    /** Hooks the apply scope publishes for components rendered outside it. */
    const runtime = {
      hideSession: () => {},
      archiveSession: () => {},
      deliver: () => {},
    };
    /** A tiny toast channel shared by the action owner and the mounted toolbar. */
    const status = {
      message: undefined,
      listeners: new Set(),
      set(message) {
        this.message = message;
        for (const listener of [...this.listeners]) listener(message);
      },
    };

    const delay = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

    function setComposerChip(sessionId, text) {
      if (typeof sessionId !== 'string' || sessionId === '') return;
      if (typeof text !== 'string' || text.trim() === '') composerChips.delete(sessionId);
      else composerChips.set(sessionId, text);
      const listeners = chipListeners.get(sessionId);
      if (listeners !== undefined) for (const listener of [...listeners]) listener();
    }

    function buildChipPrompt(quote, question) {
      const raw = quote.trim();
      const ask = (question || '').trim();
      return ask === '' ? raw : `${raw}\n\n${ask}`;
    }

    /** Intercept the composer's send gesture while a chip rides along. */
    function installChipInterception(container, sessionId, inputActions, draftRef) {
      if (container === null || container === undefined) return () => {};
      const submit = () => {
        const chip = composerChips.get(sessionId);
        if (chip === undefined) return false;
        const question = draftRef.current || '';
        setComposerChip(sessionId, '');
        try {
          if (inputActions !== undefined && typeof inputActions.setDraft === 'function') inputActions.setDraft('');
        } catch (_draftError) {
          /* remote delivery below is the source of truth */
        }
        const restore = () => {
          setComposerChip(sessionId, chip);
          try {
            if (inputActions !== undefined && typeof inputActions.setDraft === 'function') inputActions.setDraft(question);
          } catch (_draftError) {
            /* best effort */
          }
        };
        runtime.deliver(sessionId, chip, question, restore);
        return true;
      };
      const onKeyDown = (event) => {
        if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        if (!submit()) return;
        event.preventDefault();
        event.stopPropagation();
      };
      const onMouseDown = (event) => {
        const target = event.target;
        const button = target !== null && target !== undefined && typeof target.closest === 'function' ? target.closest('button') : null;
        if (button === null) return;
        const label = `${button.getAttribute('aria-label') || ''} ${button.getAttribute('title') || ''}`;
        if (!/发送消息|Send message/.test(label)) return;
        if (!submit()) return;
        event.preventDefault();
        event.stopPropagation();
      };
      container.addEventListener('keydown', onKeyDown, true);
      container.addEventListener('mousedown', onMouseDown, true);
      return () => {
        container.removeEventListener('keydown', onKeyDown, true);
        container.removeEventListener('mousedown', onMouseDown, true);
      };
    }

    function findMainComposer() {
      const editors = [...document.querySelectorAll('[data-conversation-content] [contenteditable="true"]')];
      return editors.find((editor) => editor.closest('[data-sidebar-ask-tab]') === null && editor.closest('[data-sidebar-chat]') === null);
    }

    function findMainComposerSeat() {
      const seats = [...document.querySelectorAll('[data-composer-seat]')];
      return seats.find((seat) => seat.closest('[data-sidebar-ask-tab]') === null && seat.closest('[data-sidebar-chat]') === null);
    }

    function findSideComposer() {
      const editors = [...document.querySelectorAll('[data-sidebar-ask-tab] [contenteditable="true"]')];
      return editors.length > 0 ? editors[editors.length - 1] : undefined;
    }

    function clearSelection() {
      const selection = window.getSelection();
      if (selection !== null && typeof selection.removeAllRanges === 'function') selection.removeAllRanges();
    }

    function selectionHit() {
      const selection = window.getSelection();
      if (selection === null || selection.isCollapsed || selection.rangeCount === 0) return undefined;
      const text = selection.toString().replace(/\s+$/, '');
      if (text.trim() === '') return undefined;
      const range = selection.getRangeAt(0);
      const start = range.startContainer;
      const element = start.nodeType === Node.ELEMENT_NODE ? start : start.parentElement;
      if (element === null || element === undefined) return undefined;
      if (element.closest('[contenteditable="true"], [contenteditable=""]') !== null) return undefined;
      if (element.closest('[data-sidebar-ask-tab], [data-sidebar-chat]') !== null) return undefined;
      if (element.closest('[data-conversation-content]') === null) return undefined;
      const rects = range.getClientRects();
      const rect = rects.length > 0 ? rects[rects.length - 1] : range.getBoundingClientRect();
      if (rect === undefined || (rect.width === 0 && rect.height === 0)) return undefined;
      return {
        center: rect.left + rect.width / 2,
        top: rect.top,
        bottom: rect.bottom,
        text: text.length > MAX_QUOTE ? text.slice(0, MAX_QUOTE) : text,
      };
    }

    function QuoteGlyph(props) {
      const size = props && props.size ? props.size : 14;
      return h('svg', { className: 'dshsel-icon', width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true },
        h('path', { d: 'M3 3.5h10v7.2H7.4L4.6 13v-2.3H3V3.5Z', stroke: 'currentColor', strokeWidth: 1.3, strokeLinejoin: 'round' }),
        h('path', { d: 'M5.6 6.2h4.8M5.6 8.4h3.2', stroke: 'currentColor', strokeWidth: 1.2, strokeLinecap: 'round' }),
      );
    }

    /** The selection chip shown above a composer. */
    function SelectionChip(props) {
      const { sessionId, t } = props;
      const [chip, setChip] = useState(composerChips.get(sessionId));
      const [preview, setPreview] = useState(false);
      useEffect(() => {
        const listener = () => { setChip(composerChips.get(sessionId)); };
        let set = chipListeners.get(sessionId);
        if (set === undefined) {
          set = new Set();
          chipListeners.set(sessionId, set);
        }
        set.add(listener);
        setChip(composerChips.get(sessionId));
        return () => {
          const current = chipListeners.get(sessionId);
          if (current !== undefined) {
            current.delete(listener);
            if (current.size === 0) chipListeners.delete(sessionId);
          }
        };
      }, [sessionId]);
      if (chip === undefined) return null;
      return h('div', { className: 'dshsel-chipdock', style: { position: 'relative' } },
        h('button', {
          type: 'button',
          className: 'dshsel-chip',
          title: t('chip.hint'),
          onClick: () => { setPreview((value) => !value); },
        },
          h(QuoteGlyph, { size: 14 }), h('span', null, t('chip.selection'))),
        h('button', {
          type: 'button',
          className: 'dshsel-chipRemove',
          title: t('chip.remove'),
          onClick: () => { setPreview(false); setComposerChip(sessionId, ''); },
        }, '×'),
        preview ? h('div', { className: 'dshsel-chipPopover' }, chip, h('div', { className: 'dshsel-chipHint' }, t('chip.hint'))) : null,
      );
    }

    /** The session-scoped mount: selection toolbar plus the main composer chip. */
    function SelectionActions(props) {
      const { sessionId, useInput, inputActions, t, openSideAsk } = props;
      const input = useInput ? useInput((state) => state) : undefined;
      const draftRef = useRef('');
      draftRef.current = input !== undefined && typeof input.draft === 'string' ? input.draft : '';
      const sessionRef = useRef(sessionId);
      sessionRef.current = sessionId;
      const [hit, setHit] = useState(undefined);
      const [toast, setToast] = useState(undefined);
      const [chip, setChipState] = useState(composerChips.get(sessionId));
      const [anchor, setAnchor] = useState(undefined);

      useEffect(() => {
        const listener = (message) => { setToast(message); };
        status.listeners.add(listener);
        return () => { status.listeners.delete(listener); };
      }, []);

      useEffect(() => {
        const listener = () => { setChipState(composerChips.get(sessionId)); };
        let set = chipListeners.get(sessionId);
        if (set === undefined) {
          set = new Set();
          chipListeners.set(sessionId, set);
        }
        set.add(listener);
        setChipState(composerChips.get(sessionId));
        return () => {
          const current = chipListeners.get(sessionId);
          if (current !== undefined) {
            current.delete(listener);
            if (current.size === 0) chipListeners.delete(sessionId);
          }
        };
      }, [sessionId]);

      useEffect(() => {
        if (toast === undefined) return undefined;
        const timer = setTimeout(() => { setToast(undefined); }, 2800);
        return () => { clearTimeout(timer); };
      }, [toast]);

      useEffect(() => {
        let timer;
        let pointerDown = false;
        const evaluate = () => { setHit(selectionHit()); };
        const scheduleEvaluation = (delayMs) => {
          clearTimeout(timer);
          timer = setTimeout(evaluate, delayMs);
        };
        const onSelectionChange = () => {
          // Never float the toolbar while a drag is still in progress: it could
          // cover the text and hijack the next click mid-selection.
          if (pointerDown) {
            clearTimeout(timer);
            return;
          }
          scheduleEvaluation(180);
        };
        const onPointerDown = (event) => {
          const target = event.target;
          if (target !== null && target !== undefined && typeof target.closest === 'function'
            && target.closest('.dshsel-bar, .dshsel-toast, .dshsel-chip, .dshsel-chipdock, .dshsel-chipPopover, .dshsel-chipRemove') !== null) return;
          pointerDown = true;
          clearTimeout(timer);
          setHit(undefined);
        };
        const onPointerUp = () => {
          if (!pointerDown) return;
          pointerDown = false;
          scheduleEvaluation(160);
        };
        const onScroll = () => { setHit(undefined); };
        const onKeyDown = (event) => { if (event.key === 'Escape') setHit(undefined); };
        document.addEventListener('selectionchange', onSelectionChange);
        document.addEventListener('pointerdown', onPointerDown, true);
        document.addEventListener('mousedown', onPointerDown, true);
        document.addEventListener('pointerup', onPointerUp, true);
        document.addEventListener('mouseup', onPointerUp, true);
        window.addEventListener('scroll', onScroll, true);
        document.addEventListener('keydown', onKeyDown);
        return () => {
          clearTimeout(timer);
          document.removeEventListener('selectionchange', onSelectionChange);
          document.removeEventListener('pointerdown', onPointerDown, true);
          document.removeEventListener('mousedown', onPointerDown, true);
          document.removeEventListener('pointerup', onPointerUp, true);
          document.removeEventListener('mouseup', onPointerUp, true);
          window.removeEventListener('scroll', onScroll, true);
          document.removeEventListener('keydown', onKeyDown);
        };
      }, []);

      useEffect(() => {
        const update = () => {
          const seat = findMainComposerSeat();
          if (seat === null || seat === undefined) { setAnchor(undefined); return; }
          const rect = seat.getBoundingClientRect();
          if (rect.height === 0) { setAnchor(undefined); return; }
          setAnchor({ left: Math.round(rect.left + 12), bottom: Math.round(window.innerHeight - rect.top + 10) });
        };
        update();
        const timer = setInterval(update, 600);
        window.addEventListener('resize', update);
        return () => { clearInterval(timer); window.removeEventListener('resize', update); };
      }, []);

      useEffect(() => {
        let disposed = false;
        let cleanup = () => {};
        let attempts = 0;
        const timer = setInterval(() => {
          if (disposed) return;
          attempts += 1;
          const editor = findMainComposer();
          const container = editor !== undefined && editor !== null ? editor.closest('[data-conversation-content]') : null;
          if (container !== null) {
            clearInterval(timer);
            cleanup = installChipInterception(container, sessionId, inputActions, draftRef);
            return;
          }
          if (attempts > 40) clearInterval(timer);
        }, 500);
        return () => {
          disposed = true;
          clearInterval(timer);
          cleanup();
        };
      }, [sessionId, inputActions]);

      const addToChat = (quote) => {
        setHit(undefined);
        clearSelection();
        setComposerChip(sessionRef.current, quote);
        setTimeout(() => {
          const editor = findMainComposer();
          if (editor !== null && editor !== undefined && typeof editor.focus === 'function') editor.focus();
        }, 80);
      };

      const askInSide = (quote) => {
        setHit(undefined);
        clearSelection();
        if (typeof openSideAsk !== 'function') return;
        openSideAsk(sessionRef.current, quote);
      };

      let bar = null;
      if (hit !== undefined) {
        const width = 230;
        const left = Math.min(Math.max(hit.center, width / 2 + 10), window.innerWidth - width / 2 - 10);
        const above = hit.top > 64;
        bar = h('div', {
          className: 'dshsel-bar',
          role: 'toolbar',
          'aria-label': t('toolbar.label'),
          style: {
            left: `${left}px`,
            top: `${above ? hit.top - 48 : hit.bottom + 10}px`,
            transform: 'translateX(-50%)',
          },
          onMouseDown: (event) => { event.preventDefault(); },
        },
          h('button', { type: 'button', className: 'dshsel-btn', onClick: () => {
            const fresh = selectionHit();
            addToChat(fresh !== undefined ? fresh.text : hit.text);
          } },
            h(QuoteGlyph, { size: 14 }), h('span', null, t('action.addToChat'))),
          h('span', { className: 'dshsel-sep' }),
          h('button', { type: 'button', className: 'dshsel-btn', onClick: () => {
            const fresh = selectionHit();
            askInSide(fresh !== undefined ? fresh.text : hit.text);
          } },
            h(QuoteGlyph, { size: 14 }), h('span', null, t('action.askSide'))),
        );
      }

      const chipAnchor = chip !== undefined && anchor !== undefined
        ? h('div', { className: 'dshsel-chipdock', style: { position: 'fixed', left: `${anchor.left}px`, bottom: `${anchor.bottom}px`, zIndex: 2147483000 } },
            h(SelectionChip, { sessionId, t }))
        : null;

      return h(React.Fragment, null,
        bar,
        chipAnchor,
        toast !== undefined ? h('div', { className: 'dshsel-toast', role: 'status' }, toast) : null,
      );
    }

    /** The side-chat tab shell: binds the side Session reference around its conversation seat. */
    function AskTabShell(props) {
      const { useResource, useTabInfo, SessionProvider, renderSlot } = props;
      const { tab } = useTabInfo();
      const resource = useResource(tab.contentId);
      const parsed = parseAskAddress(tab.contentId);
      if (parsed !== undefined) {
        if (parsed.cutoffTurn > 0) sideCutoffs.set(parsed.sessionId, parsed.cutoffTurn);
        if (parsed.snippet !== undefined) sideSnippets.set(parsed.sessionId, parsed.snippet);
        runtime.hideSession(parsed.sessionId);
      }
      const reference = resource !== undefined && resource.value !== undefined ? resource.value.reference : undefined;
      const bound = reference !== undefined && SessionProvider !== undefined
        ? h(SessionProvider, { session: reference }, renderSlot('sidebar.ask.conversation', {}))
        : null;
      return h('div', { className: 'dshask-root', 'data-sidebar-ask-tab': '' }, bound);
    }

    /**
     * The side-chat conversation body. The forked Session inherits the parent
     * conversation for model context, while every chat node belonging to an
     * inherited turn (turn <= cutoff) is hidden, so only the new side exchange
     * is on screen.
     */
    function AskConversationPane(props) {
      const { sessionId, inputActions, useInput, renderFactorySlot, t } = props;
      const rootRef = useRef(null);
      const input = useInput ? useInput((state) => state) : undefined;
      const draftRef = useRef('');
      draftRef.current = input !== undefined && typeof input.draft === 'string' ? input.draft : '';
      const [dock, setDock] = useState(undefined);

      useEffect(() => {
        const update = () => {
          const root = rootRef.current;
          if (root === null) return;
          const seat = root.querySelector('[data-composer-seat]');
          if (seat === null) { setDock(undefined); return; }
          const rootRect = root.getBoundingClientRect();
          const seatRect = seat.getBoundingClientRect();
          if (seatRect.height === 0) { setDock(undefined); return; }
          setDock({ left: 12, bottom: Math.round(rootRect.bottom - seatRect.top + 10) });
        };
        update();
        const timer = setInterval(update, 600);
        window.addEventListener('resize', update);
        return () => { clearInterval(timer); window.removeEventListener('resize', update); };
      }, []);

      useEffect(() => {
        const root = rootRef.current;
        return installChipInterception(root, sessionId, inputActions, draftRef);
      }, [sessionId, inputActions]);

      useEffect(() => {
        if (typeof sessionId !== 'string') return undefined;
        const cutoffTurn = sideCutoffs.get(sessionId);
        const root = rootRef.current;
        if (root === null) return undefined;
        let stickBottom = true;

        const scroll = () => root.querySelector('[data-conversation-scroll]');

        // Elements hidden by the seam pass are remembered so a wrapper that
        // starts empty (a loading placeholder) and later hosts the transcript is
        // restored instead of swallowing every message.
        const seamHidden = new Set();
        const restoreSeamElement = (el) => {
          if (el.isConnected) el.style.display = '';
          seamHidden.delete(el);
        };

        const hideInherited = () => {
          for (const el of [...seamHidden]) {
            if (!el.isConnected || el.querySelector('[data-chat-flow-kind]') !== null) restoreSeamElement(el);
          }
          let firstVisibleTop = Number.POSITIVE_INFINITY;
          for (const item of root.querySelectorAll('[data-chat-flow-kind]')) {
            const kind = item.getAttribute('data-chat-flow-kind');
            const turn = Number.parseInt(item.getAttribute('data-chat-turn') ?? '', 10);
            const inherited = cutoffTurn !== undefined && Number.isFinite(turn) && turn <= cutoffTurn;
            const plumbing = kind !== null && HIDDEN_KINDS.has(kind);
            if (inherited || plumbing) {
              if (item.style.display !== 'none') item.style.display = 'none';
            } else {
              if (item.style.display === 'none' && item.getAttribute('data-turn-process-hidden') !== 'true') item.style.display = '';
              const rect = item.getBoundingClientRect();
              if (rect.height > 0 && rect.top < firstVisibleTop) firstVisibleTop = rect.top;
            }
          }
          // Hide the "load earlier" control: inherited history is never shown.
          for (const button of root.querySelectorAll('button')) {
            const label = (button.textContent || '').trim();
            if (label === '加载更早' || label === '加载更多' || label === 'Load earlier' || label === 'Load more') {
              button.style.display = 'none';
            }
          }
          // Hide leftover history seams (collapsed summaries, paging anchors) that
          // are not part of any chat flow item and sit above the new exchange.
          const scrollerNode = scroll();
          if (scrollerNode !== null) {
            const seat = scrollerNode.querySelector('[data-composer-seat]');
            const seatTop = seat !== null ? seat.getBoundingClientRect().top : Number.POSITIVE_INFINITY;
            const threshold = Math.min(firstVisibleTop, seatTop);
            for (const el of scrollerNode.querySelectorAll('*')) {
              if (el.closest('[data-chat-flow-kind]') !== null) continue;
              if (el.closest('[contenteditable="true"], [data-composer-seat], [data-conversation-region="composer"]') !== null) continue;
              // Never hide a wrapper that holds chat content: that would erase the
              // whole transcript (the frame renders its messages as descendants).
              if (el.querySelector('[data-chat-flow-kind]') !== null) continue;
              if (el.querySelector('[data-composer-seat]') !== null) continue;
              if (el.children.length > 1) continue;
              const text = (el.textContent || '').trim();
              if (text === '') continue;
              const rect = el.getBoundingClientRect();
              if (rect.height === 0) continue;
              if (rect.bottom < threshold - 4) {
                el.style.display = 'none';
                seamHidden.add(el);
              }
            }
          }
          const scroller = scroll();
          if (scroller !== null && stickBottom) scroller.scrollTop = scroller.scrollHeight;
        };

        hideInherited();
        const observer = new MutationObserver(hideInherited);
        observer.observe(root, { childList: true, subtree: true });
        const scroller = scroll();
        const onScroll = () => {
          const node = scroll();
          if (node === null) return;
          const distance = node.scrollHeight - node.scrollTop - node.clientHeight;
          stickBottom = distance < 120;
        };
        if (scroller !== null) scroller.addEventListener('scroll', onScroll, { passive: true });
        const pinTimer = setInterval(() => {
          if (!stickBottom) return;
          const node = scroll();
          if (node !== null) node.scrollTop = node.scrollHeight;
        }, 500);
        const stopPin = setTimeout(() => { clearInterval(pinTimer); }, 12000);
        return () => {
          observer.disconnect();
          for (const el of [...seamHidden]) restoreSeamElement(el);
          if (scroller !== null) scroller.removeEventListener('scroll', onScroll);
          clearInterval(pinTimer);
          clearTimeout(stopPin);
        };
      }, [sessionId]);

      if (typeof renderFactorySlot !== 'function') return h('div', { className: 'dshask-root' });
      const dockNode = dock !== undefined
        ? h('div', { className: 'dshsel-chipdock', style: { left: `${dock.left}px`, bottom: `${dock.bottom}px` } },
            h(SelectionChip, { sessionId, t }))
        : null;
      return h('div', { className: 'dshask-root', ref: rootRef },
        renderFactorySlot('conversation.content', { variant: 'embedded', phase: 'active', hero: false }),
        dockNode,
      );
    }

    const inject = ['slots', 'locale', 'sessions', 'resources', 'sidebarRight', 'sidebarRightTabs', 'uiWorkspace', 'fileUpload', 'remote', 'remote.session', 'remote.subagents'];

    function apply(ctx) {
      const t = ctx.locale.bind(NS);

      // Hide side-chat sessions from the workspace session tree: they are owned
      // by the right sidebar, not by the workspace, and must not add rows.
      const hiddenSessions = new Set();
      try {
        const stored = JSON.parse(localStorage.getItem(HIDDEN_STORAGE_KEY) ?? '[]');
        if (Array.isArray(stored)) for (const id of stored) if (typeof id === 'string') hiddenSessions.add(id);
      } catch (_storageError) {
        /* an unreadable list just starts empty */
      }
      const hideStyle = document.createElement('style');
      hideStyle.dataset.plugin = ID + ':hidden-sessions';
      let hideSyncQueued = false;
      const syncHideStyle = () => {
        if (hideSyncQueued) return;
        hideSyncQueued = true;
        queueMicrotask(() => {
          hideSyncQueued = false;
          const rules = [];
          for (const id of hiddenSessions) rules.push(`[data-row-key="session:${id}"]{display:none !important;}`);
          hideStyle.textContent = rules.join('\n');
          if (document.head.contains(hideStyle) === false) document.head.appendChild(hideStyle);
          try {
            localStorage.setItem(HIDDEN_STORAGE_KEY, JSON.stringify([...hiddenSessions]));
          } catch (_storageError) {
            /* best effort */
          }
        });
      };
      syncHideStyle();

      // One reusable side-chat tab per parent session: the first click creates
      // it, later clicks only reveal it and drop a new selection chip.
      const sideTabsByParent = new Map();
      const persistSideTabs = () => {
        try {
          const entries = {};
          for (const [parentId, entry] of sideTabsByParent) entries[parentId] = entry;
          localStorage.setItem(SIDE_TABS_STORAGE_KEY, JSON.stringify({ version: PLUGIN_VERSION, entries }));
        } catch (_storageError) {
          /* best effort */
        }
      };
      try {
        const stored = JSON.parse(localStorage.getItem(SIDE_TABS_STORAGE_KEY) ?? '{}');
        // A plugin update invalidates cached tab reuse: stale entries can point
        // at side sessions archived by an earlier build, which would leave the
        // sidebar with an empty pane and a composer that cannot deliver.
        if (stored !== null && typeof stored === 'object' && stored.version === PLUGIN_VERSION && stored.entries !== null && typeof stored.entries === 'object') {
          for (const [parentId, entry] of Object.entries(stored.entries)) {
            if (typeof parentId !== 'string' || entry === null || typeof entry !== 'object') continue;
            if (typeof entry.sideId !== 'string' || typeof entry.address !== 'string') continue;
            sideTabsByParent.set(parentId, { sideId: entry.sideId, address: entry.address });
          }
        } else if (stored !== null && typeof stored === 'object') {
          try { localStorage.removeItem(SIDE_TABS_STORAGE_KEY); } catch (_storageError) {
            /* best effort */
          }
        }
      } catch (_storageError) {
        /* an unreadable map just starts empty */
      }

      runtime.hideSession = (sideId) => {
        if (typeof sideId !== 'string' || sideId === '') return;
        if (hiddenSessions.has(sideId)) return;
        hiddenSessions.add(sideId);
        syncHideStyle();
      };
      runtime.archiveSession = (sideId) => {
        if (typeof sideId !== 'string' || sideId === '') return;
        try {
          if (typeof ctx.uiWorkspace?.archiveSession === 'function') {
            void ctx.uiWorkspace.archiveSession(sideId, { stopActivity: true }).catch(() => {});
          }
        } catch (_archiveError) {
          /* best effort */
        }
      };
      /**
       * Deliver the selection as a small text attachment plus the user question.
       * The transcript then shows a compact "1 处选中" attachment chip instead of
       * the raw selected text. If the attachment channel is unavailable or slow,
       * fall back to a single plain-text message so sending never hangs.
       */
      runtime.deliver = (targetSessionId, quote, question, restore) => {
        void (async () => {
          try {
            const clientTimeZone = (() => {
              try {
                const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
                return typeof zone === 'string' && zone !== '' ? zone : 'UTC';
              } catch (_zoneError) {
                return 'UTC';
              }
            })();
            const requestId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
              ? crypto.randomUUID()
              : `selection-actions-${Date.now()}-${Math.random().toString(16).slice(2)}`;
            const ask = (question || '').trim();
            let address;
            try {
              const row = ctx.sessions.list.getSnapshot().byId[targetSessionId];
              address = row !== undefined && row !== null && row.subagent !== null && row.subagent !== undefined
                ? row.subagent.address
                : undefined;
            } catch (_listError) {
              address = undefined;
            }
            const fallbackContent = [{ type: 'text', text: buildChipPrompt(quote, question) }];
            let content;
            let usedFallback = false;
            if (address !== undefined) {
              // Continuable subagent prompts reject attachment parts.
              content = fallbackContent;
              usedFallback = true;
            } else {
              let receiptId;
              try {
                if (ctx.fileUpload === undefined || typeof ctx.fileUpload.upload !== 'function') {
                  throw new Error('file upload service unavailable');
                }
                const fileName = t('chip.selection');
                const file = new File([quote], fileName, { type: 'text/plain' });
                let timer;
                const timeout = new Promise((_resolve, reject) => {
                  timer = setTimeout(() => { reject(new Error('upload timeout')); }, 3000);
                });
                try {
                  const uploaded = await Promise.race([ctx.fileUpload.upload(targetSessionId, file, fileName), timeout]);
                  if (uploaded === undefined || uploaded === null || uploaded.ok !== true) {
                    throw new Error(`upload failed: ${uploaded?.error?.code ?? 'unknown'}`);
                  }
                  receiptId = uploaded.value.receiptId;
                } finally {
                  clearTimeout(timer);
                }
              } catch (uploadError) {
                console.warn('[selection-actions] selection upload failed; sending as text', uploadError);
                content = fallbackContent;
                usedFallback = true;
              }
              if (content === undefined) {
                content = [];
                if (ask !== '') content.push({ type: 'text', text: ask });
                content.push({ type: 'file', receiptId });
              }
            }
            const result = address !== undefined && ctx.remote.subagents !== undefined
              ? await ctx.remote.subagents.prompt({
                requestId,
                parentSessionId: address.parentSessionId,
                childSessionId: address.childSessionId,
                mode: 'continuable',
                delivery: 'queue',
                content,
                clientTimeZone,
              })
              : await ctx.remote.session.prompt({
                requestId,
                sessionId: targetSessionId,
                mode: 'queue',
                content,
                clientTimeZone,
              });
            if (result !== undefined && result !== null && result.ok === false) {
              throw new Error(`prompt rejected: ${result.error?.code ?? 'unknown'}`);
            }
            if (usedFallback) status.set(t('toast.fallbackText'));
          } catch (error) {
            console.warn('[selection-actions] chip send failed', error);
            try { restore(); } catch (_restoreError) {
              /* best effort */
            }
            status.set(t('toast.sendFailed'));
          }
        })();
      };

      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'selection-actions: dictionaries');

      ctx.effect(() => {
        const tag = document.createElement('style');
        tag.dataset.plugin = ID;
        tag.textContent = CSS;
        document.head.appendChild(tag);
        return () => { tag.remove(); hideStyle.remove(); };
      }, 'selection-actions: styles');

      const expandSidebar = () => {
        try {
          if (!ctx.sidebarRight.isExpanded()) ctx.sidebarRight.toggleExpanded();
        } catch (_toggleError) {
          /* the open attempt reports the real failure */
        }
      };

      const focusSideComposer = () => {
        setTimeout(() => {
          const editor = findSideComposer();
          if (editor !== undefined && typeof editor.focus === 'function') editor.focus();
        }, 320);
      };

      /** Reveal the reusable side-chat tab for one parent session. */
      async function revealSideTab(entry) {
        let opened = false;
        for (let attempt = 0; attempt < 12; attempt++) {
          try {
            const active = ctx.sidebarRight.active();
            const options = { kind: ASK_KIND };
            if (active !== undefined && (active.kind === 'guide' || active.kind === ASK_KIND)) options.replaceTab = active.id;
            ctx.sidebarRight.openResource(entry.address, options);
            opened = true;
            break;
          } catch (_openError) {
            await delay(160);
          }
        }
        if (!opened) return { ok: false };
        await delay(400);
        if (document.querySelector('[data-sidebar-ask-tab]') !== null) return { ok: true };
        // The remembered tab renders no pane (for example a side Session that an
        // earlier build archived): replace it with a freshly created side chat.
        const active = ctx.sidebarRight.active();
        return { ok: false, staleTabId: active !== undefined && active.kind === ASK_KIND ? active.id : undefined };
      }

      /**
       * Open (or reuse) the side chat: the first click creates a fork of the
       * current Session so the side chat inherits the main conversation for
       * model context; later clicks reveal the same tab and drop the selection
       * as a chip above its composer.
       */
      async function openSideAsk(sessionId, text) {
        if (typeof sessionId !== 'string') return;
        const snippet = snippetOf(text);
        expandSidebar();

        const existing = sideTabsByParent.get(sessionId);
        let staleTabId;
        if (existing !== undefined) {
          const reveal = await revealSideTab(existing);
          if (reveal.ok) {
            setComposerChip(existing.sideId, text);
            focusSideComposer();
            status.set(t('toast.opened'));
            return;
          }
          staleTabId = reveal.staleTabId;
          setComposerChip(existing.sideId, '');
          sideSnippets.delete(existing.sideId);
          sideCutoffs.delete(existing.sideId);
          runtime.archiveSession(existing.sideId);
          sideTabsByParent.delete(sessionId);
          persistSideTabs();
        }

        const cutoffTurn = mainConversationTurn();
        let sideId;
        let inherited = true;
        try {
          sideId = await ctx.sessions.fork({ sessionId });
        } catch (forkError) {
          // The main conversation may be mid-run and refuse a fork. Fall back to
          // a fresh side Session so the sidebar still opens (just without the
          // inherited conversation context).
          console.warn('[selection-actions] side chat fork failed, falling back to a fresh session', forkError);
          inherited = false;
          try {
            let cwd;
            try {
              const row = ctx.sessions.list.getSnapshot().byId[sessionId];
              if (row !== undefined && row !== null && typeof row.cwd === 'string' && row.cwd !== '') cwd = row.cwd;
            } catch (_listError) {
              /* create with the Host default cwd */
            }
            sideId = await ctx.sessions.create(cwd === undefined ? {} : { cwd });
          } catch (createError) {
            console.warn('[selection-actions] side chat create failed', createError);
            status.set(t('toast.createFailed'));
            return;
          }
        }
        const effectiveCutoff = inherited ? cutoffTurn : 0;
        if (effectiveCutoff > 0) sideCutoffs.set(sideId, effectiveCutoff);
        sideSnippets.set(sideId, snippet);
        setComposerChip(sideId, text);
        hiddenSessions.add(sideId);
        syncHideStyle();
        const address = askAddress(sideId, effectiveCutoff, snippet);
        let lastError;
        for (let attempt = 0; attempt < 12; attempt++) {
          try {
            const active = ctx.sidebarRight.active();
            const options = { kind: ASK_KIND };
            if (staleTabId !== undefined && attempt < 6) options.replaceTab = staleTabId;
            else if (active !== undefined && (active.kind === 'guide' || active.kind === ASK_KIND)) options.replaceTab = active.id;
            ctx.sidebarRight.openResource(address, options);
            sideTabsByParent.set(sessionId, { sideId, address });
            persistSideTabs();
            focusSideComposer();
            status.set(inherited ? t('toast.opened') : t('toast.noContext'));
            return;
          } catch (error) {
            lastError = error;
            await delay(160);
          }
        }
        console.warn('[selection-actions] side chat open failed', lastError);
        setComposerChip(sideId, '');
        sideSnippets.delete(sideId);
        sideCutoffs.delete(sideId);
        runtime.archiveSession(sideId);
        try {
          await navigator.clipboard.writeText(text);
          status.set(t('toast.failed'));
        } catch (_clipboardError) {
          status.set(t('toast.failed'));
        }
      }

      ctx.effect(() => ctx.resources.register({
        protocol: 'sidebarask',
        async *open(resourceAddress, { signal }) {
          const parsed = parseAskAddress(resourceAddress);
          if (parsed === undefined) throw new Error(`selection-actions: invalid side chat address "${resourceAddress}"`);
          if (signal.aborted) return;
          const reference = ctx.sessions.retain(parsed.sessionId, { source: 'sidebarChat', signal });
          try {
            yield { ok: true, value: { sessionId: parsed.sessionId, cutoffTurn: parsed.cutoffTurn, reference } };
            if (!signal.aborted) {
              await new Promise((resolve) => {
                signal.addEventListener('abort', () => { resolve(); }, { once: true });
              });
            }
          } finally {
            reference.release();
          }
        },
      }), 'selection-actions: side chat resources');

      ctx.effect(() => ctx.sidebarRightTabs.register({
        id: ASK_TAB_ID,
        kind: ASK_KIND,
        patterns: [`${ASK_PREFIX}**`],
        priority: 'extension',
        canOpen: (address) => parseAskAddress(address) !== undefined,
        title: (address) => {
          const parsed = parseAskAddress(address);
          const snippet = parsed !== undefined
            ? parsed.snippet ?? sideSnippets.get(parsed.sessionId)
            : undefined;
          if (typeof snippet === 'string' && snippet !== '') return `${t('tab.title')} · ${snippet}`;
          return t('tab.title');
        },
      }), 'selection-actions: side chat tab type');

      // Closing the tab archives the side Session, drops its reuse entry, and
      // keeps its row hidden.
      ctx.effect(() => ctx.sidebarRight.registerCloseHandler(ASK_KIND, (sessionId, tab) => {
        const parsed = parseAskAddress(tab.contentId);
        if (parsed === undefined) return;
        setComposerChip(parsed.sessionId, '');
        sideSnippets.delete(parsed.sessionId);
        sideCutoffs.delete(parsed.sessionId);
        hiddenSessions.add(parsed.sessionId);
        syncHideStyle();
        for (const [parentId, entry] of sideTabsByParent) {
          if (entry.sideId === parsed.sessionId) sideTabsByParent.delete(parentId);
        }
        persistSideTabs();
        runtime.archiveSession(parsed.sessionId);
      }), 'selection-actions: side chat close cleanup');

      ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
        name: 'sidebar.right.pane.tab',
        key: ASK_TAB_ID,
        locale: NS,
        children: { 'sidebar.ask.conversation': { kind: 'single', scope: 'session' } },
      }, AskTabShell)), 'selection-actions: side chat tab body');

      ctx.effect(() => ctx.slots.inject('sidebar.ask.conversation', () => ctx.slots.register({
        name: 'sidebar.ask.conversation',
        locale: NS,
      }, AskConversationPane)), 'selection-actions: side chat conversation');

      ctx.effect(() => ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
        name: 'conversation.session.header.utilities',
        id: 'selection-actions',
        order: 40,
        locale: NS,
        inject: () => ({
          openSideAsk: (sessionId, text) => { void openSideAsk(sessionId, text); },
        }),
      }, SelectionActions)), 'selection-actions: selection toolbar mount');
    }

    return { inject, apply };
  },
});




