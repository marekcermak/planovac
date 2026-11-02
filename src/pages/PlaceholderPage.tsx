import { Card, PageHeader } from '../components/ui'

export function PlaceholderPage({ title, phase, text }: { title: string; phase: number; text: string }) {
  return (
    <>
      <PageHeader title={title} />
      <Card>
        <p className="text-neutral-600 dark:text-neutral-400">{text}</p>
        <p className="mt-2 text-sm text-neutral-500">Připravujeme, přijde ve fázi {phase}.</p>
      </Card>
    </>
  )
}
