import Editor, { type BeforeMount, type OnMount } from '@monaco-editor/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { editor } from 'monaco-editor';

import { lintOctave, toMonacoMarkers, type OctaveDiagnostic } from '../editor/octaveLint';
import {
  bindOctaveInspector,
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
  diagnostics?: OctaveEditorDiagnostic[];
  onInspect?: (expression: string) => Promise<OctaveInspection>;
  readOnly?: boolean;
};

const MIN_HEIGHT = 96;
const MAX_HEIGHT = 520;

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
  diagnostics = [],
  onInspect,
  readOnly = false,
}: OctaveEditorProps) {
  const [height, setHeight] = useState(MIN_HEIGHT);
  const [theme, setTheme] = useState(currentEditorTheme);
  const [runtimeReady, setRuntimeReady] = useState(false);
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const onRunRef = useRef(onRun);
  const onInspectRef = useRef(onInspect);
  const diagnosticsRef = useRef(diagnostics);
  const inspectorCleanupRef = useRef<() => void>(() => undefined);

  onRunRef.current = onRun;
  onInspectRef.current = onInspect;
  diagnosticsRef.current = diagnostics;

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
  }, []);

  const onMount: OnMount = useCallback((instance, monaco) => {
    editorRef.current = instance;
    monacoRef.current = monaco;
    bindInspector();
    updateMarkers();

    const resize = () => {
      const next = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, instance.getContentHeight()));
      setHeight((current) => (Math.abs(current - next) > 1 ? next : current));
    };
    resize();

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
      id: 'octave-inspect-expression',
      label: 'Inspect Octave expression',
      keybindings: [monaco.KeyMod.Alt | monaco.KeyCode.KeyI],
      run: () => instance.trigger('octave-editor', 'editor.action.showHover', undefined),
    });

    instance.onDidContentSizeChange(resize);
    instance.onDidChangeModelContent(updateMarkers);
    instance.onDidChangeModel(() => {
      bindInspector();
      updateMarkers();
      resize();
    });
  }, [bindInspector, updateMarkers]);

  useEffect(() => {
    updateMarkers();
  }, [value, updateMarkers]);

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

  useEffect(() => () => {
    const model = editorRef.current?.getModel();
    const monaco = monacoRef.current;
    inspectorCleanupRef.current();
    if (model && monaco) {
      monaco.editor.setModelMarkers(model, 'octave-local', []);
      monaco.editor.setModelMarkers(model, 'octave-external', []);
    }
  }, []);

  if (!runtimeReady) return <div aria-hidden="true" style={{ height: MIN_HEIGHT }} />;

  return (
    <Editor
      height={height}
      language="octave"
      theme={theme}
      value={value}
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
        fontSize: 13,
        glyphMargin: false,
        guides: { bracketPairs: true, indentation: false },
        hover: { enabled: Boolean(onInspect), delay: 300 },
        lineDecorationsWidth: 8,
        lineNumbersMinChars: 3,
        minimap: { enabled: false },
        overviewRulerBorder: false,
        overviewRulerLanes: 0,
        padding: { top: 10, bottom: 10 },
        readOnly,
        renderLineHighlight: 'gutter',
        roundedSelection: false,
        scrollbar: { alwaysConsumeMouseWheel: false, verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
        scrollBeyondLastLine: false,
        smoothScrolling: true,
        snippetSuggestions: 'top',
        tabSize: 2,
        wordWrap: 'on',
      }}
    />
  );
}

export default OctaveEditor;
