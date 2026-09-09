/*
 * Auth shell.
 *
 * Brought in line with the dashboard: the same ground colour, the real logo
 * mark rather than a coloured bar, and the brand red — these pages were the
 * last thing still using the old blue accent, which made signing in feel like
 * a different product from the one it leads into.
 *
 * Deliberately minimal: mark, then the form. The old "SECURE ACCESS —
 * ENCRYPTED CHANNEL" footer was decoration that said nothing true.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#090a0b] flex flex-col items-center justify-center px-4 py-12">
      <div className="mb-10 flex flex-col items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo-transparent.png"
          alt=""
          className="h-9 w-9 object-contain"
        />
        <span
          className="text-[22px] font-medium tracking-[-0.5px] text-[#e8eaee]"
          style={{ fontFamily: "var(--font-inter), system-ui, sans-serif" }}
        >
          Vantage
        </span>
      </div>

      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
