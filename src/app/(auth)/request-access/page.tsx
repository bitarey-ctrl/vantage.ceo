import Link from "next/link";
import { RequestAccessForm } from "@/components/auth/RequestAccessForm";

/*
 * /request-access — a contact route, not a gate.
 *
 * Signup is open, so nobody needs to be here to get in. This exists for
 * people who want to reach out before creating an account. Linked from the
 * bottom of /login.
 */
export default function RequestAccessPage() {
  return (
    <div>
      <div className="mb-8 flex flex-col items-center text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="VANTAGE" className="h-20 w-20 object-contain mb-5 rounded-2xl" />
        <h1 className="text-[#f5f5f5] text-2xl font-light tracking-tight mb-2">Get in touch</h1>
        <p className="text-[#a0a0a0] text-sm font-mono leading-relaxed">
          Tell us what you&apos;re working on and we&apos;ll come back to you.
        </p>
      </div>

      <div className="h-px bg-[#242424] mb-8" />

      <RequestAccessForm source="login_link" />

      <div className="mt-8 pt-6 border-t border-[#242424]">
        <p className="text-[#a0a0a0] text-xs font-mono text-center">
          Ready to start now?{" "}
          <Link
            href="/signup"
            className="text-[#1b7ff0] hover:text-[#4a9ff5] transition-colors duration-150"
          >
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}
