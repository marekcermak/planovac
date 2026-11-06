import { useEffect, useState } from 'react'
import { supabase } from './supabase'

export const RECIPE_BUCKET = 'recipe-photos'
export const JOURNAL_BUCKET = 'journal-photos'

/** Zmenší fotku (delší strana max `max` px) a převede na JPEG – rychlejší nahrání i levnější AI. */
export async function shrinkImage(file: Blob, max = 1600, quality = 0.85): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => null)
  if (!bitmap) return file
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()
  return await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b ?? file), 'image/jpeg', quality))
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer())
  let bin = ''
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000))
  return btoa(bin)
}

// Podepsané odkazy na soukromé fotky; cache na 50 minut (platí hodinu).
const cache = new Map<string, { url: string; until: number }>()

export async function signedUrls(paths: string[], bucket = RECIPE_BUCKET): Promise<Record<string, string>> {
  const now = Date.now()
  const out: Record<string, string> = {}
  const missing: string[] = []
  for (const p of paths) {
    const c = cache.get(`${bucket}:${p}`)
    if (c && c.until > now) out[p] = c.url
    else missing.push(p)
  }
  if (missing.length) {
    const { data } = await supabase.storage.from(bucket).createSignedUrls(missing, 3600)
    for (const d of data ?? []) {
      if (d.path && d.signedUrl) {
        cache.set(`${bucket}:${d.path}`, { url: d.signedUrl, until: now + 50 * 60_000 })
        out[d.path] = d.signedUrl
      }
    }
  }
  return out
}

export function useSignedUrls(paths: string[], bucket = RECIPE_BUCKET): Record<string, string> {
  const key = paths.join('|')
  const [urls, setUrls] = useState<Record<string, string>>({})
  useEffect(() => {
    if (!key) return
    let alive = true
    void signedUrls(key.split('|'), bucket).then((u) => alive && setUrls(u))
    return () => {
      alive = false
    }
  }, [key, bucket])
  return urls
}
