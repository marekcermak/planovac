import { Share, SquarePlus, X } from 'lucide-react'
import { useState } from 'react'

const DISMISS_KEY = 'planovac.installHintDismissed'

export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

export function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1'
  } catch {
    return false
  }
}

/** Návod „Přidat na plochu“. `always` = zobrazit i po zavření (stránka Více). */
export function InstallHint({ always = false }: { always?: boolean }) {
  const [dismissed, setDismissed] = useState(readDismissed)

  if (isStandalone()) return null
  if (!always && dismissed) return null

  const ios = isIos()

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      /* nevadí */
    }
    setDismissed(true)
  }

  return (
    <section className="relative rounded-2xl bg-brand-50 p-4 text-sm text-brand-800 ring-1 ring-brand-100 dark:bg-brand-800/20 dark:text-brand-100 dark:ring-brand-800">
      {!always && (
        <button onClick={dismiss} aria-label="Zavřít" className="absolute top-2 right-2 rounded-lg p-2">
          <X className="size-4" />
        </button>
      )}
      <h2 className="mb-2 font-semibold">Přidej si Plánovač na plochu</h2>
      {ios ? (
        <ol className="list-inside list-decimal space-y-1">
          <li>
            V Safari klepni dole na <Share className="inline size-4" aria-label="Sdílet" /> <strong>Sdílet</strong>.
          </li>
          <li>
            Vyber <SquarePlus className="inline size-4" aria-hidden /> <strong>Přidat na plochu</strong>.
          </li>
          <li>Spusť Plánovač z plochy a přihlas se kódem z e-mailu.</li>
        </ol>
      ) : (
        <p>
          V Chromu nebo Edgi otevři nabídku prohlížeče a zvol <strong>Nainstalovat aplikaci</strong> (na Androidu{' '}
          <strong>Přidat na plochu</strong>).
        </p>
      )}
      <p className="mt-2 opacity-80">
        Jen z plochy fungují na iPhonu upozornění a aplikace se otevírá přes celou obrazovku.
      </p>
    </section>
  )
}
