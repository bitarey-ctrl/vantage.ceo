export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center px-4">
      {/* Wordmark */}
      <div className="mb-12 flex flex-col items-center gap-2">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-6 bg-[#1b7ff0]" />
          <span className="text-[#f5f5f5] text-sm font-mono font-medium tracking-[0.3em] uppercase">
            VANTAGE
          </span>
        </div>
        <span className="text-[#a0a0a0] text-xs tracking-[0.15em] uppercase font-mono">
          Strategic Intelligence
        </span>
      </div>

      {/* Content */}
      <div className="w-full max-w-sm">{children}</div>

      {/* Footer */}
      <p className="mt-12 text-[#a0a0a0] text-xs font-mono tracking-wider">
        SECURE ACCESS — ENCRYPTED CHANNEL
      </p>
    </div>
  );
}
