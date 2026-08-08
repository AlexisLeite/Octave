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
  'norm', 'numel', 'ones', 'pinv', 'plot', 'plot3', 'polyfit', 'polyval', 'printf', 'prod',
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
          '@builtins': 'type.identifier',
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
  if (registry.instances.has(monaco as object)) return;
  registry.instances.add(monaco as object);

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
  monaco.editor.defineTheme('octave-light', {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'comment.octave', foreground: '818A82', fontStyle: 'italic' },
      { token: 'keyword.octave', foreground: '7A3E72' },
      { token: 'keyword.operator.octave', foreground: '68716B' },
      { token: 'type.identifier.octave', foreground: '286B70' },
      { token: 'constant.octave', foreground: '98601F' },
      { token: 'number.octave', foreground: '98601F' },
      { token: 'string.octave', foreground: '4E773D' },
      { token: 'operator.octave', foreground: '58615B' },
    ],
    colors: {
      'editor.background': '#FBFCFA',
      'editor.foreground': '#242A31',
      'editorLineNumber.foreground': '#AEB5AE',
      'editorLineNumber.activeForeground': '#788078',
      'editor.lineHighlightBackground': '#F4F6F3',
      'editor.selectionBackground': '#DDE7E4',
      'editor.inactiveSelectionBackground': '#E8ECE8',
      'editorCursor.foreground': '#376D68',
      'editorIndentGuide.background1': '#E4E7E3',
      'editorBracketHighlight.foreground1': '#376D68',
      'editorBracketHighlight.foreground2': '#7A3E72',
      'editorBracketHighlight.foreground3': '#98601F',
      'editorGutter.background': '#FBFCFA',
      'editorHoverWidget.background': '#FFFFFF',
      'editorHoverWidget.border': '#CBD0CA',
      'editorSuggestWidget.background': '#FFFFFF',
      'editorSuggestWidget.border': '#CBD0CA',
      'editorSuggestWidget.selectedBackground': '#E4E8E3',
    },
  });
  monaco.editor.defineTheme('octave-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment.octave', foreground: '7F8981', fontStyle: 'italic' },
      { token: 'keyword.octave', foreground: 'D59BCB' },
      { token: 'keyword.operator.octave', foreground: 'AAB2AC' },
      { token: 'type.identifier.octave', foreground: '80B9B5' },
      { token: 'constant.octave', foreground: 'D6AD72' },
      { token: 'number.octave', foreground: 'D6AD72' },
      { token: 'string.octave', foreground: '9FBE88' },
      { token: 'operator.octave', foreground: 'AAB2AC' },
    ],
    colors: {
      'editor.background': '#202422',
      'editor.foreground': '#D8DCD7',
      'editorLineNumber.foreground': '#626B64',
      'editorLineNumber.activeForeground': '#929B94',
      'editor.lineHighlightBackground': '#252A27',
      'editor.selectionBackground': '#31514C',
      'editor.inactiveSelectionBackground': '#293A36',
      'editorCursor.foreground': '#71AAA4',
      'editorIndentGuide.background1': '#303632',
      'editorBracketHighlight.foreground1': '#71AAA4',
      'editorBracketHighlight.foreground2': '#D59BCB',
      'editorBracketHighlight.foreground3': '#D6AD72',
      'editorGutter.background': '#202422',
      'editorHoverWidget.background': '#252A27',
      'editorHoverWidget.border': '#424943',
      'editorSuggestWidget.background': '#252A27',
      'editorSuggestWidget.border': '#424943',
      'editorSuggestWidget.selectedBackground': '#303632',
    },
  });
  registerCompletionProvider(monaco);
  registerInspectionProvider(monaco);
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
