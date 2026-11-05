import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Sheet } from '../components/Sheet'
import { Button, ErrorText, Field } from '../components/ui'

type Detector = { detect: (src: HTMLVideoElement) => Promise<{ rawValue: string }[]> }
type DetectorCtor = new (opts: { formats: string[] }) => Detector

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e']

export function validBarcode(code: string): boolean {
  return /^[0-9]{6,14}$/.test(code)
}

/**
 * Skener čárového kódu. Nativní BarcodeDetector (Chrome/Android), jinak @zxing/browser
 * (iPhone). Vždy jde kód i opsat ručně – na PC je to hlavní cesta.
 */
export function ScannerSheet({ open, onClose, onCode }: { open: boolean; onClose: () => void; onCode: (code: string) => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Skenovat čárový kód">
      {open && <ScannerBody onCode={onCode} />}
    </Sheet>
  )
}

function ScannerBody({ onCode }: { onCode: (code: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [manual, setManual] = useState('')
  const [starting, setStarting] = useState(true)
  const done = useRef(false)
  const preferManual = window.matchMedia('(min-width: 1024px)').matches
  // Kamera se spouští jen jednou; aktuální callback bereme z ref.
  const onCodeRef = useRef(onCode)
  useEffect(() => {
    onCodeRef.current = onCode
  }, [onCode])

  useEffect(() => {
    let stop = () => {}
    let cancelled = false
    const video = videoRef.current
    if (!video) return

    function hit(code: string) {
      const digits = code.replace(/\D/g, '')
      if (done.current || !validBarcode(digits)) return
      done.current = true
      navigator.vibrate?.(60)
      onCodeRef.current(digits)
    }

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Tenhle prohlížeč nepustí ke kameře. Opiš číslo pod kódem.')
      }
      const Native = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector
      if (Native) {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 } },
          audio: false,
        })
        if (cancelled) return stream.getTracks().forEach((t) => t.stop())
        video!.srcObject = stream
        await video!.play()
        const detector = new Native({ formats: FORMATS })
        let timer = 0
        const tick = async () => {
          if (cancelled || done.current) return
          try {
            const found = await detector.detect(video!)
            if (found[0]) hit(found[0].rawValue)
          } catch {
            /* další snímek */
          }
          timer = window.setTimeout(tick, 150)
        }
        void tick()
        stop = () => {
          clearTimeout(timer)
          stream.getTracks().forEach((t) => t.stop())
        }
      } else {
        const { BrowserMultiFormatReader } = await import('@zxing/browser')
        const reader = new BrowserMultiFormatReader()
        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: 'environment' }, audio: false },
          video!,
          (result) => {
            if (result) hit(result.getText())
          },
        )
        if (cancelled) return controls.stop()
        stop = () => controls.stop()
      }
    }

    start()
      .catch((e: unknown) => {
        const name = e instanceof Error ? e.name : ''
        setError(
          name === 'NotAllowedError'
            ? 'Přístup ke kameře je zakázaný. Povol ho v Nastavení iPhonu → Safari → Fotoaparát, nebo kód opiš.'
            : name === 'NotFoundError'
              ? 'Kamera nenalezena. Opiš číslo pod kódem.'
              : e instanceof Error && e.message
                ? e.message
                : 'Kameru se nepodařilo spustit. Opiš číslo pod kódem.',
        )
      })
      .finally(() => setStarting(false))

    return () => {
      cancelled = true
      stop()
    }
  }, [])

  function submit(e: FormEvent) {
    e.preventDefault()
    const digits = manual.replace(/\D/g, '')
    if (!validBarcode(digits)) return setError('Čárový kód má 8 až 14 číslic.')
    done.current = true
    onCode(digits)
  }

  return (
    <div className="space-y-4">
      {!error && (
        <div className="relative overflow-hidden rounded-2xl bg-black">
          <video ref={videoRef} playsInline muted className="aspect-[4/3] w-full object-cover" />
          <div className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 bg-red-500/80 shadow-[0_0_8px_rgba(239,68,68,0.9)]" />
          {starting && (
            <p className="absolute inset-0 flex items-center justify-center text-sm text-white/80">Spouštím kameru…</p>
          )}
        </div>
      )}
      <ErrorText>{error}</ErrorText>
      <form onSubmit={submit} className="flex items-end gap-2">
        <div className="flex-1">
          <Field
            label="Nebo opiš číslo pod kódem"
            inputMode="numeric"
            autoComplete="off"
            autoFocus={preferManual}
            value={manual}
            onChange={(e) => setManual(e.target.value)}
          />
        </div>
        <Button type="submit" variant="secondary">
          Hledat
        </Button>
      </form>
    </div>
  )
}
