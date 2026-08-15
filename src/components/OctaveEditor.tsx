import Editor, { type BeforeMount, type OnMount } from '@monaco-editor/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { editor } from 'monaco-editor';

import {
  lintOctave,
  registerOctaveLintCodeActions,
  toMonacoMarkers,
  type OctaveDiagnostic,
} from '../editor/octaveLint';
import {
  bindOctaveCompletionSources,
  bindOctaveInspector,
  octaveCommentPrefixAt,
  registerOctaveLanguage,
  type OctaveInspection,
} from '../editor/octaveLanguage';
import { configureLocalMonaco } from '../editor/monacoRuntime';
import { reconcileEditorValue, recordLocalEditorValue } from '../editor/editorValueSync';

type Monaco = typeof import('monaco-editor');

export type OctaveEditorDiagnostic = OctaveDiagnostic;

export type OctaveEditorProps = {
  value: string;
  onChange: (value: string) => void;
  onRun: () => void;
  onFormat?: () => void;
  diagnostics?: OctaveEditorDiagnostic[];
  onInspect?: (expression: string) => Promise<OctaveInspection>;
  readOnly?: boolean;
  completionSources?: string[];
  viewStateKey?: string;
};

const MIN_HEIGHT = 32;
const EMPTY_COMPLETION_SOURCES: string[] = [];
const isTouchFirstDevice = () => typeof navigator !== 'undefined'
  && (navigator.maxTouchPoints > 0 || globalThis.matchMedia?.('(pointer: coarse)').matches);
// Bump when mount-time Monaco listeners change: Fast Refresh preserves the
// existing editor instance and otherwise leaves the previous handlers alive.
const EDITOR_MOUNT_REVISION = 'monaco-tablet-height-v8';

function mapPositionAfterFormatting(
  previous: string,
  next: string,
  lineNumber: number,
  column: number,
): { lineNumber: number; column: number } {
  const previousLines = previous.replace(/\r\n/g, '\n').split('\n');
  const nextLines = next.replace(/\r\n/g, '\n').split('\n');
  const previousIndex = Math.min(previousLines.length - 1, Math.max(0, lineNumber - 1));
  const previousLine = previousLines[previousIndex] ?? '';
  const nonBlankOrdinal = previousLines.slice(0, previousIndex + 1).filter((line) => line.trim()).length - 1;
  const nextNonBlankIndexes = nextLines.flatMap((line, index) => line.trim() ? [index] : []);
  const nextIndex = nextNonBlankIndexes[Math.min(Math.max(0, nonBlankOrdinal), Math.max(0, nextNonBlankIndexes.length - 1))] ?? 0;
  const nextLine = nextLines[nextIndex] ?? '';

  const oldBeforeCursor = previousLine.slice(0, Math.max(0, column - 1));
  const significant = oldBeforeCursor.replace(/\s/g, '').length;
  let seen = 0;
  let nextColumn = 1;
  while (nextColumn <= nextLine.length && seen < significant) {
    if (!/\s/.test(nextLine[nextColumn - 1])) seen += 1;
    nextColumn += 1;
  }
  return { lineNumber: nextIndex + 1, column: Math.min(nextLine.length + 1, nextColumn) };
}

function currentEditorTheme(): 'octave-light' | 'octave-dark' {
  if (typeof document === 'undefined') return 'octave-light';
  const configured = document.documentElement.dataset.theme ?? localStorage.getItem('octave-theme');
  if (configured === 'dark') return 'octave-dark';
  if (configured === 'light') return 'octave-light';
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'octave-dark' : 'octave-light';
}

export function OctaveEditor({
  value,
  onChange,
  onRun,
  onFormat,
  diagnostics = [],
  onInspect,
  readOnly = false,
  completionSources = EMPTY_COMPLETION_SOURCES,
  viewStateKey,
}: OctaveEditorProps) {
  const [theme, setTheme] = useState(currentEditorTheme);
  const [runtimeReady, setRuntimeReady] = useState(false);
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const onRunRef = useRef(onRun);
  const onChangeRef = useRef(onChange);
  const onFormatRef = useRef(onFormat);
  const onInspectRef = useRef(onInspect);
  const diagnosticsRef = useRef(diagnostics);
  const completionSourcesRef = useRef(completionSources);
  const inspectorCleanupRef = useRef<() => void>(() => undefined);
  const completionCleanupRef = useRef<() => void>(() => undefined);
  const multiCursorCleanupRef = useRef<() => void>(() => undefined);
  const viewStateKeyRef = useRef(viewStateKey);
  const activeViewStateStorageKeyRef = useRef<string | undefined>(undefined);
  const viewStateTimerRef = useRef(0);
  const lintTimerRef = useRef(0);
  const heightRef = useRef(MIN_HEIGHT);
  const pendingLocalValuesRef = useRef<string[]>([]);
  const applyingParentValueRef = useRef(false);
  const touchFirstRef = useRef(isTouchFirstDevice());
  const lineCountRef = useRef(1);

  onRunRef.current = onRun;
  onChangeRef.current = onChange;
  onFormatRef.current = onFormat;
  onInspectRef.current = onInspect;
  diagnosticsRef.current = diagnostics;
  completionSourcesRef.current = completionSources;
  viewStateKeyRef.current = viewStateKey;

  const updateMarkers = useCallback(() => {
    const monaco = monacoRef.current;
    const model = editorRef.current?.getModel();
    if (!monaco || !model) return;
    monaco.editor.setModelMarkers(model, 'octave-local', toMonacoMarkers(monaco, model, lintOctave(model.getValue())));
    monaco.editor.setModelMarkers(model, 'octave-external', toMonacoMarkers(monaco, model, diagnosticsRef.current));
  }, []);

  const scheduleLocalMarkers = useCallback(() => {
    window.clearTimeout(lintTimerRef.current);
    lintTimerRef.current = window.setTimeout(() => {
      const monaco = monacoRef.current;
      const model = editorRef.current?.getModel();
      if (!monaco || !model) return;
      monaco.editor.setModelMarkers(model, 'octave-local', toMonacoMarkers(monaco, model, lintOctave(model.getValue())));
    }, touchFirstRef.current ? 450 : 120);
  }, []);

  const bindInspector = useCallback(() => {
    const instance = editorRef.current;
    const model = instance?.getModel();
    inspectorCleanupRef.current();
    if (!instance || !model) return;
    const inspect = onInspectRef.current;
    inspectorCleanupRef.current = bindOctaveInspector(
      model,
      () => instance.getSelection(),
      inspect ? (expression) => inspect(expression) : undefined,
    );
  }, []);

  const beforeMount: BeforeMount = useCallback((monaco) => {
    registerOctaveLanguage(monaco);
    registerOctaveLintCodeActions(monaco);
  }, []);

  const handleModelChange = useCallback((nextValue: string | undefined) => {
    if (applyingParentValueRef.current) return;
    const next = nextValue ?? '';
    recordLocalEditorValue(pendingLocalValuesRef.current, next);
    onChangeRef.current(next);
  }, []);

  const onMount: OnMount = useCallback((instance, monaco) => {
    editorRef.current = instance;
    monacoRef.current = monaco;
    lineCountRef.current = instance.getModel()?.getLineCount() ?? 1;
    // Monaco persists user-resized suggest dimensions globally. A previously
    // collapsed widget otherwise remains one row tall even with many matches.
    void instance.getAction('editor.action.resetSuggestSize')?.run();

    const editorViewStorageKey = viewStateKeyRef.current
      ? `octave-editor-view-v1:${viewStateKeyRef.current}`
      : undefined;
    activeViewStateStorageKeyRef.current = editorViewStorageKey;
    if (editorViewStorageKey) {
      try {
        const saved = localStorage.getItem(editorViewStorageKey);
        if (saved) instance.restoreViewState(JSON.parse(saved) as editor.ICodeEditorViewState);
      } catch {
        localStorage.removeItem(editorViewStorageKey);
      }
    }
    const saveViewStateNow = () => {
      const storageKey = activeViewStateStorageKeyRef.current;
      if (!storageKey) return;
      window.clearTimeout(viewStateTimerRef.current);
      viewStateTimerRef.current = 0;
      const state = instance.saveViewState();
      if (state) localStorage.setItem(storageKey, JSON.stringify(state));
    };
    const persistViewState = () => {
      window.clearTimeout(viewStateTimerRef.current);
      viewStateTimerRef.current = window.setTimeout(saveViewStateNow, 100);
    };
    instance.onDidChangeCursorSelection(() => {
      persistViewState();
    });
    instance.onDidScrollChange(persistViewState);
    instance.onDidBlurEditorText(persistViewState);
    window.addEventListener('pagehide', saveViewStateNow);

    bindInspector();
    updateMarkers();
    completionCleanupRef.current();
    if (instance.getModel()) {
      completionCleanupRef.current = bindOctaveCompletionSources(instance.getModel()!, completionSourcesRef.current);
    }

    multiCursorCleanupRef.current();
    const editorDomNode = instance.getDomNode();
    const normalizeExponentKey = (event: InputEvent) => {
      if (!instance.hasTextFocus() || !event.data || !/[ˆ＾]/.test(event.data)) return;
      // Some tablet keyboard layouts emit U+02C6 (or the full-width variant)
      // for the physical exponent key. Octave only accepts the ASCII caret.
      event.preventDefault();
      event.stopPropagation();
      instance.trigger('octave-editor', 'type', { text: event.data.replace(/[ˆ＾]/g, '^') });
    };
    const allowBrowserFind = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey || event.key.toLowerCase() !== 'f') return;
      // Do not preventDefault: stopping propagation before Monaco receives the
      // key leaves the browser's native Find command intact.
      event.stopPropagation();
      event.stopImmediatePropagation();
    };
    const keepNotebookScrollStable = () => {
      const host = hostRef.current;
      const scroller = host?.closest<HTMLElement>('.notebook');
      if (!host || !scroller) return;
      const hostRect = host.getBoundingClientRect();
      const viewport = scroller.getBoundingClientRect();
      const visible = hostRect.bottom > viewport.top && hostRect.top < viewport.bottom;
      if (!visible) {
        host.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
        return;
      }

      const scrollTop = scroller.scrollTop;
      const scrollLeft = scroller.scrollLeft;
      window.requestAnimationFrame(() => {
        if (scroller.scrollTop !== scrollTop || scroller.scrollLeft !== scrollLeft) {
          scroller.scrollTo({ top: scrollTop, left: scrollLeft, behavior: 'instant' });
        }
      });
    };
    editorDomNode?.addEventListener('keydown', allowBrowserFind, true);
    editorDomNode?.addEventListener('keydown', keepNotebookScrollStable, true);
    editorDomNode?.addEventListener('beforeinput', normalizeExponentKey as EventListener, true);
    const isMultiCursorShortcut = (event: KeyboardEvent) => (
        !instance.hasTextFocus()
        ? false
        : (event.ctrlKey || event.metaKey)
          && !event.altKey
          && !event.shiftKey
          && event.key.toLowerCase() === 'd'
    );
    const consumeMultiCursorShortcut = (event: KeyboardEvent) => {
      if (!isMultiCursorShortcut(event)) return false;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      event.returnValue = false;
      return true;
    };
    const handleMultiCursorKeyDown = (event: KeyboardEvent) => {
      if (!consumeMultiCursorShortcut(event)) return;
      void instance.getAction('editor.action.addSelectionToNextFindMatch')?.run();
    };
    const handleMultiCursorKeyEnd = (event: KeyboardEvent) => {
      consumeMultiCursorShortcut(event);
    };
    window.addEventListener('keydown', handleMultiCursorKeyDown, true);
    window.addEventListener('keypress', handleMultiCursorKeyEnd, true);
    window.addEventListener('keyup', handleMultiCursorKeyEnd, true);
    multiCursorCleanupRef.current = () => {
      window.removeEventListener('keydown', handleMultiCursorKeyDown, true);
      window.removeEventListener('keypress', handleMultiCursorKeyEnd, true);
      window.removeEventListener('keyup', handleMultiCursorKeyEnd, true);
      editorDomNode?.removeEventListener('keydown', allowBrowserFind, true);
      editorDomNode?.removeEventListener('keydown', keepNotebookScrollStable, true);
      editorDomNode?.removeEventListener('beforeinput', normalizeExponentKey as EventListener, true);
    };

    let applyingLayout = false;
    const resize = (measuredContentHeight?: number) => {
      // Mobile browsers can shrink innerHeight to the area above a virtual
      // keyboard even while a Bluetooth keyboard is being used. That made
      // long editors start scrolling at roughly a third of the tablet screen.
      // screen.availHeight remains stable and is only used on touch-first
      // devices; desktop windows continue respecting their actual viewport.
      const availableHeight = touchFirstRef.current
        ? Math.max(window.innerHeight, window.screen?.availHeight || 0)
        : window.innerHeight;
      const maximum = Math.max(MIN_HEIGHT, Math.floor(availableHeight * 0.9));
      const model = instance.getModel();
      const contentHeight = measuredContentHeight
        ?? (model ? instance.getContentHeight() : MIN_HEIGHT);
      const next = Math.min(maximum, Math.max(MIN_HEIGHT, contentHeight));
      const heightChanged = Math.abs(heightRef.current - next) > 1;
      if (heightChanged) heightRef.current = next;
      if (heightChanged && hostRef.current) hostRef.current.style.height = `${next}px`;
      if (applyingLayout) return;
      applyingLayout = true;
      try {
        // Layout is still required when the cell is capped at 95vh: the outer
        // height is unchanged, but Monaco's scrollable viewport gained a line.
        instance.layout({ width: instance.getLayoutInfo().width, height: next });
      } finally {
        applyingLayout = false;
      }
    };
    resize();
    const resizeForViewport = () => resize();
    window.addEventListener('resize', resizeForViewport);
    instance.onDidDispose(() => {
      window.removeEventListener('resize', resizeForViewport);
      window.removeEventListener('pagehide', saveViewStateNow);
      window.clearTimeout(viewStateTimerRef.current);
      const storageKey = activeViewStateStorageKeyRef.current;
      if (storageKey) {
        const state = instance.saveViewState();
        if (state) localStorage.setItem(storageKey, JSON.stringify(state));
      }
      if (editorRef.current === instance) editorRef.current = null;
    });

    instance.addAction({
      id: 'octave-cell-run-shift-enter',
      label: 'Run Octave cell',
      keybindings: [monaco.KeyMod.Shift | monaco.KeyCode.Enter],
      run: () => onRunRef.current(),
    });
    instance.addAction({
      id: 'octave-cell-run-ctrl-enter',
      label: 'Run Octave cell',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
      run: () => onRunRef.current(),
    });
    instance.addAction({
      id: 'octave-cell-format',
      label: 'Format Octave cell',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyF],
      run: () => onFormatRef.current?.(),
    });
    instance.addAction({
      id: 'octave-inspect-expression',
      label: 'Inspect Octave expression',
      keybindings: [monaco.KeyMod.Alt | monaco.KeyCode.KeyI],
      run: () => instance.trigger('octave-editor', 'editor.action.showHover', undefined),
    });
    const commentContinuation = instance.createContextKey<boolean>('octaveCommentContinuation', false);
    const updateCommentContinuation = () => {
      const model = instance.getModel();
      const position = instance.getPosition();
      const selections = instance.getSelections();
      commentContinuation.set(Boolean(
        model
        && position
        && selections?.length === 1
        && selections[0].isEmpty()
        && octaveCommentPrefixAt(model.getLineContent(position.lineNumber), position.column),
      ));
    };
    updateCommentContinuation();
    instance.addAction({
      id: 'octave-comment-continuation',
      label: 'Continue Octave line comment',
      keybindings: [monaco.KeyCode.Enter],
      keybindingContext: 'octaveCommentContinuation && editorTextFocus && !editorReadonly',
      run: () => {
        const model = instance.getModel();
        const position = instance.getPosition();
        const prefix = model && position
          ? octaveCommentPrefixAt(model.getLineContent(position.lineNumber), position.column)
          : undefined;
        if (!model || !position || !prefix) return;
        const nextPosition = {
          lineNumber: position.lineNumber + 1,
          column: prefix.length + 1,
        };
        instance.executeEdits('octave-comment-continuation', [{
          range: new monaco.Range(
            position.lineNumber,
            position.column,
            position.lineNumber,
            position.column,
          ),
          text: model.getEOL() + prefix,
          forceMoveMarkers: true,
        }], [new monaco.Selection(
          nextPosition.lineNumber,
          nextPosition.column,
          nextPosition.lineNumber,
          nextPosition.column,
        )]);
      },
    });
    instance.onDidContentSizeChange((event) => resize(event.contentHeight));
    instance.onDidChangeCursorSelection(updateCommentContinuation);
    instance.onDidChangeModelContent(() => {
      updateCommentContinuation();
      const model = instance.getModel();
      // A synchronous Monaco layout on every character is particularly costly
      // on tablets and can make hardware-keyboard events arrive faster than the
      // main thread can consume them. Only reserve space when a line was added
      // or removed; content-size events handle wrapping asynchronously.
      if (model && model.getLineCount() !== lineCountRef.current) {
        const nextLineCount = model.getLineCount();
        const addedLines = nextLineCount - lineCountRef.current;
        lineCountRef.current = nextLineCount;
        // getContentHeight can still report the pre-Enter value during this
        // synchronous notification. Grow from our committed host height so the
        // newly inserted row is visible immediately, then reconcile after
        // Monaco finishes measuring wrapped lines and padding.
        resize(addedLines > 0
          ? heightRef.current + addedLines * 22
          : instance.getContentHeight());
        const position = instance.getPosition();
        if (position) instance.revealPosition(position, monaco.editor.ScrollType.Immediate);
        window.requestAnimationFrame(() => resize(instance.getContentHeight()));
      }
      scheduleLocalMarkers();
    });
    instance.onDidChangeModel(() => {
      bindInspector();
      updateCommentContinuation();
      updateMarkers();
      resize();
    });
  }, [bindInspector, scheduleLocalMarkers, updateMarkers]);

  useEffect(() => {
    const instance = editorRef.current;
    const monaco = monacoRef.current;
    const model = instance?.getModel();
    if (!instance || !monaco || !model) return;
    const previous = model.getValue();
    const decision = reconcileEditorValue(pendingLocalValuesRef.current, value, previous);
    pendingLocalValuesRef.current = decision.remainingLocalValues;
    if (decision.applyParentValue) {
      const selections = instance.getSelections();
      const scrollPosition = {
        scrollLeft: instance.getScrollLeft(),
        scrollTop: instance.getScrollTop(),
      };
      const hadTextFocus = instance.hasTextFocus();
      const mappedSelections = selections?.map((selection) => {
        const selectionStart = mapPositionAfterFormatting(
          previous,
          value,
          selection.selectionStartLineNumber,
          selection.selectionStartColumn,
        );
        const position = mapPositionAfterFormatting(
          previous,
          value,
          selection.positionLineNumber,
          selection.positionColumn,
        );
        return {
          selectionStart,
          position,
        };
      });
      applyingParentValueRef.current = true;
      try {
        instance.executeEdits('octave-external-value', [{
          range: model.getFullModelRange(),
          text: value,
          forceMoveMarkers: true,
        }]);
      } finally {
        applyingParentValueRef.current = false;
      }
      if (mappedSelections?.length) {
        instance.setSelections(mappedSelections.map(({ selectionStart, position }) => new monaco.Selection(
          selectionStart.lineNumber,
          Math.min(model.getLineMaxColumn(selectionStart.lineNumber), Math.max(1, selectionStart.column)),
          position.lineNumber,
          Math.min(model.getLineMaxColumn(position.lineNumber), Math.max(1, position.column)),
        )));
      }
      instance.setScrollPosition(scrollPosition);
      if (hadTextFocus) instance.focus();
    }
  }, [value]);

  useEffect(() => {
    const monaco = monacoRef.current;
    const model = editorRef.current?.getModel();
    if (!monaco || !model) return;
    monaco.editor.setModelMarkers(model, 'octave-external', toMonacoMarkers(monaco, model, diagnostics));
  }, [diagnostics]);

  useEffect(() => {
    let active = true;
    void configureLocalMonaco().then(() => {
      if (active) setRuntimeReady(true);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const instance = editorRef.current;
    const nextStorageKey = viewStateKey
      ? `octave-editor-view-v1:${viewStateKey}`
      : undefined;
    const previousStorageKey = activeViewStateStorageKeyRef.current;
    if (!instance || nextStorageKey === previousStorageKey) return;

    window.clearTimeout(viewStateTimerRef.current);
    if (previousStorageKey) {
      const previousState = instance.saveViewState();
      if (previousState) localStorage.setItem(previousStorageKey, JSON.stringify(previousState));
    }
    activeViewStateStorageKeyRef.current = nextStorageKey;
    if (!nextStorageKey) return;
    try {
      const saved = localStorage.getItem(nextStorageKey);
      if (saved) instance.restoreViewState(JSON.parse(saved) as editor.ICodeEditorViewState);
    } catch {
      localStorage.removeItem(nextStorageKey);
    }
  }, [runtimeReady, viewStateKey]);

  useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() => setTheme(currentEditorTheme()));
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    setTheme(currentEditorTheme());
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    bindInspector();
    return () => inspectorCleanupRef.current();
  }, [onInspect, bindInspector]);

  const completionSourcesKey = JSON.stringify(completionSources);
  useEffect(() => {
    const model = editorRef.current?.getModel();
    completionCleanupRef.current();
    completionCleanupRef.current = model
      ? bindOctaveCompletionSources(model, completionSourcesRef.current)
      : () => undefined;
    return () => completionCleanupRef.current();
  }, [completionSourcesKey]);

  useEffect(() => () => {
    const model = editorRef.current?.getModel();
    const monaco = monacoRef.current;
    inspectorCleanupRef.current();
    completionCleanupRef.current();
    multiCursorCleanupRef.current();
    window.clearTimeout(lintTimerRef.current);
    if (model && monaco) {
      monaco.editor.setModelMarkers(model, 'octave-local', []);
      monaco.editor.setModelMarkers(model, 'octave-external', []);
    }
  }, []);

  if (!runtimeReady) return <div aria-hidden="true" style={{ height: MIN_HEIGHT }} />;

  return (
    <div ref={hostRef} className="octave-editor-host" style={{ height: heightRef.current }}>
      <Editor
      key={EDITOR_MOUNT_REVISION}
      height="100%"
      language="octave"
      theme={theme}
      defaultValue={value}
      saveViewState={false}
      beforeMount={beforeMount}
      onMount={onMount}
      onChange={handleModelChange}
      loading={null}
      options={{
        ariaLabel: 'Octave code',
        automaticLayout: true,
        bracketPairColorization: { enabled: true },
        cursorBlinking: touchFirstRef.current ? 'solid' : 'smooth',
        cursorSmoothCaretAnimation: touchFirstRef.current ? 'off' : 'on',
        detectIndentation: false,
        fixedOverflowWidgets: true,
        folding: true,
        foldingHighlight: false,
        fontFamily: 'var(--font-mono, ui-monospace, SFMono-Regular, Consolas, monospace)',
        fontLigatures: true,
        fontSize: 14,
        lineHeight: 22,
        lightbulb: { enabled: 'on' as import('monaco-editor').editor.ShowLightbulbIconMode },
        glyphMargin: false,
        guides: { bracketPairs: true, indentation: false },
        // Marker diagnostics use Monaco's hover even when runtime inspection is unavailable.
        hover: { enabled: !touchFirstRef.current, delay: 300 },
        lineDecorationsWidth: 8,
        lineNumbersMinChars: 3,
        minimap: { enabled: false },
        overviewRulerBorder: false,
        overviewRulerLanes: 0,
        padding: { top: 5, bottom: 5 },
        readOnly,
        renderLineHighlight: 'gutter',
        renderValidationDecorations: 'on',
        roundedSelection: false,
        scrollbar: { alwaysConsumeMouseWheel: false, verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
        scrollBeyondLastLine: false,
        smoothScrolling: !touchFirstRef.current,
        // Touch-first devices frequently use Bluetooth keyboards but have much
        // tighter main-thread budgets. Suggestions remain available explicitly
        // with Ctrl+Space without doing work after every typed character.
        quickSuggestions: touchFirstRef.current ? false : undefined,
        suggestOnTriggerCharacters: !touchFirstRef.current,
        acceptSuggestionOnEnter: touchFirstRef.current ? 'off' : 'on',
        // Mix snippets into the ranked list so local variables/functions with
        // sortText 00-03 stay ahead of generic language templates.
        snippetSuggestions: 'inline',
        suggest: {
          localityBonus: true,
          preview: true,
          showIcons: true,
          showInlineDetails: true,
          showStatusBar: false,
        },
        suggestFontSize: 13,
        suggestLineHeight: 24,
        tabSize: 2,
        // Monaco's invisible-character highlighter can render ordinary-looking
        // whitespace as a warning. Whitespace is intentionally not a lint rule.
        unicodeHighlight: { invisibleCharacters: false },
        wordWrap: 'on',
      }}
      />
    </div>
  );
}

export default OctaveEditor;
