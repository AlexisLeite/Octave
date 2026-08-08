export interface HelpMarkdownBlock {
  kind: 'markdown'
  source: string
}

export interface HelpCodeBlock {
  kind: 'code'
  source: string
  title?: string
}

export type HelpBlock = HelpMarkdownBlock | HelpCodeBlock

export interface HelpNode {
  id: string
  title: string
  blocks: HelpBlock[]
  children?: HelpNode[]
  keywords?: string[]
}

export const markdown = (source: string): HelpMarkdownBlock => ({ kind: 'markdown', source })
export const code = (source: string, title?: string): HelpCodeBlock => ({ kind: 'code', source, title })
export const topic = (
  id: string,
  title: string,
  blocks: HelpBlock[],
  children: HelpNode[] = [],
  keywords: string[] = [],
): HelpNode => ({ id, title, blocks, children, keywords })
