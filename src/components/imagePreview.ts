export function openImagePreview(src: string, alt: string) {
  const dialog = document.createElement('dialog')
  dialog.className = 'markdown-image-preview'
  dialog.setAttribute('aria-label', alt ? `Vista previa: ${alt}` : 'Vista previa de imagen')

  const image = document.createElement('img')
  image.src = src
  image.alt = alt

  const close = document.createElement('button')
  close.type = 'button'
  close.className = 'markdown-image-preview-close'
  close.setAttribute('aria-label', 'Cerrar vista previa')
  close.title = 'Cerrar'
  close.textContent = '×'
  close.addEventListener('click', () => dialog.close())

  dialog.append(image, close)
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close() })
  dialog.addEventListener('close', () => dialog.remove())
  document.body.append(dialog)
  dialog.showModal()
  close.focus()
}
