/** Pro hledání: malá písmena bez diakritiky („Kuřecí“ → „kureci“). */
export function fold(s: string): string {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim()
}
