import {
    Body,
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

interface Activity {
    title: string;
    description: string;
    time?: string;
    type: "hidden-gem" | "local-favorite" | "mixed";
}

interface DayPlan {
    day: string;
    activities: Activity[];
    localTip?: string;
}

interface ItineraryEmailProps {
    itineraryTitle: string;
    city: string;
    days: DayPlan[];
    recipientName?: string;
    shareUrl?: string;
    highlights?: string[];
}

export function ItineraryEmail({
    itineraryTitle,
    city,
    days,
    recipientName,
    shareUrl,
    highlights,
}: ItineraryEmailProps) {
    const previewText = `Your ${city} itinerary from Localley`;

    const getTypeEmoji = (type: string) => {
        switch (type) {
            case "hidden-gem":
                return "💎";
            case "local-favorite":
                return "⭐";
            case "mixed":
                return "🌟";
            default:
                return "📍";
        }
    };

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

                    {/* Greeting */}
                    <Section style={content}>
                        <Heading style={h1}>
                            {recipientName ? `Hey ${recipientName}!` : "Hey Explorer!"}
                        </Heading>
                        <Text style={paragraph}>
                            Your personalized {city} adventure is ready! Here's your
                            itinerary packed with local favorites and hidden gems.
                        </Text>
                    </Section>

                    {/* Itinerary Title */}
                    <Section style={itineraryHeader}>
                        <Heading style={h2}>{itineraryTitle}</Heading>
                        <Text style={cityBadge}>📍 {city}</Text>
                    </Section>

                    {/* Highlights */}
                    {highlights && highlights.length > 0 && (
                        <Section style={highlightsSection}>
                            <Text style={sectionTitle}>✨ Trip Highlights</Text>
                            {highlights.map((highlight, index) => (
                                <Text key={index} style={highlightItem}>
                                    • {highlight}
                                </Text>
                            ))}
                        </Section>
                    )}

                    <Hr style={hr} />

                    {/* Days */}
                    {days.map((day, dayIndex) => (
                        <Section key={dayIndex} style={daySection}>
                            <Heading style={dayTitle}>{day.day}</Heading>

                            {day.activities.map((activity, actIndex) => (
                                <Section key={actIndex} style={activityCard}>
                                    <Text style={activityHeader}>
                                        {getTypeEmoji(activity.type)} {activity.title}
                                    </Text>
                                    {activity.time && (
                                        <Text style={activityTime}>🕐 {activity.time}</Text>
                                    )}
                                    <Text style={activityDescription}>
                                        {activity.description}
                                    </Text>
                                </Section>
                            ))}

                            {day.localTip && (
                                <Section style={localTipBox}>
                                    <Text style={localTipText}>
                                        💡 Local Tip: {day.localTip}
                                    </Text>
                                </Section>
                            )}
                        </Section>
                    ))}

                    <Hr style={hr} />

                    {/* CTA */}
                    {shareUrl && (
                        <Section style={ctaSection}>
                            <Link href={shareUrl} style={ctaButton}>
                                View Full Itinerary Online
                            </Link>
                        </Section>
                    )}

                    {/* Footer */}
                    <Section style={footer}>
                        <Text style={footerText}>
                            Made with 💜 by Localley
                        </Text>
                        <Text style={footerSubtext}>
                            Discover hidden gems. Explore like a local.
                        </Text>
                        <Link href="https://localley.app" style={footerLink}>
                            localley.app
                        </Link>
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

const h2 = {
    color: "#7c3aed",
    fontSize: "22px",
    fontWeight: "bold",
    margin: "0 0 8px",
};

const paragraph = {
    color: "#4b5563",
    fontSize: "16px",
    lineHeight: "26px",
    margin: "0",
};

const itineraryHeader = {
    padding: "24px 40px",
    backgroundColor: "#f5f3ff",
    borderLeft: "4px solid #7c3aed",
};

const cityBadge = {
    color: "#6b7280",
    fontSize: "14px",
    margin: "0",
};

const highlightsSection = {
    padding: "24px 40px",
};

const sectionTitle = {
    color: "#1f2937",
    fontSize: "16px",
    fontWeight: "bold",
    margin: "0 0 12px",
};

const highlightItem = {
    color: "#4b5563",
    fontSize: "14px",
    margin: "4px 0",
};

const hr = {
    borderColor: "#e5e7eb",
    margin: "0",
};

const daySection = {
    padding: "24px 40px",
};

const dayTitle = {
    color: "#7c3aed",
    fontSize: "18px",
    fontWeight: "bold",
    margin: "0 0 16px",
    paddingBottom: "8px",
    borderBottom: "2px solid #e5e7eb",
};

const activityCard = {
    backgroundColor: "#f9fafb",
    borderRadius: "8px",
    padding: "16px",
    marginBottom: "12px",
};

const activityHeader = {
    color: "#1f2937",
    fontSize: "15px",
    fontWeight: "600",
    margin: "0 0 4px",
};

const activityTime = {
    color: "#6b7280",
    fontSize: "12px",
    margin: "0 0 8px",
};

const activityDescription = {
    color: "#4b5563",
    fontSize: "14px",
    lineHeight: "22px",
    margin: "0",
};

const localTipBox = {
    backgroundColor: "#fef3c7",
    borderRadius: "8px",
    padding: "12px 16px",
    marginTop: "8px",
};

const localTipText = {
    color: "#92400e",
    fontSize: "13px",
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
    padding: "14px 28px",
    textDecoration: "none",
};

const footer = {
    padding: "32px 40px",
    backgroundColor: "#f9fafb",
    textAlign: "center" as const,
};

const footerText = {
    color: "#6b7280",
    fontSize: "14px",
    margin: "0 0 8px",
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

export default ItineraryEmail;
