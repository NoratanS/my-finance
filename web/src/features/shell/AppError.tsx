import { useRevalidator } from 'react-router'
import { Alert } from '@/components/ui/Alert'
import { primaryButtonClass } from '@/components/ui/buttonStyles'

// The signed-in screens couldn't load (API down, network gone); 401s redirect before this.
export function AppError() {
  const revalidator = useRevalidator()
  return (
    <main className="mx-auto box-border flex max-w-[440px] flex-col gap-4 px-6 pt-28 pb-12">
      <Alert>Something went wrong. Try again.</Alert>
      <button
        type="button"
        onClick={() => void revalidator.revalidate()}
        className={`${primaryButtonClass} min-h-11 self-center px-5 text-sm`}
      >
        Try again
      </button>
    </main>
  )
}
