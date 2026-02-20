import {
    Body,
    Container,
    Head,
    Heading,
    Html,
    Link,
    Preview,
    Section,
    Text,
} from "@react-email/components";

interface StoryReadyEmailProps {
    city: string;
    itineraryUrl: string;
    recipientName?: string;
}

export function StoryReadyEmail({
    city,
    itineraryUrl,
    recipientName,
}: StoryReadyEmailProps) {
    const previewText = `Your ${city} story slides are ready to download!`;

    return (
        <Html>
            <Head />
            <Preview>{previewText}</Preview>
            <Body style={main}>
                <Container style={container}>
                    {/* Header */}
                    <Section style={header}>
                        <Heading style={logo}>Localley</Heading>
                        <Text style={tagline}>Your Local Guide to Hidden Gems</Text>
                    </Section>

                    {/* Content */}
                    <Section style={content}>
                        <Heading style={h1}>
                            {recipientName ? `Hey ${recipientName}!` : "Hey Explorer!"}
                        </Heading>
                        <Text style={paragraph}>
                            Your story slides for <strong>{city}</strong> are ready!
                            We've generated beautiful AI backgrounds for each day of your
                            trip. Head over to download and share them directly.
                        </Text>
                    </Section>

                    {/* CTA */}
                    <Section style={ctaSection}>
                        <Link href={itineraryUrl} style={ctaButton}>
                            Download Your Story Slides
                        </Link>
                    </Section>

                    <Section style={tipSection}>
                        <Text style={tipText}>
                            Share your stories on Instagram, TikTok, or any social platform
                            to inspire others with your {city} adventure!
                        </Text>
                    </Section>

                    {/* Footer */}
                    <Section style={footer}>
                        <Text style={footerText}>
                            Made with 💜 by Localley
                        </Text>
                        <Text style={footerSubtext}>
                            Discover hidden gems. Explore like a local.
                        </Text>
                        <Link href="https://localley.io" style={footerLink}>
                            localley.io
                        </Link>
                    </Section>
                </Container>
            </Body>
        </Html>
    );
}

// Styles (matching existing email branding)
const main = {
    backgroundColor: "#f6f9fc",
    fontFamily:
        '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Ubuntu, sans-serif',
};

const container = {
    backgroundColor: "#ffffff",
    margin: "0 auto",
    padding: "20px 0 48px",
    marginBottom: "64px",
    maxWidth: "600px",
};

const header = {
    padding: "32px 40px",
    backgroundColor: "#7c3aed",
    textAlign: "center" as const,
};

const logo = {
    color: "#ffffff",
    fontSize: "32px",
    fontWeight: "bold",
    margin: "0",
};

const tagline = {
    color: "#c4b5fd",
    fontSize: "14px",
    margin: "8px 0 0",
};

const content = {
    padding: "32px 40px",
};

const h1 = {
    color: "#1f2937",
    fontSize: "24px",
    fontWeight: "bold",
    margin: "0 0 16px",
};

const paragraph = {
    color: "#4b5563",
    fontSize: "16px",
    lineHeight: "26px",
    margin: "0",
};

const ctaSection = {
    padding: "16px 40px 32px",
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

const tipSection = {
    padding: "0 40px 24px",
};

const tipText = {
    color: "#6b7280",
    fontSize: "14px",
    lineHeight: "22px",
    textAlign: "center" as const,
};

const footer = {
    padding: "24px 40px",
    backgroundColor: "#f9fafb",
    textAlign: "center" as const,
};

const footerText = {
    color: "#6b7280",
    fontSize: "14px",
    margin: "0 0 4px",
};

const footerSubtext = {
    color: "#9ca3af",
    fontSize: "12px",
    margin: "0 0 8px",
};

const footerLink = {
    color: "#7c3aed",
    fontSize: "12px",
    textDecoration: "none",
};
