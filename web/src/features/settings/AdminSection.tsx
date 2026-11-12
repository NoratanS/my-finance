import { useId } from 'react'
import { InviteForm } from '@/features/settings/InviteForm'
import { PendingInvites } from '@/features/settings/PendingInvites'

// Mounted for the admin only, so members never ask for admin data.
export function AdminSection() {
  const titleId = useId()
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-4 pt-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-2">
        <h2
          id={titleId}
          className="m-0 text-[28px] leading-[1.14] font-bold tracking-[-0.018em]"
        >
          Admin
        </h2>
        <span className="text-[13px] text-text-muted">
          Only you see this section.
        </span>
      </div>
      <InviteForm />
      <PendingInvites />
    </section>
  )
}
