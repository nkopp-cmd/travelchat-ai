import type { ReactNode } from "react";
import { Body, Container, Head, Hr, Html, Link, Preview, Section, Text } from "@react-email/components";

// Localley design tokens (docs/DESIGN.md): dark ink background, raised surface, violet action.
export const tokens = {
  background: "#0d0f16",
  surface: "#181b26",
  raised: "#242838",
  text: "#f4f4fa",
  muted: "#afb6cc",
  brand: "#7c3aed",
  action: "#b9a1ff",
  actionText: "#21133b",
};

export const SITE = "https://www.localley.io";
export const CONTACT = "nkopp@my-goodlife.com";

const font = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export const styles = {
  heading: { color: tokens.text, fontSize: "24px", lineHeight: "30px", fontWeight: 700, margin: "0 0 12px" },
  text: { color: tokens.text, fontSize: "16px", lineHeight: "25px", margin: "0 0 16px" },
  muted: { color: tokens.muted, fontSize: "14px", lineHeight: "21px", margin: "0 0 12px" },
  button: {
    display: "inline-block", backgroundColor: tokens.action, color: tokens.actionText, fontSize: "16px",
    fontWeight: 700, padding: "14px 22px", borderRadius: "12px", textDecoration: "none",
  },
  link: { color: tokens.action, textDecoration: "underline" },
};

/**
 * One frame for every newsletter mail: wordmark, content, legal footer. `unsubscribeUrl` is required for issues and
 * absent for the transactional confirmation (the address is not on the list yet).
 */
export function NewsletterLayout({ preview, children, footerReason, unsubscribeUrl }: {
  preview: string;
  children: ReactNode;
  footerReason: string;
  unsubscribeUrl?: string;
}) {
  return (
    <Html lang="en">
      <Head>
        <meta name="color-scheme" content="dark" />
        <meta name="supported-color-schemes" content="dark" />
      </Head>
      <Preview>{preview}</Preview>
      <Body style={{ backgroundColor: tokens.background, fontFamily: font, margin: 0, padding: "24px 12px" }}>
        <Container style={{ maxWidth: "560px", margin: "0 auto" }}>
          <Text style={{ color: tokens.action, fontSize: "20px", fontWeight: 800, letterSpacing: "-0.01em", margin: "0 0 16px 4px" }}>
            Localley
          </Text>
          <Section style={{ backgroundColor: tokens.surface, borderRadius: "20px", padding: "28px 24px" }}>
            {children}
          </Section>
          <Section style={{ padding: "20px 8px 0" }}>
            <Text style={{ ...styles.muted, fontSize: "12px", lineHeight: "18px" }}>{footerReason}</Text>
            <Text style={{ ...styles.muted, fontSize: "12px", lineHeight: "18px" }}>
              {unsubscribeUrl ? (
                <>
                  <Link href={unsubscribeUrl} style={styles.link}>Unsubscribe</Link>
                  {" · "}
                </>
              ) : null}
              <Link href={`${SITE}/privacy`} style={styles.link}>Privacy</Link>
              {" · "}
              <Link href={`${SITE}/terms`} style={styles.link}>Terms</Link>
              {" · "}
              <Link href={SITE} style={styles.link}>localley.io</Link>
            </Text>
            <Hr style={{ borderColor: tokens.raised, margin: "12px 0" }} />
            <Text style={{ ...styles.muted, fontSize: "12px", lineHeight: "18px" }}>
              Localley · localley.io · Contact: {CONTACT}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
