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
const EDITOR_MOUNT_REVISION = 'monaco-native-suggest-layout-v1';

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
  const [height, setHeight] = useState(MIN_HEIGHT);
  const [theme, setTheme] = useState(currentEditorTheme);
  const [runtimeReady, setRuntimeReady] = useState(false);
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const onRunRef = useRef(onRun);
  const onFormatRef = useRef(onFormat);
  const onInspectRef = useRef(onInspect);
  const diagnosticsRef = useRef(diagnostics);
  const inspectorCleanupRef = useRef<() => void>(() => undefined);
  const completionCleanupRef = useRef<() => void>(() => undefined);
  const multiCursorCleanupRef = useRef<() => void>(() => undefined);
  const viewStateKeyRef = useRef(viewStateKey);
  const activeViewStateStorageKeyRef = useRef<string | undefined>(undefined);
  const viewStateTimerRef = useRef(0);

  onRunRef.current = onRun;
  onFormatRef.current = onFormat;
  onInspectRef.current = onInspect;
  diagnosticsRef.current = diagnostics;
  viewStateKeyRef.current = viewStateKey;

  const updateMarkers = useCallback(() => {
    const monaco = monacoRef.current;
    const model = editorRef.current?.getModel();
    if (!monaco || !model) return;
    monaco.editor.setModelMarkers(model, 'octave-local', toMonacoMarkers(monaco, model, lintOctave(model.getValue())));
    monaco.editor.setModelMarkers(model, 'octave-external', toMonacoMarkers(monaco, model, diagnosticsRef.current));
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

  const onMount: OnMount = useCallback((instance, monaco) => {
    editorRef.current = instance;
    monacoRef.current = monaco;
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
    const persistViewState = () => {
      const storageKey = activeViewStateStorageKeyRef.current;
      if (!storageKey) return;
      window.clearTimeout(viewStateTimerRef.current);
      viewStateTimerRef.current = window.setTimeout(() => {
        const state = instance.saveViewState();
        if (state) localStorage.setItem(storageKey, JSON.stringify(state));
      }, 100);
    };
    instance.onDidChangeCursorSelection(() => {
      persistViewState();
    });
    instance.onDidScrollChange(persistViewState);
    instance.onDidBlurEditorText(persistViewState);

    bindInspector();
    updateMarkers();
    completionCleanupRef.current();
    if (instance.getModel()) {
      completionCleanupRef.current = bindOctaveCompletionSources(instance.getModel()!, completionSources);
    }

    multiCursorCleanupRef.current();
    const editorDomNode = instance.getDomNode();
    const allowBrowserFind = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey || event.key.toLowerCase() !== 'f') return;
      // Do not preventDefault: stopping propagation before Monaco receives the
      // key leaves the browser's native Find command intact.
      event.stopPropagation();
      event.stopImmediatePropagation();
    };
    editorDomNode?.addEventListener('keydown', allowBrowserFind, true);
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
    };

    const resize = () => {
      const maximum = Math.max(MIN_HEIGHT, Math.floor(window.innerHeight * 0.95));
      const model = instance.getModel();
      const contentHeight = model
        ? instance.getBottomForLineNumber(model.getLineCount()) + 5
        : MIN_HEIGHT;
      const next = Math.min(maximum, Math.max(MIN_HEIGHT, contentHeight));
      setHeight((current) => (Math.abs(current - next) > 1 ? next : current));
    };
    resize();
    window.addEventListener('resize', resize);
    instance.onDidDispose(() => {
      window.removeEventListener('resize', resize);
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
    instance.onDidContentSizeChange(resize);
    instance.onDidChangeCursorSelection(updateCommentContinuation);
    instance.onDidChangeModelContent(() => {
      updateCommentContinuation();
      updateMarkers();
    });
    instance.onDidChangeModel(() => {
      bindInspector();
      updateCommentContinuation();
      updateMarkers();
      resize();
    });
  }, [bindInspector, updateMarkers]);

  useEffect(() => {
    updateMarkers();
    const instance = editorRef.current;
    const monaco = monacoRef.current;
    const model = instance?.getModel();
    if (instance && monaco && model && model.getValue() !== value) {
      const previous = model.getValue();
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
      instance.executeEdits('octave-external-value', [{
        range: model.getFullModelRange(),
        text: value,
        forceMoveMarkers: true,
      }]);
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
  }, [value, diagnostics, updateMarkers]);

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
    if (!instance) return;
    const maximum = Math.max(MIN_HEIGHT, Math.floor(window.innerHeight * 0.95));
    const model = instance.getModel();
    const contentHeight = model
      ? instance.getBottomForLineNumber(model.getLineCount()) + 5
      : MIN_HEIGHT;
    const next = Math.min(maximum, Math.max(MIN_HEIGHT, contentHeight));
    setHeight((current) => Math.abs(current - next) > 1 ? next : current);
  }, [runtimeReady, value]);

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

  useEffect(() => {
    const model = editorRef.current?.getModel();
    completionCleanupRef.current();
    completionCleanupRef.current = model
      ? bindOctaveCompletionSources(model, completionSources)
      : () => undefined;
    return () => completionCleanupRef.current();
  }, [completionSources]);

  useEffect(() => () => {
    const model = editorRef.current?.getModel();
    const monaco = monacoRef.current;
    inspectorCleanupRef.current();
    completionCleanupRef.current();
    multiCursorCleanupRef.current();
    if (model && monaco) {
      monaco.editor.setModelMarkers(model, 'octave-local', []);
      monaco.editor.setModelMarkers(model, 'octave-external', []);
    }
  }, []);

  if (!runtimeReady) return <div aria-hidden="true" style={{ height: MIN_HEIGHT }} />;

  return (
    <Editor
      key={EDITOR_MOUNT_REVISION}
      height={height}
      language="octave"
      theme={theme}
      defaultValue={value}
      saveViewState={false}
      beforeMount={beforeMount}
      onMount={onMount}
      onChange={(nextValue) => onChange(nextValue ?? '')}
      loading={null}
      options={{
        ariaLabel: 'Octave code',
        automaticLayout: true,
        bracketPairColorization: { enabled: true },
        cursorBlinking: 'smooth',
        cursorSmoothCaretAnimation: 'on',
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
        hover: { enabled: true, delay: 300 },
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
        smoothScrolling: true,
        snippetSuggestions: 'top',
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
  );
}

export default OctaveEditor;
