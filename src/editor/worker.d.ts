declare module '*?worker' {
  const WorkerFactory: {
    new (): Worker;
  };
  export default WorkerFactory;
}

declare module 'monaco-editor/esm/vs/editor/contrib/wordOperations/browser/wordOperations.js';
