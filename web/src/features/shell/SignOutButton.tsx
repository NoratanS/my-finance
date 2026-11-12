import { Alert } from '@/components/ui/Alert'
import { useSignOut } from '@/features/auth/useSignOut'

// Sign out and its failure notice, shared by the user menu and the phone's More sheet.
export function SignOutButton({ className }: { className: string }) {
  const signOut = useSignOut()
  return (
    <>
      <button
        type="button"
        disabled={signOut.isPending}
        onClick={() => {
          signOut.mutate()
        }}
        className={className}
      >
        <svg
          aria-hidden="true"
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="flex-none"
        >
          <path d="M6.5 2.5h-3a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h3M10 5l3 3-3 3M13 8H6" />
        </svg>
        Sign out
      </button>
      {signOut.isError && (
        <div className="p-1.5">
          <Alert>Couldn’t sign out. Try again.</Alert>
        </div>
      )}
    </>
  )
}
