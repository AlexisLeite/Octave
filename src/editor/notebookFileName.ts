export function notebookPdfName(path: string) {
  const filename = path.split('/').at(-1) || 'notebook.octnb'
  return `${filename.replace(/\.octnb$/iu, '')}.pdf`
}

