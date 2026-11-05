import { X } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * Dialog: na mobilu panel vysunutý zespodu, na PC okno uprostřed. Esc / klik vedle zavře.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  wide = false,
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
  wide?: boolean
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center lg:items-center" role="dialog" aria-modal>
      <button aria-label="Zavřít" className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        className={`relative max-h-[90dvh] w-full overflow-y-auto rounded-t-3xl bg-white px-4 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl lg:rounded-3xl lg:p-6 dark:bg-neutral-900 ${
          wide ? 'lg:max-w-3xl' : 'lg:max-w-lg'
        }`}
      >
        <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-neutral-300 lg:hidden dark:bg-neutral-700" />
        <div className="mb-3 flex items-start gap-3">
          <h2 className="min-w-0 flex-1 text-lg font-semibold">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Zavřít"
            className="-mt-1 -mr-1 flex size-10 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            <X className="size-5" />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  )
}
