import type { editor, languages, IDisposable, IPosition, Selection } from 'monaco-editor';

type Monaco = typeof import('monaco-editor');

export type OctaveInspection = {
  display: string;
  type?: string;
  shape?: string;
};

export type OctaveInspector = (expression: string) => Promise<OctaveInspection>;

type InspectionBinding = {
  inspect: OctaveInspector;
  getSelection: () => Selection | null;
};

type Registry = {
  instances: WeakSet<object>;
  inspectors: WeakMap<editor.ITextModel, InspectionBinding>;
};

const globalRegistry = globalThis as typeof globalThis & {
  __octaveMonacoRegistry?: Registry;
};

const registry: Registry =
  globalRegistry.__octaveMonacoRegistry ??
  (globalRegistry.__octaveMonacoRegistry = {
    instances: new WeakSet<object>(),
    inspectors: new WeakMap<editor.ITextModel, InspectionBinding>(),
  });

const keywords = [
  'break',
  'case',
  'catch',
  'classdef',
  'continue',
  'do',
  'else',
  'elseif',
  'end',
  'end_try_catch',
  'end_unwind_protect',
  'endclassdef',
  'endevents',
  'endenumeration',
  'endfor',
  'endfunction',
  'endif',
  'endmethods',
  'endparfor',
  'endproperties',
  'endswitch',
  'endwhile',
  'events',
  'enumeration',
  'for',
  'function',
  'get',
  'global',
  'if',
  'methods',
  'otherwise',
  'parfor',
  'persistent',
  'properties',
  'return',
  'set',
  'static',
  'switch',
  'try',
  'until',
  'unwind_protect',
  'unwind_protect_cleanup',
  'while',
];

const constants = ['Inf', 'NA', 'NaN', 'eps', 'false', 'i', 'j', 'pi', 'true'];

const builtins = [
  'abs', 'acos', 'acosh', 'all', 'any', 'arg', 'asin', 'asinh', 'atan', 'atan2', 'atanh',
  'axis', 'bar', 'cat', 'ceil', 'cell', 'cellfun', 'char', 'chol', 'class', 'clear', 'close',
  'colon', 'complex', 'cond', 'conv', 'cos', 'cosh', 'cumprod', 'cumsum', 'diag', 'diff',
  'disp', 'eig', 'error', 'eval', 'exp', 'eye', 'fft', 'fft2', 'figure', 'filter', 'find',
  'fix', 'floor', 'fprintf', 'fplot', 'fsolve', 'full', 'gca', 'gcf', 'grid', 'hist', 'hold',
  'ifft', 'ifft2', 'imag', 'input', 'interp1', 'inv', 'isempty', 'isequal', 'isfield',
  'isfinite', 'isinf', 'islogical', 'ismatrix', 'isnan', 'isnumeric', 'isreal', 'isscalar',
  'isvector', 'legend', 'length', 'linspace', 'load', 'log', 'log10', 'log2', 'logical',
  'logspace', 'lu', 'max', 'mean', 'mesh', 'meshgrid', 'min', 'mod', 'ndims', 'nnz',
  'norm', 'numel', 'ones', 'pinv', 'plot', 'plot3', 'polyfit', 'polyval', 'print', 'printf', 'prod',
  'qr', 'rand', 'randi', 'randn', 'rank', 'real', 'repmat', 'reshape', 'roots', 'round',
  'save', 'semilogx', 'semilogy', 'sin', 'size', 'sort', 'sparse', 'sprintf', 'sqrt',
  'std', 'stem', 'str2double', 'strcmp', 'strcmpi', 'strfind', 'struct', 'subplot', 'sum',
  'surf', 'svd', 'tan', 'tanh', 'title', 'trapz', 'unique', 'var', 'warning', 'who', 'whos',
  'xlabel', 'xlim', 'ylabel', 'ylim', 'zeros',
];

const blockOpenPattern =
  /^(?:\s*)(?:if|for|parfor|while|switch|try|unwind_protect|function|classdef|properties|methods|events|enumeration)\b/i;
const blockClosePattern =
  /^(?:\s*)(?:end|endif|endfor|endparfor|endwhile|endswitch|end_try_catch|end_unwind_protect|endfunction|endclassdef|endproperties|endmethods|endevents|endenumeration|until)\b/i;

const languageConfiguration: languages.LanguageConfiguration = {
  comments: {
    lineComment: '%',
    blockComment: ['%{', '%}'],
  },
  brackets: [
    ['{', '}'],
    ['[', ']'],
    ['(', ')'],
  ],
  autoClosingPairs: [
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '(', close: ')' },
    { open: "'", close: "'", notIn: ['string', 'comment'] },
    { open: '"', close: '"', notIn: ['string', 'comment'] },
  ],
  surroundingPairs: [
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '(', close: ')' },
    { open: "'", close: "'" },
    { open: '"', close: '"' },
  ],
  folding: {
    markers: {
      start: /^\s*(?:%|#)\s*#?region\b/i,
      end: /^\s*(?:%|#)\s*#?endregion\b/i,
    },
  },
  indentationRules: {
    increaseIndentPattern: blockOpenPattern,
    decreaseIndentPattern: blockClosePattern,
  },
  onEnterRules: [
    {
      beforeText: blockOpenPattern,
      action: { indentAction: 1 },
    },
  ],
  wordPattern: /(-?\d*\.\d\w*)|([^`~!@#%^&*()=+[\]{}\\|;:'",.<>/?\s]+)/g,
};

const monarchLanguage: languages.IMonarchLanguage = {
  defaultToken: '',
  tokenPostfix: '.octave',
  keywords,
  builtins,
  constants,
  operators: [
    '+', '-', '*', '/', '\\', '^', "'", ".'", '.*', './', '.\\', '.^', '=', '+=', '-=',
    '*=', '/=', '\\=', '^=', '&', '|', '&&', '||', '!', '~', '<', '<=', '>', '>=', '==',
    '~=', '!=', '++', '--', ':',
  ],
  brackets: [
    { open: '{', close: '}', token: 'delimiter.curly' },
    { open: '[', close: ']', token: 'delimiter.square' },
    { open: '(', close: ')', token: 'delimiter.parenthesis' },
  ],
  tokenizer: {
    root: [
      [/^\s*(?:%\{|#\{)/, 'comment', '@blockComment'],
      [/%.*$/, 'comment'],
      [/#.*$/, 'comment'],
      [/\.\.\./, 'keyword.operator'],
      [/[a-zA-Z_]\w*/, {
        cases: {
          '@keywords': 'keyword',
          // Built-ins are ordinary callable symbols. Keep them visually distinct
          // without using a token class that can be mistaken for diagnostics.
          '@builtins': 'support.function',
          '@constants': 'constant',
          '@default': 'identifier',
        },
      }],
      [/0[xX][0-9a-fA-F]+(?:[uU]?[lL]*)?/, 'number.hex'],
      [/0[bB][01]+(?:[uU]?[lL]*)?/, 'number.binary'],
      [/(?:\d+\.\d*|\.\d+|\d+)(?:[eEdD][+-]?\d+)?[ij]?/, 'number'],
      [/"/, 'string.quote', '@doubleString'],
      [/'(?=\s*(?:[+\-*\/\\^=<>~!&|:,;\])}]|$))/, 'operator'],
      [/'/, 'string.quote', '@singleString'],
      [/[{}()\[\]]/, '@brackets'],
      [/[;,.]/, 'delimiter'],
      [/[+\-*\/\\^=<>~!&|:]+/, 'operator'],
      [/\s+/, 'white'],
    ],
    blockComment: [
      [/^\s*(?:%\}|#\})/, 'comment', '@pop'],
      [/./, 'comment'],
    ],
    doubleString: [
      [/[^"\\]+/, 'string'],
      [/\\(?:[abfnrtv\\"']|x[0-9a-fA-F]{2}|[0-7]{1,3})/, 'string.escape'],
      [/\\./, 'string.escape.invalid'],
      [/""/, 'string.escape'],
      [/"/, 'string.quote', '@pop'],
    ],
    singleString: [
      [/[^']+/, 'string'],
      [/''/, 'string.escape'],
      [/'/, 'string.quote', '@pop'],
    ],
  },
};

const snippets = [
  ['if', 'if ${1:condition}\n\t${0}\nend', 'if block'],
  ['ife', 'if ${1:condition}\n\t${2}\nelse\n\t${0}\nend', 'if / else block'],
  ['for', 'for ${1:i} = ${2:1:n}\n\t${0}\nend', 'for loop'],
  ['while', 'while ${1:condition}\n\t${0}\nend', 'while loop'],
  ['function', 'function ${1:result} = ${2:name}(${3:args})\n\t${0}\nendfunction', 'function'],
  ['switch', 'switch ${1:value}\n\tcase ${2:case_value}\n\t\t${0}\n\totherwise\nend', 'switch block'],
  ['try', 'try\n\t${1}\ncatch ${2:err}\n\t${0}\nend_try_catch', 'try / catch block'],
] as const;

function expressionAt(
  model: editor.ITextModel,
  position: IPosition,
  selection: Selection | null,
): string | undefined {
  if (selection && !selection.isEmpty() && selection.containsPosition(position)) {
    const selected = model.getValueInRange(selection).trim();
    if (selected && !selected.includes('\n') && selected.length <= 240) return selected;
  }

  const line = model.getLineContent(position.lineNumber);
  const cursor = Math.max(0, position.column - 1);
  const allowed = /[\w.]/;
  let start = cursor;
  let end = cursor;
  while (start > 0 && allowed.test(line[start - 1])) start -= 1;
  while (end < line.length && allowed.test(line[end])) end += 1;
  const candidate = line.slice(start, end).replace(/^\.+|\.+$/g, '');
  return /^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*$/.test(candidate) ? candidate : undefined;
}

function markdownCode(value: string): string {
  return `\`\`\`text\n${value.replace(/```/g, '\\`\\`\\`')}\n\`\`\``;
}

function registerCompletionProvider(monaco: Monaco): IDisposable {
  return monaco.languages.registerCompletionItemProvider('octave', {
    triggerCharacters: ['.'],
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };

      const snippetItems: languages.CompletionItem[] = snippets.map(([label, insertText, detail]) => ({
        label,
        kind: monaco.languages.CompletionItemKind.Snippet,
        detail: `Octave · ${detail}`,
        documentation: detail,
        insertText,
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        range,
        sortText: `0-${label}`,
      }));

      const builtinItems: languages.CompletionItem[] = builtins.map((name) => ({
        label: name,
        kind: monaco.languages.CompletionItemKind.Function,
        detail: 'Octave built-in',
        insertText: `${name}($0)`,
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        range,
        sortText: `1-${name}`,
      }));

      const constantItems: languages.CompletionItem[] = constants.map((name) => ({
        label: name,
        kind: monaco.languages.CompletionItemKind.Constant,
        detail: 'Octave constant',
        insertText: name,
        range,
        sortText: `2-${name}`,
      }));

      return { suggestions: [...snippetItems, ...builtinItems, ...constantItems] };
    },
  });
}

function registerInspectionProvider(monaco: Monaco): IDisposable {
  return monaco.languages.registerHoverProvider('octave', {
    async provideHover(model, position, token) {
      const binding = registry.inspectors.get(model);
      if (!binding) return undefined;
      const expression = expressionAt(model, position, binding.getSelection());
      if (!expression) return undefined;

      try {
        const result = await binding.inspect(expression);
        if (token.isCancellationRequested) return undefined;
        const metadata = [result.type, result.shape].filter(Boolean).join(' · ');
        return {
          range: model.getWordAtPosition(position)
            ? {
                startLineNumber: position.lineNumber,
                endLineNumber: position.lineNumber,
                startColumn: model.getWordAtPosition(position)!.startColumn,
                endColumn: model.getWordAtPosition(position)!.endColumn,
              }
            : undefined,
          contents: [
            { value: `**${expression.replace(/[*_`]/g, '\\$&')}**${metadata ? `  \n${metadata}` : ''}` },
            { value: markdownCode(result.display) },
          ],
        };
      } catch (error) {
        if (token.isCancellationRequested) return undefined;
        const message = error instanceof Error ? error.message : 'Inspection failed';
        return { contents: [{ value: `$(error) ${message.replace(/[<>]/g, '')}` }] };
      }
    },
  });
}

/** Register Octave once for each Monaco runtime, including across Vite HMR reloads. */
export function registerOctaveLanguage(monaco: Monaco): void {
  const isNewRuntime = !registry.instances.has(monaco as object);
  if (isNewRuntime) registry.instances.add(monaco as object);

  if (isNewRuntime) {
    if (!monaco.languages.getLanguages().some((language) => language.id === 'octave')) {
      monaco.languages.register({
        id: 'octave',
        aliases: ['Octave', 'GNU Octave'],
        extensions: ['.m'],
        mimetypes: ['text/x-octave'],
      });
    }
    monaco.languages.setLanguageConfiguration('octave', languageConfiguration);
    monaco.languages.setMonarchTokensProvider('octave', monarchLanguage);
  }
  monaco.editor.defineTheme('octave-light', {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'comment.octave', foreground: '66716D', fontStyle: 'italic' },
      { token: 'keyword.octave', foreground: '735789' },
      { token: 'keyword.operator.octave', foreground: '343836' },
      { token: 'support.function.octave', foreground: '2C6E75' },
      { token: 'constant.octave', foreground: '795D82' },
      { token: 'number.octave', foreground: '875B28' },
      { token: 'string.octave', foreground: '4F6B3A' },
      { token: 'string.escape.octave', foreground: '725329' },
      { token: 'string.escape.invalid.octave', foreground: 'B42318' },
      { token: 'operator.octave', foreground: '343836' },
      { token: 'delimiter.octave', foreground: '59615E' },
    ],
    colors: {
      'editor.background': '#FAFBFA',
      'editor.foreground': '#292D2B',
      'editorLineNumber.foreground': '#7A837F',
      'editorLineNumber.activeForeground': '#343A37',
      'editor.lineHighlightBackground': '#F0F3F1',
      'editor.selectionBackground': '#C9DDE0',
      'editor.inactiveSelectionBackground': '#E1E9E8',
      'editorCursor.foreground': '#2C6E75',
      'editorIndentGuide.background1': '#D9DEDB',
      'editorIndentGuide.activeBackground1': '#AEB8B3',
      'editorBracketHighlight.foreground1': '#286C73',
      'editorBracketHighlight.foreground2': '#72538B',
      'editorBracketHighlight.foreground3': '#856128',
      'editorGutter.background': '#FAFBFA',
      'editorError.foreground': '#B42318',
      'editorError.border': '#00000000',
      'editorWarning.foreground': '#92610F',
      'editorInfo.foreground': '#2C6E75',
      'editorHoverWidget.background': '#FAFBFA',
      'editorHoverWidget.foreground': '#292D2B',
      'editorHoverWidget.border': '#BEC7C2',
      'editorSuggestWidget.background': '#FAFBFA',
      'editorSuggestWidget.foreground': '#292D2B',
      'editorSuggestWidget.border': '#BEC7C2',
      'editorSuggestWidget.selectedBackground': '#DDE9E6',
      'editorWidget.border': '#BEC7C2',
    },
  });
  monaco.editor.defineTheme('octave-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment.octave', foreground: '8B9691', fontStyle: 'italic' },
      { token: 'keyword.octave', foreground: 'C1A7D8' },
      { token: 'keyword.operator.octave', foreground: 'CDD2CF' },
      { token: 'support.function.octave', foreground: '8DBBC0' },
      { token: 'constant.octave', foreground: 'C0A4C7' },
      { token: 'number.octave', foreground: 'D1AE78' },
      { token: 'string.octave', foreground: 'A9BF8D' },
      { token: 'string.escape.octave', foreground: 'D0B77F' },
      { token: 'string.escape.invalid.octave', foreground: 'FF7B72' },
      { token: 'operator.octave', foreground: 'CDD2CF' },
      { token: 'delimiter.octave', foreground: 'AAB2AE' },
    ],
    colors: {
      'editor.background': '#191C1B',
      'editor.foreground': '#DDE2DF',
      'editorLineNumber.foreground': '#747E79',
      'editorLineNumber.activeForeground': '#C3CBC7',
      'editor.lineHighlightBackground': '#212522',
      'editor.selectionBackground': '#31565B',
      'editor.inactiveSelectionBackground': '#293D3E',
      'editorCursor.foreground': '#9BC9CE',
      'editorIndentGuide.background1': '#333A36',
      'editorIndentGuide.activeBackground1': '#59645E',
      'editorBracketHighlight.foreground1': '#83B6BC',
      'editorBracketHighlight.foreground2': '#B59ACD',
      'editorBracketHighlight.foreground3': '#C5A66F',
      'editorGutter.background': '#191C1B',
      'editorError.foreground': '#FF7B72',
      'editorError.border': '#00000000',
      'editorWarning.foreground': '#D8B16B',
      'editorInfo.foreground': '#8DBBC0',
      'editorHoverWidget.background': '#222624',
      'editorHoverWidget.foreground': '#DDE2DF',
      'editorHoverWidget.border': '#47504B',
      'editorSuggestWidget.background': '#222624',
      'editorSuggestWidget.foreground': '#DDE2DF',
      'editorSuggestWidget.border': '#47504B',
      'editorSuggestWidget.selectedBackground': '#304642',
      'editorWidget.border': '#47504B',
    },
  });
  if (isNewRuntime) {
    registerCompletionProvider(monaco);
    registerInspectionProvider(monaco);
  }
}

export function bindOctaveInspector(
  model: editor.ITextModel,
  getSelection: () => Selection | null,
  inspect?: OctaveInspector,
): () => void {
  if (!inspect) {
    registry.inspectors.delete(model);
    return () => undefined;
  }

  const binding = { inspect, getSelection };
  registry.inspectors.set(model, binding);
  return () => {
    if (registry.inspectors.get(model) === binding) registry.inspectors.delete(model);
  };
}
