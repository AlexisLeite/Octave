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
  completionSources: WeakMap<editor.ITextModel, string[]>;
  providerRevision?: object;
  completionProvider?: IDisposable;
  inspectionProvider?: IDisposable;
};

const globalRegistry = globalThis as typeof globalThis & {
  __octaveMonacoRegistry?: Registry;
};

const registry: Registry =
  globalRegistry.__octaveMonacoRegistry ??
  (globalRegistry.__octaveMonacoRegistry = {
    instances: new WeakSet<object>(),
    inspectors: new WeakMap<editor.ITextModel, InspectionBinding>(),
    completionSources: new WeakMap<editor.ITextModel, string[]>(),
  });

registry.completionSources ??= new WeakMap<editor.ITextModel, string[]>();
const providerRevision = {};

export interface OctaveCompletionSymbol {
  name: string;
  kind: 'variable' | 'parameter' | 'function' | 'field';
  owner?: string;
}

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

/** Return the line-comment marker to insert after Enter at a model column. */
export function octaveCommentPrefixAt(line: string, column: number): string | undefined {
  if (/^\s*(?:%+|#+)[{}]/.test(line)) return undefined;

  const beforeCursor = line.slice(0, Math.max(0, column - 1));
  const comment = /^(\s*)((?:%+|#+))(?:[ \t]?)/.exec(beforeCursor);
  if (!comment || column - 1 < comment[1].length + comment[2].length) return undefined;
  return `${comment[2]} `;
}

export const octaveLanguageConfiguration: languages.LanguageConfiguration = {
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
    { open: '"', close: '"', notIn: ['string', 'comment'] },
  ],
  surroundingPairs: [
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '(', close: ')' },
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

function executableOctaveLines(source: string): string[] {
  let blockComment = false;
  return source.split(/\r?\n/).map((line) => {
    const trimmed = line.trim();
    if (blockComment) {
      if (trimmed === '%}' || trimmed === '#}') blockComment = false;
      return '';
    }
    if (trimmed === '%{' || trimmed === '#{') {
      blockComment = true;
      return '';
    }

    let result = '';
    let quote: "'" | '"' | null = null;
    for (let index = 0; index < line.length; index += 1) {
      const character = line[index];
      if (quote) {
        result += ' ';
        if (quote === "'" && character === "'" && line[index + 1] === "'") {
          result += ' ';
          index += 1;
        } else if (quote === '"' && character === '\\') {
          result += ' ';
          index += 1;
        } else if (character === quote) {
          quote = null;
        }
        continue;
      }
      if (character === '%' || character === '#') break;
      if (character === "'" || character === '"') {
        quote = character;
        result += ' ';
        continue;
      }
      result += character;
    }
    return result;
  });
}

/** Extracts user-defined names without treating strings or comments as code. */
export function collectOctaveSymbols(source: string): OctaveCompletionSymbol[] {
  const symbols = new Map<string, OctaveCompletionSymbol>();
  const add = (symbol: OctaveCompletionSymbol) => {
    const key = `${symbol.kind}:${symbol.owner ?? ''}:${symbol.name}`;
    if (!symbols.has(key)) symbols.set(key, symbol);
  };
  const addNames = (value: string | undefined, kind: 'variable' | 'parameter') => {
    for (const name of value?.match(/[A-Za-z_]\w*/g) ?? []) add({ name, kind });
  };

  for (const line of executableOctaveLines(source)) {
    const declaration = /^\s*function\s+(?:(?:\[([^\]]*)\]|([A-Za-z_]\w*))\s*=\s*)?([A-Za-z_]\w*)\s*(?:\(([^)]*)\))?/.exec(line);
    if (declaration) {
      add({ name: declaration[3], kind: 'function' });
      addNames(declaration[1] ?? declaration[2], 'variable');
      addNames(declaration[4], 'parameter');
    }

    const bracketAssignments = line.matchAll(/\[([^\]]+)\]\s*=(?!=)/g);
    for (const match of bracketAssignments) addNames(match[1], 'variable');

    const assignments = line.matchAll(/\b([A-Za-z_]\w*)\s*(?:\.[A-Za-z_]\w*\s*)*(?:\+=|-=|\*=|\/=|\\=|=(?!=))/g);
    for (const match of assignments) add({ name: match[1], kind: 'variable' });

    const loop = /^\s*(?:for|parfor)\s+([A-Za-z_]\w*)\s*=/.exec(line);
    if (loop) add({ name: loop[1], kind: 'variable' });
    const caught = /^\s*catch\s+([A-Za-z_]\w*)/.exec(line);
    if (caught) add({ name: caught[1], kind: 'variable' });
    const declared = /^\s*(?:global|persistent)\s+(.+)$/.exec(line);
    if (declared) addNames(declared[1], 'variable');

    for (const field of line.matchAll(/\b([A-Za-z_]\w*)\.([A-Za-z_]\w*)/g)) {
      add({ name: field[2], kind: 'field', owner: field[1] });
    }
  }
  return [...symbols.values()];
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

      const beforeCursor = model.getValueInRange({
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      });
      const linePrefix = model.getLineContent(position.lineNumber).slice(0, position.column - 1);
      const fieldOwner = /\b([A-Za-z_]\w*)\.[A-Za-z_]*$/.exec(linePrefix)?.[1];
      const currentSymbols = collectOctaveSymbols(beforeCursor);
      const currentFunctions = collectOctaveSymbols(model.getValue()).filter((symbol) => symbol.kind === 'function');
      const notebookSymbols = (registry.completionSources.get(model) ?? []).flatMap(collectOctaveSymbols);
      const seen = new Set<string>();
      const localItems: languages.CompletionItem[] = [];
      const appendSymbols = (symbols: OctaveCompletionSymbol[], rank: string, detail: string) => {
        for (const symbol of symbols) {
          if (fieldOwner ? symbol.kind !== 'field' || symbol.owner !== fieldOwner : symbol.kind === 'field') continue;
          if (seen.has(symbol.name)) continue;
          seen.add(symbol.name);
          const isFunction = symbol.kind === 'function';
          localItems.push({
            label: symbol.name,
            kind: isFunction
              ? monaco.languages.CompletionItemKind.Function
              : symbol.kind === 'field'
                ? monaco.languages.CompletionItemKind.Field
                : monaco.languages.CompletionItemKind.Variable,
            detail: `${detail} · ${symbol.kind === 'parameter' ? 'parámetro' : symbol.kind}`,
            insertText: isFunction ? `${symbol.name}($0)` : symbol.name,
            ...(isFunction ? { insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet } : {}),
            range,
            sortText: `${rank}-${symbol.name}`,
          });
        }
      };
      appendSymbols(currentSymbols, '00', 'Celda actual');
      appendSymbols(currentFunctions, '01', 'Celda actual');
      appendSymbols(notebookSymbols, '02', 'Cuaderno');
      if (!fieldOwner && !seen.has('heading')) {
        seen.add('heading');
        localItems.push({
          label: 'heading',
          filterText: 'heading',
          kind: monaco.languages.CompletionItemKind.Function,
          detail: 'Cuaderno · función implícita · heading(txt, txt2?)',
          documentation: 'Muestra un encabezado y, opcionalmente, un segundo valor.',
          insertText: 'heading(${1:txt})',
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range,
          sortText: '03-heading',
        });
      }

      const snippetItems: languages.CompletionItem[] = snippets.map(([label, insertText, detail]) => ({
        label,
        kind: monaco.languages.CompletionItemKind.Snippet,
        detail: `Octave · ${detail}`,
        documentation: detail,
        insertText,
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        range,
        sortText: `10-${label}`,
      }));

      const builtinItems: languages.CompletionItem[] = builtins.map((name) => ({
        label: name,
        kind: monaco.languages.CompletionItemKind.Function,
        detail: 'Octave built-in',
        insertText: `${name}($0)`,
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        range,
        sortText: `20-${name}`,
      }));

      const constantItems: languages.CompletionItem[] = constants.map((name) => ({
        label: name,
        kind: monaco.languages.CompletionItemKind.Constant,
        detail: 'Octave constant',
        insertText: name,
        range,
        sortText: `30-${name}`,
      }));

      const genericItems = [...snippetItems, ...builtinItems, ...constantItems]
        .filter((item) => {
          const label = typeof item.label === 'string' ? item.label : item.label.label;
          if (seen.has(label)) return false;
          seen.add(label);
          return true;
        });
      return { suggestions: [...localItems, ...genericItems] };
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
      } catch {
        // Hover inspection is opportunistic. Keywords, function names and
        // identifiers that do not exist in the current runtime are normal text,
        // not editor diagnostics. Real lint/runtime errors are rendered by
        // Monaco's marker hover instead.
        return undefined;
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
  monaco.languages.setLanguageConfiguration('octave', octaveLanguageConfiguration);
    monaco.languages.setMonarchTokensProvider('octave', monarchLanguage);
  }
  monaco.editor.defineTheme('octave-light', {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'identifier.octave', foreground: '17211D' },
      { token: 'comment.octave', foreground: '56665E', fontStyle: 'italic' },
      { token: 'keyword.octave', foreground: '7E22CE', fontStyle: 'bold' },
      { token: 'keyword.operator.octave', foreground: '006F9A' },
      { token: 'support.function.octave', foreground: '007C73' },
      { token: 'constant.octave', foreground: 'A5144E', fontStyle: 'bold' },
      { token: 'number.octave', foreground: 'A84400' },
      { token: 'string.octave', foreground: '357A20' },
      { token: 'string.escape.octave', foreground: '914800', fontStyle: 'bold' },
      { token: 'string.escape.invalid.octave', foreground: 'B42318' },
      { token: 'operator.octave', foreground: '006F9A' },
      { token: 'delimiter.octave', foreground: '4D5B55' },
    ],
    colors: {
      'editor.background': '#FBFCFB',
      'editor.foreground': '#17211D',
      'editorLineNumber.foreground': '#697871',
      'editorLineNumber.activeForeground': '#17211D',
      'editor.lineHighlightBackground': '#F0F4F2',
      'editor.selectionBackground': '#B8E1E1',
      'editor.inactiveSelectionBackground': '#DCEBE8',
      'editorCursor.foreground': '#007C73',
      'editorIndentGuide.background1': '#D6DFDA',
      'editorIndentGuide.activeBackground1': '#8FA39A',
      'editorBracketHighlight.foreground1': '#00877E',
      'editorBracketHighlight.foreground2': '#8B2CC4',
      'editorBracketHighlight.foreground3': '#B45309',
      'editorGutter.background': '#FBFCFB',
      'editorError.foreground': '#B42318',
      'editorError.border': '#00000000',
      'editorWarning.foreground': '#92610F',
      'editorInfo.foreground': '#007C73',
      'editorHoverWidget.background': '#FBFCFB',
      'editorHoverWidget.foreground': '#17211D',
      'editorHoverWidget.border': '#AEBDB5',
      'editorSuggestWidget.background': '#FBFCFB',
      'editorSuggestWidget.foreground': '#17211D',
      'editorSuggestWidget.border': '#9FB2C9',
      'editorSuggestWidget.highlightForeground': '#1468D4',
      'editorSuggestWidget.focusHighlightForeground': '#0B57B7',
      'editorSuggestWidget.selectedBackground': '#D8E6F7',
      'editorSuggestWidget.selectedForeground': '#101828',
      'editorSuggestWidget.selectedIconForeground': '#0B57B7',
      'editorSuggestWidget.statusForeground': '#586A82',
      'editorWidget.border': '#AEBDB5',
    },
  });
  monaco.editor.defineTheme('octave-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'identifier.octave', foreground: 'E8F0EC' },
      { token: 'comment.octave', foreground: '91A69B', fontStyle: 'italic' },
      { token: 'keyword.octave', foreground: 'E879F9', fontStyle: 'bold' },
      { token: 'keyword.operator.octave', foreground: '67E8F9' },
      { token: 'support.function.octave', foreground: '2DD4BF' },
      { token: 'constant.octave', foreground: 'FBBF24', fontStyle: 'bold' },
      { token: 'number.octave', foreground: 'FB923C' },
      { token: 'string.octave', foreground: 'A3E635' },
      { token: 'string.escape.octave', foreground: 'FDE047', fontStyle: 'bold' },
      { token: 'string.escape.invalid.octave', foreground: 'FF6B6B' },
      { token: 'operator.octave', foreground: '7DD3FC' },
      { token: 'delimiter.octave', foreground: 'B8C4BE' },
    ],
    colors: {
      'editor.background': '#111714',
      'editor.foreground': '#E8F0EC',
      'editorLineNumber.foreground': '#718078',
      'editorLineNumber.activeForeground': '#E8F0EC',
      'editor.lineHighlightBackground': '#19211D',
      'editor.selectionBackground': '#145E63',
      'editor.inactiveSelectionBackground': '#25443F',
      'editorCursor.foreground': '#5EEAD4',
      'editorIndentGuide.background1': '#2A352F',
      'editorIndentGuide.activeBackground1': '#587064',
      'editorBracketHighlight.foreground1': '#2DD4BF',
      'editorBracketHighlight.foreground2': '#E879F9',
      'editorBracketHighlight.foreground3': '#FBBF24',
      'editorGutter.background': '#111714',
      'editorError.foreground': '#FF6B6B',
      'editorError.border': '#00000000',
      'editorWarning.foreground': '#FBBF24',
      'editorInfo.foreground': '#2DD4BF',
      'editorHoverWidget.background': '#19211D',
      'editorHoverWidget.foreground': '#E8F0EC',
      'editorHoverWidget.border': '#415249',
      'editorSuggestWidget.background': '#19211D',
      'editorSuggestWidget.foreground': '#E8F0EC',
      'editorSuggestWidget.border': '#415249',
      'editorSuggestWidget.highlightForeground': '#5EEAD4',
      'editorSuggestWidget.focusHighlightForeground': '#99F6E4',
      'editorSuggestWidget.selectedBackground': '#21423A',
      'editorSuggestWidget.selectedForeground': '#F4FFF9',
      'editorSuggestWidget.selectedIconForeground': '#5EEAD4',
      'editorSuggestWidget.statusForeground': '#A9BBB2',
      'editorWidget.border': '#415249',
    },
  });
  // Providers capture the module implementation. Replace them once per HMR
  // revision so mounted editors receive new completions without a full reload.
  if (registry.providerRevision !== providerRevision) {
    registry.completionProvider?.dispose();
    registry.inspectionProvider?.dispose();
    registry.completionProvider = registerCompletionProvider(monaco);
    registry.inspectionProvider = registerInspectionProvider(monaco);
    registry.providerRevision = providerRevision;
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

export function bindOctaveCompletionSources(
  model: editor.ITextModel,
  sources: string[],
): () => void {
  registry.completionSources.set(model, sources);
  return () => {
    if (registry.completionSources.get(model) === sources) registry.completionSources.delete(model);
  };
}
