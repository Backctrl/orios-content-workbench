export function inlineMarkdown(text: string): JSX.Element {
  const parts = text.split(/\*\*(.+?)\*\*/g)
  return <>{parts.map((part, index) => index % 2 === 1 ? <strong key={index}>{part}</strong> : <span key={index}>{part}</span>)}</>
}

export function markdownPreview(text: string): JSX.Element {
  const nodes: JSX.Element[] = []
  let inCode = false
  const codeLines: string[] = []
  const pushParagraph = (line: string, index: number): void => {
    const trimmed = line.trim()
    if (trimmed.startsWith('# ')) return void nodes.push(<h1 key={index}>{inlineMarkdown(trimmed.slice(2))}</h1>)
    if (trimmed.startsWith('## ')) return void nodes.push(<h2 key={index}>{inlineMarkdown(trimmed.slice(3))}</h2>)
    if (trimmed.startsWith('### ')) return void nodes.push(<h3 key={index}>{inlineMarkdown(trimmed.slice(4))}</h3>)
    if (trimmed.startsWith('> ')) return void nodes.push(<blockquote key={index}>{inlineMarkdown(trimmed.slice(2))}</blockquote>)
    if (/^[-*] /.test(trimmed)) return void nodes.push(<li key={index}>{inlineMarkdown(trimmed.replace(/^[-*] /, ''))}</li>)
    if (/^\d+\. /.test(trimmed)) return void nodes.push(<li key={index}>{inlineMarkdown(trimmed.replace(/^\d+\. /, ''))}</li>)
    if (/^(-{3,}|\*{3,})$/.test(trimmed)) return void nodes.push(<hr key={index} />)
    if (trimmed === '') return void nodes.push(<div key={index} style={{ height: 8 }} />)
    nodes.push(<p key={index}>{inlineMarkdown(trimmed)}</p>)
  }
  text.split('\n').forEach((line, index) => {
    const trimmed = line.trim()
    if (trimmed.startsWith('```')) {
      if (inCode) {
        nodes.push(<pre key={index}>{codeLines.join('\n')}</pre>)
        codeLines.length = 0
        inCode = false
      } else {
        inCode = true
      }
      return
    }
    if (inCode) {
      codeLines.push(line)
      return
    }
    pushParagraph(line, index)
  })
  if (inCode && codeLines.length > 0) nodes.push(<pre key="open-code">{codeLines.join('\n')}</pre>)
  return <>{nodes}</>
}

export const MARKDOWN_PREVIEW_STYLES = `
.creatorMdPreview h1{font-size:20px;line-height:1.25;margin:0 0 14px}.creatorMdPreview h2{font-size:16px;margin:18px 0 7px}.creatorMdPreview h3{font-size:14px;margin:16px 0 6px}.creatorMdPreview p{white-space:pre-wrap;color:#d9dce2;line-height:1.8}.creatorMdPreview blockquote{margin:8px 0;padding:6px 10px;border-left:3px solid #7c8cff;background:rgba(124,140,255,.08);color:#9da3ad;font-size:12px}.creatorMdPreview li{margin:3px 0 3px 16px;color:#d9dce2;line-height:1.7;font-size:12px}.creatorMdPreview pre{overflow:auto;padding:9px 11px;border-radius:8px;background:#0c0e13;border:1px solid rgba(255,255,255,.11);font:11px/1.6 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#cfe3d8;white-space:pre}.creatorMdPreview hr{border:none;border-top:1px solid rgba(255,255,255,.11);margin:12px 0}.creatorMdPreview code{padding:1px 4px;border-radius:4px;background:rgba(255,255,255,.09);font-size:11px}
`
