import {
    Body,
    Button,
    Container,
    Head,
    Heading,
    Hr,
    Html,
    Img,
    Link,
    Preview,
    Section,
    Text,
} from "@react-email/components";

interface WelcomeEmailProps {
    userName?: string;
    verifyUrl?: string;
}

export function WelcomeEmail({ userName, verifyUrl }: WelcomeEmailProps) {
    const previewText = `Welcome to Localley - Your gateway to local travel experiences`;

    return (
        <Html>
            <Head />
            <Preview>{previewText}</Preview>
            <Body style={main}>
                <Container style={container}>
                    {/* Header */}
                    <Section style={header}>
                        <Heading style={logo}>Localley</Heading>
                        <Text style={tagline}>Discover Hidden Gems. Travel Like a Local.</Text>
                    </Section>

                    {/* Hero Section */}
                    <Section style={heroSection}>
                        <Heading style={h1}>
                            Welcome{userName ? `, ${userName}` : ""}! 🎉
                        </Heading>
                        <Text style={heroParagraph}>
                            You've just joined a community of travelers who prefer authentic
                            experiences over tourist traps. We're excited to help you discover
                            the hidden gems that locals love.
                        </Text>
                    </Section>

                    <Hr style={hr} />

                    {/* What You Can Do */}
                    <Section style={featuresSection}>
                        <Heading style={h2}>Here's what you can do:</Heading>

                        <Section style={featureItem}>
                            <Text style={featureIcon}>🗺️</Text>
                            <div>
                                <Text style={featureTitle}>Create AI Itineraries</Text>
                                <Text style={featureDescription}>
                                    Tell us where you're going and let our AI craft the perfect
                                    local-approved itinerary just for you.
                                </Text>
                            </div>
                        </Section>

                        <Section style={featureItem}>
                            <Text style={featureIcon}>💎</Text>
                            <div>
                                <Text style={featureTitle}>Discover Hidden Gems</Text>
                                <Text style={featureDescription}>
                                    Browse spots rated by locals with our unique Localley Score
                                    system - find places tourists never see.
                                </Text>
                            </div>
                        </Section>

                        <Section style={featureItem}>
                            <Text style={featureIcon}>🎯</Text>
                            <div>
                                <Text style={featureTitle}>Earn Rewards</Text>
                                <Text style={featureDescription}>
                                    Level up from Tourist to Local Legend by exploring spots,
                                    creating itineraries, and sharing your discoveries.
                                </Text>
                            </div>
                        </Section>

                        <Section style={featureItem}>
                            <Text style={featureIcon}>📱</Text>
                            <div>
                                <Text style={featureTitle}>Book Experiences</Text>
                                <Text style={featureDescription}>
                                    Book tours and activities directly from your itinerary with
                                    our trusted partners.
                                </Text>
                            </div>
                        </Section>
                    </Section>

                    <Hr style={hr} />

                    {/* CTA */}
                    <Section style={ctaSection}>
                        <Text style={ctaText}>Ready to start exploring?</Text>
                        <Button href={verifyUrl || "https://localley.app/dashboard"} style={ctaButton}>
                            Create Your First Itinerary
                        </Button>
                    </Section>

                    {/* Pro Tip */}
                    <Section style={proTipSection}>
                        <Text style={proTipLabel}>💡 Pro Tip</Text>
                        <Text style={proTipText}>
                            Start by telling our AI assistant about your travel style. The more
                            details you share, the better your personalized recommendations will be!
                        </Text>
                    </Section>

                    {/* Footer */}
                    <Section style={footer}>
                        <Text style={footerText}>
                            Made with 💜 by Localley
                        </Text>
                        <Text style={footerLinks}>
                            <Link href="https://localley.app" style={footerLink}>Website</Link>
                            {" • "}
                            <Link href="https://localley.app/spots" style={footerLink}>Browse Spots</Link>
                            {" • "}
                            <Link href="https://localley.app/templates" style={footerLink}>Itinerary Templates</Link>
                        </Text>
                        <Text style={footerSubtext}>
                            You're receiving this because you signed up for Localley.
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
    padding: "40px",
    backgroundColor: "#7c3aed",
    textAlign: "center" as const,
};

const logo = {
    color: "#ffffff",
    fontSize: "36px",
    fontWeight: "bold",
    margin: "0",
};

const tagline = {
    color: "#c4b5fd",
    fontSize: "14px",
    margin: "8px 0 0",
};

const heroSection = {
    padding: "40px",
    textAlign: "center" as const,
};

const h1 = {
    color: "#1f2937",
    fontSize: "28px",
    fontWeight: "bold",
    margin: "0 0 16px",
};

const h2 = {
    color: "#1f2937",
    fontSize: "20px",
    fontWeight: "bold",
    margin: "0 0 24px",
};

const heroParagraph = {
    color: "#4b5563",
    fontSize: "16px",
    lineHeight: "26px",
    margin: "0",
};

const hr = {
    borderColor: "#e5e7eb",
    margin: "0",
};

const featuresSection = {
    padding: "40px",
};

const featureItem = {
    display: "flex",
    marginBottom: "24px",
};

const featureIcon = {
    fontSize: "24px",
    marginRight: "16px",
    marginTop: "0",
};

const featureTitle = {
    color: "#1f2937",
    fontSize: "16px",
    fontWeight: "600",
    margin: "0 0 4px",
};

const featureDescription = {
    color: "#6b7280",
    fontSize: "14px",
    lineHeight: "22px",
    margin: "0",
};

const ctaSection = {
    padding: "40px",
    textAlign: "center" as const,
    backgroundColor: "#f5f3ff",
};

const ctaText = {
    color: "#4b5563",
    fontSize: "16px",
    margin: "0 0 20px",
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

const proTipSection = {
    padding: "24px 40px",
    backgroundColor: "#fef3c7",
    margin: "0",
};

const proTipLabel = {
    color: "#92400e",
    fontSize: "12px",
    fontWeight: "bold",
    textTransform: "uppercase" as const,
    margin: "0 0 8px",
};

const proTipText = {
    color: "#78350f",
    fontSize: "14px",
    lineHeight: "22px",
    margin: "0",
};

const footer = {
    padding: "32px 40px",
    backgroundColor: "#f9fafb",
    textAlign: "center" as const,
};

const footerText = {
    color: "#6b7280",
    fontSize: "14px",
    margin: "0 0 12px",
};

const footerLinks = {
    margin: "0 0 12px",
};

const footerLink = {
    color: "#7c3aed",
    fontSize: "12px",
    textDecoration: "none",
};

const footerSubtext = {
    color: "#9ca3af",
    fontSize: "11px",
    margin: "0",
};

export default WelcomeEmail;
