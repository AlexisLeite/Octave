import { loader } from '@monaco-editor/react';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';

type WorkerScope = typeof globalThis & {
  MonacoEnvironment?: {
    getWorker: (_moduleId: string, _label: string) => Worker;
  };
};

let runtimePromise: Promise<void> | undefined;

/** Keep Monaco and its editor worker local; @monaco-editor/react otherwise defaults to a CDN. */
export function configureLocalMonaco(): Promise<void> {
  runtimePromise ??= Promise.all([
    import('monaco-editor/esm/vs/editor/editor.api'),
    import('monaco-editor/esm/vs/editor/contrib/codeAction/browser/codeActionContributions.js'),
    import('monaco-editor/esm/vs/editor/contrib/find/browser/findController.js'),
    import('monaco-editor/esm/vs/editor/contrib/hover/browser/hoverContribution.js'),
    import('monaco-editor/esm/vs/editor/contrib/multicursor/browser/multicursor.js'),
    import('monaco-editor/esm/vs/editor/contrib/suggest/browser/suggestController.js'),
    import('monaco-editor/esm/vs/editor/contrib/wordOperations/browser/wordOperations.js'),
  ]).then(([monaco]) => {
    loader.config({ monaco });
    if (typeof self !== 'undefined') {
      (self as WorkerScope).MonacoEnvironment = {
        getWorker: () => new EditorWorker(),
      };
    }
  });
  return runtimePromise;
}
