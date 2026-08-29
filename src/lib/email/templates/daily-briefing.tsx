import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
  Heading,
  Link,
  Img,
  Hr,
  Preview,
} from "@react-email/components";
import * as React from "react";
import type { SignalUrgency } from "@/types/database";

export interface BriefingSignal {
  id: string;
  title: string;
  urgency: SignalUrgency;
  /** 2-sentence consequence map — pulled from the signal's consequence.so_what */
  consequence: string;
}

export interface DailyBriefingEmailProps {
  firstName: string;
  dayName: string;
  signals: BriefingSignal[];
  appUrl: string;
  logoUrl: string;
}

const URGENCY_TAG: Record<
  SignalUrgency,
  { emoji: string; label: string; color: string }
> = {
  act_this_week: { emoji: "🔴", label: "ACT THIS WEEK", color: "#e0524f" },
  decide_this_month: { emoji: "🟡", label: "DECIDE THIS MONTH", color: "#e0a800" },
  watch: { emoji: "⚪", label: "WATCH", color: "#8a8a8a" },
};

// ─── Palette (dark by default — matches the VANTAGE brand) ──────────────────────
const BG = "#0a0a0a";
const SURFACE = "#111111";
const HAIRLINE = "#242424";
const TEXT = "#f5f5f5";
const MUTED = "#a0a0a0";
const FAINT = "#6a6a6a";
const ACCENT = "#1b7ff0";

export function DailyBriefingEmail({
  firstName,
  dayName,
  signals,
  appUrl,
  logoUrl,
}: DailyBriefingEmailProps) {
  const preview =
    signals.length > 0
      ? `${signals[0].title}`
      : "Your morning intelligence brief";

  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={body}>
        <Container style={container}>
          {/* Header */}
          <Section style={{ textAlign: "center", paddingBottom: "8px" }}>
            <Img
              src={logoUrl}
              width="48"
              height="48"
              alt="VANTAGE"
              style={{ borderRadius: "10px", margin: "0 auto" }}
            />
            <Text style={wordmark}>VANTAGE</Text>
          </Section>

          <Heading style={greeting}>Good morning, {firstName}</Heading>
          <Text style={subhead}>
            What matters today, {dayName} — your top {signals.length}{" "}
            {signals.length === 1 ? "signal" : "signals"} from the last 24 hours.
          </Text>

          <Hr style={divider} />

          {/* Signals */}
          {signals.map((signal, i) => {
            const tag = URGENCY_TAG[signal.urgency];
            return (
              <Section key={signal.id} style={card}>
                <Text style={{ ...tagStyle, color: tag.color }}>
                  {tag.emoji} {tag.label}
                </Text>
                <Heading as="h2" style={headline}>
                  {signal.title}
                </Heading>
                <Text style={consequence}>{signal.consequence}</Text>
                <Link
                  href={`${appUrl}/signals?focus=${signal.id}`}
                  style={openLink}
                >
                  Open in VANTAGE →
                </Link>
                {i < signals.length - 1 && <Hr style={cardDivider} />}
              </Section>
            );
          })}

          <Hr style={divider} />

          {/* Footer */}
          <Section style={{ textAlign: "center", paddingTop: "8px" }}>
            <Text style={footerText}>
              You're receiving this because daily briefings are on.
            </Text>
            <Link href={`${appUrl}/settings`} style={footerLink}>
              Manage notifications
            </Link>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export default DailyBriefingEmail;

// ─── Styles ─────────────────────────────────────────────────────────────────────

const body: React.CSSProperties = {
  backgroundColor: BG,
  color: TEXT,
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  margin: 0,
  padding: "24px 0",
};

const container: React.CSSProperties = {
  backgroundColor: BG,
  maxWidth: "560px",
  margin: "0 auto",
  padding: "0 24px",
};

const wordmark: React.CSSProperties = {
  color: TEXT,
  fontSize: "15px",
  fontWeight: 500,
  letterSpacing: "0.18em",
  textTransform: "uppercase",
  margin: "10px 0 0",
};

const greeting: React.CSSProperties = {
  color: TEXT,
  fontSize: "22px",
  fontWeight: 300,
  margin: "20px 0 6px",
  textAlign: "center",
};

const subhead: React.CSSProperties = {
  color: MUTED,
  fontSize: "13px",
  lineHeight: "20px",
  textAlign: "center",
  margin: "0 0 4px",
};

const divider: React.CSSProperties = {
  borderColor: HAIRLINE,
  borderTopWidth: "1px",
  margin: "20px 0",
};

const card: React.CSSProperties = {
  backgroundColor: SURFACE,
  border: `1px solid ${HAIRLINE}`,
  borderRadius: "12px",
  padding: "18px 20px",
  marginBottom: "14px",
};

const tagStyle: React.CSSProperties = {
  fontSize: "11px",
  fontWeight: 700,
  letterSpacing: "0.08em",
  margin: "0 0 8px",
};

const headline: React.CSSProperties = {
  color: TEXT,
  fontSize: "16px",
  fontWeight: 600,
  lineHeight: "22px",
  margin: "0 0 8px",
};

const consequence: React.CSSProperties = {
  color: MUTED,
  fontSize: "14px",
  lineHeight: "21px",
  margin: "0 0 12px",
};

const openLink: React.CSSProperties = {
  color: ACCENT,
  fontSize: "13px",
  fontWeight: 600,
  textDecoration: "none",
};

const cardDivider: React.CSSProperties = {
  borderColor: "transparent",
  margin: "0",
};

const footerText: React.CSSProperties = {
  color: FAINT,
  fontSize: "12px",
  margin: "0 0 6px",
};

const footerLink: React.CSSProperties = {
  color: MUTED,
  fontSize: "12px",
  textDecoration: "underline",
};
