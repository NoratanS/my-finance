import { useRevalidator } from 'react-router'
import { Alert } from '@/components/ui/Alert'

// The signed-in screens couldn't load (API down, network gone); 401s redirect before this.
export function AppError() {
  const revalidator = useRevalidator()
  return (
    <main className="mx-auto box-border flex max-w-[440px] flex-col gap-4 px-6 pt-28 pb-12">
      <Alert>Something went wrong. Try again.</Alert>
      <button
        type="button"
        onClick={() => void revalidator.revalidate()}
        className="min-h-11 press cursor-pointer self-center rounded-full border-0 bg-accent px-5 text-sm font-[650] text-accent-ink"
      >
        Try again
      </button>
    </main>
  )
}
