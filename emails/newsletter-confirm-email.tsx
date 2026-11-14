import { Button, Heading, Text } from "@react-email/components";
import { NewsletterLayout, styles } from "./newsletter-layout";

export const NEWSLETTER_CONFIRM_SUBJECT = "Confirm your Localley newsletter sign-up";

export default function NewsletterConfirmEmail({ confirmUrl }: { confirmUrl: string }) {
  return (
    <NewsletterLayout
      preview="One click to start the Localley newsletter."
      footerReason="You get this email because someone entered this address in the Localley newsletter form. If it was not you, ignore it: we send nothing more.">
      <Heading as="h1" style={styles.heading}>Confirm your sign-up</Heading>
      <Text style={styles.text}>
        Tap the button to get Localley&apos;s Asia picks: places locals rate, how to pay and get around, and what is
        worth your time, about twice a month.
      </Text>
      <Button href={confirmUrl} style={styles.button}>Confirm my sign-up</Button>
      <Text style={{ ...styles.muted, marginTop: "20px" }}>This link works for 24 hours.</Text>
    </NewsletterLayout>
  );
}
