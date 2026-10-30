/**
 * Whether a message or connection came from one of BookPass's own pages (the popup, manager or settings), as opposed
 * to a web page, a script injected into one, or another extension. Nothing but those pages should ever be able to
 * ask the vault for anything.
 */
export function isOwnPage(
  sender: { id?: string; url?: string },
  extensionId: string,
  extensionUrl: string,
): boolean {
  return sender.id === extensionId && !!sender.url?.startsWith(extensionUrl);
}
