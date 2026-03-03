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

interface SpotHighlight {
    name: string;
    city: string;
    category: string;
    localleyScore: number;
    description: string;
}

interface ItinerarySummary {
    title: string;
    city: string;
    days: number;
}

interface WeeklyDigestEmailProps {
    userName?: string;
    weekOf: string;
    stats: {
        itinerariesCreated: number;
        spotsDiscovered: number;
        xpEarned: number;
        currentLevel: string;
    };
    featuredSpots: SpotHighlight[];
    recentItineraries?: ItinerarySummary[];
    trendingCities?: string[];
    unsubscribeUrl?: string;
}

export function WeeklyDigestEmail({
    userName,
    weekOf,
    stats,
    featuredSpots,
    recentItineraries,
    trendingCities,
    unsubscribeUrl,
}: WeeklyDigestEmailProps) {
    const previewText = `Your Localley weekly digest for ${weekOf}`;

    const getScoreColor = (score: number) => {
        if (score >= 5) return "#059669"; // Emerald
        if (score >= 4) return "#7c3aed"; // Purple
        return "#6b7280"; // Gray
    };

    const getScoreLabel = (score: number) => {
        if (score === 6) return "Hidden Gem 💎";
        if (score === 5) return "Local Secret";
        if (score === 4) return "Off the Path";
        return "Worth a Visit";
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
                        <Text style={headerSubtitle}>Weekly Digest</Text>
                    </Section>

                    {/* Greeting */}
                    <Section style={content}>
                        <Heading style={h1}>
                            {userName ? `Hey ${userName}!` : "Hey Explorer!"} 👋
                        </Heading>
                        <Text style={paragraph}>
                            Here's your weekly roundup of discoveries, achievements, and
                            trending spots. Let's see what you've been up to!
                        </Text>
                    </Section>

                    {/* Stats Summary */}
                    <Section style={statsSection}>
                        <Text style={sectionTitle}>📊 Your Week in Numbers</Text>
                        <Section style={statsGrid}>
                            <Section style={statBox}>
                                <Text style={statValue}>{stats.itinerariesCreated}</Text>
                                <Text style={statLabel}>Itineraries</Text>
                            </Section>
                            <Section style={statBox}>
                                <Text style={statValue}>{stats.spotsDiscovered}</Text>
                                <Text style={statLabel}>Spots Found</Text>
                            </Section>
                            <Section style={statBox}>
                                <Text style={statValue}>+{stats.xpEarned}</Text>
                                <Text style={statLabel}>XP Earned</Text>
                            </Section>
                            <Section style={statBox}>
                                <Text style={statValue}>{stats.currentLevel}</Text>
                                <Text style={statLabel}>Current Level</Text>
                            </Section>
                        </Section>
                    </Section>

                    <Hr style={hr} />

                    {/* Featured Spots */}
                    {featuredSpots.length > 0 && (
                        <Section style={spotsSection}>
                            <Text style={sectionTitle}>💎 Featured Hidden Gems</Text>
                            <Text style={sectionSubtitle}>
                                Check out these local favorites discovered this week
                            </Text>

                            {featuredSpots.map((spot, index) => (
                                <Section key={index} style={spotCard}>
                                    <Section style={spotHeader}>
                                        <Text style={spotName}>{spot.name}</Text>
                                        <Text
                                            style={{
                                                ...spotScore,
                                                backgroundColor: getScoreColor(spot.localleyScore),
                                            }}
                                        >
                                            {spot.localleyScore}
                                        </Text>
                                    </Section>
                                    <Text style={spotMeta}>
                                        📍 {spot.city} • {spot.category}
                                    </Text>
                                    <Text style={spotLabel}>
                                        {getScoreLabel(spot.localleyScore)}
                                    </Text>
                                    <Text style={spotDescription}>{spot.description}</Text>
                                </Section>
                            ))}

                            <Button href="https://localley.io/spots" style={secondaryButton}>
                                Explore More Spots
                            </Button>
                        </Section>
                    )}

                    <Hr style={hr} />

                    {/* Recent Itineraries */}
                    {recentItineraries && recentItineraries.length > 0 && (
                        <Section style={itinerariesSection}>
                            <Text style={sectionTitle}>🗺️ Your Recent Itineraries</Text>
                            {recentItineraries.map((itinerary, index) => (
                                <Section key={index} style={itineraryItem}>
                                    <Text style={itineraryTitle}>{itinerary.title}</Text>
                                    <Text style={itineraryMeta}>
                                        {itinerary.city} • {itinerary.days} day{itinerary.days > 1 ? "s" : ""}
                                    </Text>
                                </Section>
                            ))}
                        </Section>
                    )}

                    {/* Trending Cities */}
                    {trendingCities && trendingCities.length > 0 && (
                        <Section style={trendingSection}>
                            <Text style={sectionTitle}>🔥 Trending Destinations</Text>
                            <Text style={trendingCitiesList}>
                                {trendingCities.join(" • ")}
                            </Text>
                        </Section>
                    )}

                    <Hr style={hr} />

                    {/* CTA */}
                    <Section style={ctaSection}>
                        <Text style={ctaText}>Ready for your next adventure?</Text>
                        <Button href="https://localley.io/dashboard" style={ctaButton}>
                            Plan a New Trip
                        </Button>
                    </Section>

                    {/* Footer */}
                    <Section style={footer}>
                        <Text style={footerText}>
                            Made with 💜 by Localley
                        </Text>
                        <Text style={footerLinks}>
                            <Link href="https://localley.io" style={footerLink}>Website</Link>
                            {" • "}
                            <Link href="https://localley.io/settings" style={footerLink}>Settings</Link>
                            {unsubscribeUrl && (
                                <>
                                    {" • "}
                                    <Link href={unsubscribeUrl} style={footerLink}>Unsubscribe</Link>
                                </>
                            )}
                        </Text>
                        <Text style={footerSubtext}>
                            Week of {weekOf}
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

const headerSubtitle = {
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
    fontSize: "15px",
    lineHeight: "24px",
    margin: "0",
};

const sectionTitle = {
    color: "#1f2937",
    fontSize: "18px",
    fontWeight: "bold",
    margin: "0 0 8px",
};

const sectionSubtitle = {
    color: "#6b7280",
    fontSize: "14px",
    margin: "0 0 20px",
};

const statsSection = {
    padding: "0 40px 32px",
};

const statsGrid = {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: "12px",
};

const statBox = {
    backgroundColor: "#f5f3ff",
    borderRadius: "8px",
    padding: "16px 8px",
    textAlign: "center" as const,
};

const statValue = {
    color: "#7c3aed",
    fontSize: "24px",
    fontWeight: "bold",
    margin: "0 0 4px",
};

const statLabel = {
    color: "#6b7280",
    fontSize: "11px",
    margin: "0",
};

const hr = {
    borderColor: "#e5e7eb",
    margin: "0",
};

const spotsSection = {
    padding: "32px 40px",
};

const spotCard = {
    backgroundColor: "#f9fafb",
    borderRadius: "12px",
    padding: "16px",
    marginBottom: "12px",
};

const spotHeader = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "4px",
};

const spotName = {
    color: "#1f2937",
    fontSize: "16px",
    fontWeight: "600",
    margin: "0",
};

const spotScore = {
    color: "#ffffff",
    fontSize: "12px",
    fontWeight: "bold",
    padding: "4px 8px",
    borderRadius: "4px",
};

const spotMeta = {
    color: "#6b7280",
    fontSize: "12px",
    margin: "0 0 4px",
};

const spotLabel = {
    color: "#7c3aed",
    fontSize: "11px",
    fontWeight: "500",
    margin: "0 0 8px",
};

const spotDescription = {
    color: "#4b5563",
    fontSize: "13px",
    lineHeight: "20px",
    margin: "0",
};

const secondaryButton = {
    backgroundColor: "#f5f3ff",
    borderRadius: "6px",
    color: "#7c3aed",
    display: "inline-block",
    fontSize: "14px",
    fontWeight: "600",
    padding: "10px 20px",
    textDecoration: "none",
    marginTop: "16px",
};

const itinerariesSection = {
    padding: "32px 40px",
};

const itineraryItem = {
    borderBottom: "1px solid #e5e7eb",
    paddingBottom: "12px",
    marginBottom: "12px",
};

const itineraryTitle = {
    color: "#1f2937",
    fontSize: "15px",
    fontWeight: "500",
    margin: "0 0 4px",
};

const itineraryMeta = {
    color: "#6b7280",
    fontSize: "13px",
    margin: "0",
};

const trendingSection = {
    padding: "24px 40px",
    backgroundColor: "#fef3c7",
};

const trendingCitiesList = {
    color: "#92400e",
    fontSize: "14px",
    fontWeight: "500",
    margin: "8px 0 0",
};

const ctaSection = {
    padding: "32px 40px",
    textAlign: "center" as const,
};

const ctaText = {
    color: "#4b5563",
    fontSize: "15px",
    margin: "0 0 16px",
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

const footerLinks = {
    margin: "0 0 8px",
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

export default WeeklyDigestEmail;
