import { Resend } from "resend";
import { DailyBriefingEmail, type BriefingSignal } from "./templates/daily-briefing";
import { MissedSignalsEmail, type MissedSignal } from "./templates/missed-signals";

let cached: Resend | null = null;

function getResend(): Resend {
  if (cached) return cached;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not configured");
  cached = new Resend(apiKey);
  return cached;
}

const FROM = process.env.RESEND_FROM_EMAIL || "VANTAGE <onboarding@resend.dev>";

export interface SendDailyBriefingArgs {
  to: string;
  firstName: string;
  dayName: string;
  signals: BriefingSignal[];
  appUrl: string;
}

export async function sendDailyBriefingEmail({
  to,
  firstName,
  dayName,
  signals,
  appUrl,
}: SendDailyBriefingArgs): Promise<{ id: string | null }> {
  const resend = getResend();

  const { data, error } = await resend.emails.send({
    from: FROM,
    to,
    subject: `VANTAGE — what matters today, ${dayName}`,
    react: DailyBriefingEmail({
      firstName,
      dayName,
      signals,
      appUrl,
      logoUrl: `${appUrl}/logo.png`,
    }),
  });

  if (error) {
    throw new Error(error.message ?? "Resend send failed");
  }

  return { id: data?.id ?? null };
}

export interface SendMissedSignalsArgs {
  to: string;
  firstName: string;
  signals: MissedSignal[];
  appUrl: string;
}

export async function sendMissedSignalsEmail({
  to,
  firstName,
  signals,
  appUrl,
}: SendMissedSignalsArgs): Promise<{ id: string | null }> {
  const resend = getResend();

  const { data, error } = await resend.emails.send({
    from: FROM,
    to,
    subject: `You haven't reviewed ${signals.length} urgent signal${
      signals.length === 1 ? "" : "s"
    }`,
    react: MissedSignalsEmail({
      firstName,
      signals,
      appUrl,
      logoUrl: `${appUrl}/logo.png`,
    }),
  });

  if (error) {
    throw new Error(error.message ?? "Resend send failed");
  }

  return { id: data?.id ?? null };
}
