import {
    Body,
    Button,
    Container,
    Head,
    Heading,
    Hr,
    Html,
    Link,
    Preview,
    Section,
    Text,
} from "@react-email/components";

type SubscriptionEventType =
    | "upgrade"
    | "downgrade"
    | "cancelled"
    | "renewed"
    | "trial_ending"
    | "payment_failed";

interface SubscriptionEmailProps {
    userName?: string;
    eventType: SubscriptionEventType;
    oldTier?: string;
    newTier?: string;
    trialEndDate?: string;
    nextBillingDate?: string;
    amount?: string;
    manageUrl?: string;
}

const eventConfig: Record<SubscriptionEventType, {
    subject: string;
    emoji: string;
    title: string;
    message: (props: SubscriptionEmailProps) => string;
    ctaText: string;
    ctaUrl: (props: SubscriptionEmailProps) => string;
}> = {
    upgrade: {
        subject: "Welcome to {tier}! 🎉",
        emoji: "🚀",
        title: "You've Upgraded!",
        message: (props) =>
            `Congratulations! You're now on the ${props.newTier} plan. Get ready to unlock even more local discoveries and premium features.`,
        ctaText: "Explore Your New Features",
        ctaUrl: () => "https://localley.io/dashboard",
    },
    downgrade: {
        subject: "Your plan has been changed",
        emoji: "📝",
        title: "Plan Updated",
        message: (props) =>
            `Your subscription has been changed from ${props.oldTier} to ${props.newTier}. This change will take effect at the end of your current billing period.`,
        ctaText: "View Plan Details",
        ctaUrl: (props) => props.manageUrl || "https://localley.io/settings",
    },
    cancelled: {
        subject: "We're sad to see you go 😢",
        emoji: "👋",
        title: "Subscription Cancelled",
        message: () =>
            "Your subscription has been cancelled. You'll still have access to your premium features until the end of your current billing period. We hope to see you again soon!",
        ctaText: "Reactivate Subscription",
        ctaUrl: () => "https://localley.io/pricing",
    },
    renewed: {
        subject: "Your subscription has been renewed ✨",
        emoji: "✨",
        title: "Subscription Renewed",
        message: (props) =>
            `Your ${props.newTier} subscription has been renewed successfully. Thank you for being part of the Localley community!`,
        ctaText: "Continue Exploring",
        ctaUrl: () => "https://localley.io/dashboard",
    },
    trial_ending: {
        subject: "Your trial ends soon ⏰",
        emoji: "⏰",
        title: "Trial Ending Soon",
        message: (props) =>
            `Your free trial ends on ${props.trialEndDate}. Upgrade now to keep all your premium features and continue discovering hidden gems.`,
        ctaText: "Upgrade Now",
        ctaUrl: () => "https://localley.io/pricing",
    },
    payment_failed: {
        subject: "Payment failed - Action required",
        emoji: "⚠️",
        title: "Payment Failed",
        message: () =>
            "We couldn't process your payment. Please update your payment method to keep your subscription active.",
        ctaText: "Update Payment Method",
        ctaUrl: (props) => props.manageUrl || "https://localley.io/settings",
    },
};

export function SubscriptionEmail(props: SubscriptionEmailProps) {
    const { userName, eventType, newTier, nextBillingDate, amount } = props;
    const config = eventConfig[eventType];

    const previewText = config.subject.replace("{tier}", newTier || "Pro");

    return (
        <Html>
            <Head />
            <Preview>{previewText}</Preview>
            <Body style={main}>
                <Container style={container}>
                    {/* Header */}
                    <Section style={header}>
                        <Heading style={logo}>Localley</Heading>
                    </Section>

                    {/* Main Content */}
                    <Section style={content}>
                        <Text style={emoji}>{config.emoji}</Text>
                        <Heading style={h1}>{config.title}</Heading>
                        <Text style={greeting}>
                            {userName ? `Hi ${userName},` : "Hi there,"}
                        </Text>
                        <Text style={paragraph}>
                            {config.message(props)}
                        </Text>
                    </Section>

                    {/* Plan Details Box */}
                    {(eventType === "upgrade" || eventType === "renewed") && newTier && (
                        <Section style={planBox}>
                            <Text style={planLabel}>Your Plan</Text>
                            <Heading style={planTitle}>{newTier}</Heading>
                            {amount && (
                                <Text style={planPrice}>{amount}/month</Text>
                            )}
                            {nextBillingDate && (
                                <Text style={planBilling}>
                                    Next billing: {nextBillingDate}
                                </Text>
                            )}
                        </Section>
                    )}

                    {/* Features for upgrades */}
                    {eventType === "upgrade" && (
                        <Section style={featuresSection}>
                            <Text style={featuresTitle}>What's included:</Text>
                            {newTier === "Pro" ? (
                                <>
                                    <Text style={featureItem}>✓ Unlimited itineraries</Text>
                                    <Text style={featureItem}>✓ Full spot addresses</Text>
                                    <Text style={featureItem}>✓ Priority AI responses</Text>
                                    <Text style={featureItem}>✓ Export to PDF & email</Text>
                                    <Text style={featureItem}>✓ 50 chat messages/day</Text>
                                </>
                            ) : newTier === "Premium" ? (
                                <>
                                    <Text style={featureItem}>✓ Everything in Pro</Text>
                                    <Text style={featureItem}>✓ AI image generation</Text>
                                    <Text style={featureItem}>✓ Unlimited saved spots</Text>
                                    <Text style={featureItem}>✓ Unlimited chat messages</Text>
                                    <Text style={featureItem}>✓ Early access to new features</Text>
                                </>
                            ) : null}
                        </Section>
                    )}

                    <Hr style={hr} />

                    {/* CTA */}
                    <Section style={ctaSection}>
                        <Button href={config.ctaUrl(props)} style={ctaButton}>
                            {config.ctaText}
                        </Button>
                    </Section>

                    {/* Help Section */}
                    <Section style={helpSection}>
                        <Text style={helpText}>
                            Questions about your subscription?{" "}
                            <Link href="mailto:support@localley.io" style={helpLink}>
                                Contact us
                            </Link>
                        </Text>
                    </Section>

                    {/* Footer */}
                    <Section style={footer}>
                        <Text style={footerText}>
                            Made with 💜 by Localley
                        </Text>
                        <Text style={footerSubtext}>
                            <Link href="https://localley.io/settings" style={footerLink}>
                                Manage subscription
                            </Link>
                            {" • "}
                            <Link href="https://localley.io" style={footerLink}>
                                localley.io
                            </Link>
                        </Text>
                    </Section>
                </Container>
            </Body>
        </Html>
    );
}

// Styles
const main = {
    backgroundColor: "#f6f9fc",
    fontFamily:
        '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Ubuntu, sans-serif',
};

const container = {
    backgroundColor: "#ffffff",
    margin: "0 auto",
    padding: "0",
    marginBottom: "64px",
    maxWidth: "600px",
    borderRadius: "8px",
    overflow: "hidden",
};

const header = {
    padding: "24px 40px",
    backgroundColor: "#7c3aed",
    textAlign: "center" as const,
};

const logo = {
    color: "#ffffff",
    fontSize: "28px",
    fontWeight: "bold",
    margin: "0",
};

const content = {
    padding: "40px",
    textAlign: "center" as const,
};

const emoji = {
    fontSize: "48px",
    margin: "0 0 16px",
};

const h1 = {
    color: "#1f2937",
    fontSize: "24px",
    fontWeight: "bold",
    margin: "0 0 24px",
};

const greeting = {
    color: "#6b7280",
    fontSize: "16px",
    margin: "0 0 8px",
};

const paragraph = {
    color: "#4b5563",
    fontSize: "16px",
    lineHeight: "26px",
    margin: "0",
    textAlign: "left" as const,
};

const planBox = {
    backgroundColor: "#f5f3ff",
    borderRadius: "12px",
    padding: "24px",
    margin: "0 40px 24px",
    textAlign: "center" as const,
};

const planLabel = {
    color: "#7c3aed",
    fontSize: "12px",
    fontWeight: "bold",
    textTransform: "uppercase" as const,
    margin: "0 0 8px",
};

const planTitle = {
    color: "#1f2937",
    fontSize: "28px",
    fontWeight: "bold",
    margin: "0 0 4px",
};

const planPrice = {
    color: "#6b7280",
    fontSize: "18px",
    margin: "0 0 8px",
};

const planBilling = {
    color: "#9ca3af",
    fontSize: "13px",
    margin: "0",
};

const featuresSection = {
    padding: "0 40px 24px",
};

const featuresTitle = {
    color: "#1f2937",
    fontSize: "14px",
    fontWeight: "bold",
    margin: "0 0 12px",
};

const featureItem = {
    color: "#4b5563",
    fontSize: "14px",
    margin: "0 0 8px",
};

const hr = {
    borderColor: "#e5e7eb",
    margin: "0",
};

const ctaSection = {
    padding: "32px 40px",
    textAlign: "center" as const,
};

const ctaButton = {
    backgroundColor: "#7c3aed",
    borderRadius: "8px",
    color: "#ffffff",
    display: "inline-block",
    fontSize: "16px",
    fontWeight: "bold",
    padding: "14px 32px",
    textDecoration: "none",
};

const helpSection = {
    padding: "0 40px 24px",
    textAlign: "center" as const,
};

const helpText = {
    color: "#9ca3af",
    fontSize: "13px",
    margin: "0",
};

const helpLink = {
    color: "#7c3aed",
    textDecoration: "none",
};

const footer = {
    padding: "24px 40px",
    backgroundColor: "#f9fafb",
    textAlign: "center" as const,
};

const footerText = {
    color: "#6b7280",
    fontSize: "14px",
    margin: "0 0 8px",
};

const footerSubtext = {
    margin: "0",
};

const footerLink = {
    color: "#7c3aed",
    fontSize: "12px",
    textDecoration: "none",
};

export default SubscriptionEmail;
