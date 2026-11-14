import { Alert } from '@/components/ui/Alert'
import { useSignOut } from '@/features/auth/useSignOut'

// The signed-in account, shared by the user menu and the phone's More sheet.
export function SignedInAs({ email }: { email: string }) {
  return (
    <span className="flex min-w-0 flex-auto flex-col gap-0.5">
      <span className="text-xs text-text-muted">Signed in as</span>
      <span className="font-semibold wrap-anywhere">{email}</span>
    </span>
  )
}

// Sign out and its failure notice; the user menu passes its item role.
export function SignOutButton({
  className,
  role,
  tabIndex,
}: {
  className: string
  role?: 'menuitem'
  tabIndex?: number
}) {
  const signOut = useSignOut()
  return (
    <>
      <button
        role={role}
        tabIndex={tabIndex}
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
        <div className="pt-1.5">
          <Alert>Couldn’t sign out. Try again.</Alert>
        </div>
      )}
    </>
  )
}
