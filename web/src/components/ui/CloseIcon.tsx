// The boards' small × for closing or removing something; the button around it carries the name.
export function CloseIcon({
  size = 10,
  className,
}: {
  size?: number
  className?: string
}) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 10 10"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      className={className}
    >
      <path d="M2 2l6 6M8 2 2 8" />
    </svg>
  )
}
