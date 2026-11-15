// A dialog's first focus. React's autoFocus fires on mount, before showModal(); the attribute is read by showModal().
export const autofocus = (button: HTMLButtonElement | null) => {
  button?.setAttribute('autofocus', '')
}
