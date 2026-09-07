/**
 * Landing-page destinations.
 *
 * appUrl points at the live signup route. It is INTERNAL, so the landing page
 * opens it in the same tab — `target="_blank"` on your own app is wrong.
 *
 * bookingUrl is intentionally empty until a real Calendly/Google Calendar link
 * exists. While empty, the "Book a meeting" CTA opens a placeholder dialog
 * rather than a fabricated destination. External links open in a new tab.
 */
export const siteConfig = {
  bookingUrl: '', // BOOK_A_MEETING_URL — external, opens in a new tab once set
  appUrl: '/signup',
} as const;

/** Internal routes are same-tab; anything with a scheme is external. */
export function isExternalUrl(url: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith('//');
}
