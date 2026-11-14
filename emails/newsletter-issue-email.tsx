import { Button, Heading, Hr, Link, Section, Text } from "@react-email/components";
import { NewsletterLayout, styles, tokens } from "./newsletter-layout";

export interface NewsletterPick {
  city: string;
  title: string;
  body: string;
  url: string;
  linkLabel: string;
}

export interface NewsletterIssue {
  subject: string;
  preview: string;
  title: string;
  intro: string;
  picks: NewsletterPick[];
  cta: { label: string; url: string };
}

export default function NewsletterIssueEmail({ issue, unsubscribeUrl }: { issue: NewsletterIssue; unsubscribeUrl: string }) {
  return (
    <NewsletterLayout
      preview={issue.preview}
      unsubscribeUrl={unsubscribeUrl}
      footerReason="You get this email because you signed up for the Localley newsletter and confirmed your address.">
      <Heading as="h1" style={styles.heading}>{issue.title}</Heading>
      <Text style={styles.text}>{issue.intro}</Text>
      {issue.picks.map((pick, index) => (
        <Section key={pick.url} style={{ marginTop: index === 0 ? "8px" : "0" }}>
          <Hr style={{ borderColor: tokens.raised, margin: "16px 0" }} />
          <Text style={{ ...styles.muted, fontSize: "12px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", margin: "0 0 4px" }}>
            {pick.city}
          </Text>
          <Text style={{ ...styles.text, fontSize: "18px", fontWeight: 700, margin: "0 0 6px" }}>{pick.title}</Text>
          <Text style={{ ...styles.text, color: tokens.muted, margin: "0 0 8px" }}>{pick.body}</Text>
          <Link href={pick.url} style={{ ...styles.link, fontWeight: 600 }}>{pick.linkLabel}</Link>
        </Section>
      ))}
      <Hr style={{ borderColor: tokens.raised, margin: "20px 0" }} />
      <Button href={issue.cta.url} style={styles.button}>{issue.cta.label}</Button>
    </NewsletterLayout>
  );
}
