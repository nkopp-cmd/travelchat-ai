import { templates } from "@/lib/templates";
import { TemplateCard } from "@/components/templates/template-card";
import { Button } from "@/components/ui/button";
import { Sparkles, ArrowLeft, Zap, Clock, Compass } from "lucide-react";
import Link from "next/link";
import { GlassCard } from "@/components/ui/glass-card";
import { GlowBadge } from "@/components/ui/glow-badge";
import { BentoGrid, BentoItem } from "@/components/ui/bento-grid";

export const metadata = {
    title: "Itinerary Templates - Localley",
    description: "Start your trip planning with our curated itinerary templates for every travel style",
};

export default function TemplatesPage() {
    const paceGroups = {
        relaxed: templates.filter((t) => t.pace === 'relaxed'),
        moderate: templates.filter((t) => t.pace === 'moderate'),
        active: templates.filter((t) => t.pace === 'active'),
    };

    // Get featured template (first one or could be marked as featured)
    const featuredTemplate = templates[0];
    const otherTemplates = templates.slice(1);

    return (
        <div className="min-h-screen">
            {/* Animated gradient background */}
            <div className="fixed inset-0 -z-10 overflow-hidden">
                <div className="absolute -top-1/2 -left-1/2 w-full h-full bg-gradient-radial from-violet-500/20 to-transparent rounded-full blur-3xl animate-blob" />
                <div className="absolute -top-1/2 -right-1/2 w-full h-full bg-gradient-radial from-indigo-500/20 to-transparent rounded-full blur-3xl animate-blob animation-delay-2000" />
                <div className="absolute -bottom-1/2 left-1/4 w-full h-full bg-gradient-radial from-purple-500/20 to-transparent rounded-full blur-3xl animate-blob animation-delay-4000" />
            </div>

            <div className="container mx-auto px-4 py-12 animate-in fade-in duration-500">
                {/* Back Button */}
                <Link
                    href="/dashboard"
                    className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors mb-6 group"
                >
                    <ArrowLeft className="mr-2 h-4 w-4 transition-transform group-hover:-translate-x-1" />
                    Back to Dashboard
                </Link>

                {/* Hero Header */}
                <div className="text-center mb-16 space-y-6">
                    <div className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-violet-500/20 to-indigo-500/20 backdrop-blur-sm rounded-full text-violet-300 text-sm font-medium border border-violet-500/30">
                        <Sparkles className="h-4 w-4" />
                        Start with a Template
                    </div>

                    <h1 className="text-5xl md:text-6xl font-bold bg-gradient-to-r from-violet-400 via-purple-400 to-indigo-400 bg-clip-text text-transparent">
                        Itinerary Templates
                    </h1>

                    <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
                        Jump-start your trip planning with our curated templates designed for every travel style
                    </p>

                    <div className="flex flex-wrap gap-3 justify-center pt-4">
                        <GlowBadge variant="default">
                            {templates.length} Templates
                        </GlowBadge>
                        <GlowBadge variant="info">
                            AI-Powered
                        </GlowBadge>
                        <GlowBadge variant="success">
                            Fully Customizable
                        </GlowBadge>
                    </div>
                </div>

                {/* Featured Template + Other Templates Bento Grid */}
                <div className="mb-16">
                    <div className="flex items-center gap-3 mb-8">
                        <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/25">
                            <Compass className="h-6 w-6 text-white" />
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold">All Templates</h2>
                            <p className="text-sm text-muted-foreground">Choose your perfect starting point</p>
                        </div>
                    </div>

                    <BentoGrid columns={3}>
                        {/* Featured Template - Large Card */}
                        <BentoItem colSpan={2} rowSpan={2}>
                            <div className="h-full group">
                                <Link href={`/dashboard?template=${featuredTemplate.id}`}>
                                    <GlassCard
                                        variant="glow"
                                        hover={true}
                                        className="h-full relative overflow-hidden min-h-[400px]"
                                    >
                                        {/* Gradient background instead of image */}
                                        <div
                                            className={`absolute inset-0 bg-gradient-to-br ${featuredTemplate.color} transition-transform duration-500 group-hover:scale-110`}
                                        />
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />

                                        {/* Featured Badge */}
                                        <div className="absolute top-4 left-4">
                                            <GlowBadge variant="gold">Featured</GlowBadge>
                                        </div>

                                        {/* Content */}
                                        <div className="absolute bottom-0 left-0 right-0 p-6 md:p-8">
                                            <div className="flex items-center gap-2 mb-3">
                                                <span className="text-2xl">{featuredTemplate.icon}</span>
                                                <span className="text-sm text-violet-300 font-medium uppercase tracking-wider">
                                                    {featuredTemplate.pace} pace
                                                </span>
                                            </div>
                                            <h3 className="text-3xl md:text-4xl font-bold text-white mb-3">
                                                {featuredTemplate.name}
                                            </h3>
                                            <p className="text-gray-300 text-lg mb-4 line-clamp-2">
                                                {featuredTemplate.description}
                                            </p>
                                            <div className="flex flex-wrap gap-2">
                                                {featuredTemplate.tags.slice(0, 4).map((tag) => (
                                                    <span
                                                        key={tag}
                                                        className="px-3 py-1 rounded-full text-xs font-medium bg-white/10 backdrop-blur-sm text-white border border-white/20"
                                                    >
                                                        {tag}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    </GlassCard>
                                </Link>
                            </div>
                        </BentoItem>

                        {/* Other Templates */}
                        {otherTemplates.slice(0, 4).map((template, index) => (
                            <BentoItem key={template.id}>
                                <div
                                    className="h-full animate-in fade-in slide-in-from-right-4"
                                    style={{ animationDelay: `${(index + 1) * 100}ms`, animationFillMode: "both" }}
                                >
                                    <TemplateCard template={template} />
                                </div>
                            </BentoItem>
                        ))}
                    </BentoGrid>

                    {/* Remaining templates in standard grid */}
                    {otherTemplates.length > 4 && (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
                            {otherTemplates.slice(4).map((template, index) => (
                                <div
                                    key={template.id}
                                    className="animate-in fade-in slide-in-from-bottom-4"
                                    style={{ animationDelay: `${(index + 5) * 50}ms`, animationFillMode: "both" }}
                                >
                                    <TemplateCard template={template} />
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* By Pace Section */}
                <div className="space-y-16">
                    {/* Relaxed Pace */}
                    {paceGroups.relaxed.length > 0 && (
                        <PaceSection
                            title="Relaxed Pace"
                            emoji="🌊"
                            description="Take it easy with leisurely itineraries perfect for unwinding"
                            gradientFrom="from-emerald-500"
                            gradientTo="to-teal-500"
                            icon={Clock}
                            templates={paceGroups.relaxed}
                        />
                    )}

                    {/* Moderate Pace */}
                    {paceGroups.moderate.length > 0 && (
                        <PaceSection
                            title="Moderate Pace"
                            emoji="🚶"
                            description="Balanced itineraries with a mix of activities and downtime"
                            gradientFrom="from-blue-500"
                            gradientTo="to-indigo-500"
                            icon={Compass}
                            templates={paceGroups.moderate}
                        />
                    )}

                    {/* Active Pace */}
                    {paceGroups.active.length > 0 && (
                        <PaceSection
                            title="Active Pace"
                            emoji="⚡"
                            description="Packed itineraries for travelers who want to see and do it all"
                            gradientFrom="from-orange-500"
                            gradientTo="to-red-500"
                            icon={Zap}
                            templates={paceGroups.active}
                        />
                    )}
                </div>

                {/* Custom Option CTA */}
                <div className="mt-20">
                    <GlassCard variant="glow" hover={false} className="text-center p-8 md:p-12">
                        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 mb-6 shadow-lg shadow-violet-500/25">
                            <Sparkles className="h-8 w-8 text-white" />
                        </div>
                        <h3 className="text-3xl font-bold mb-3">
                            Don&apos;t see what you&apos;re looking for?
                        </h3>
                        <p className="text-muted-foreground mb-8 max-w-md mx-auto">
                            Create a fully custom itinerary from scratch with Alley AI. Just describe your perfect trip and let AI do the rest.
                        </p>
                        <Link href="/dashboard">
                            <Button
                                size="lg"
                                className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 shadow-lg shadow-violet-500/25 text-lg px-8"
                            >
                                <Sparkles className="mr-2 h-5 w-5" />
                                Create Custom Itinerary
                            </Button>
                        </Link>
                    </GlassCard>
                </div>
            </div>
        </div>
    );
}

// Pace Section Component
function PaceSection({
    title,
    emoji,
    description,
    gradientFrom,
    gradientTo,
    icon: Icon,
    templates,
}: {
    title: string;
    emoji: string;
    description: string;
    gradientFrom: string;
    gradientTo: string;
    icon: React.ElementType;
    templates: typeof import("@/lib/templates").templates;
}) {
    return (
        <div>
            <div className="flex items-center gap-4 mb-6">
                <div className={`h-12 w-12 rounded-xl bg-gradient-to-br ${gradientFrom} ${gradientTo} flex items-center justify-center shadow-lg`}>
                    <Icon className="h-6 w-6 text-white" />
                </div>
                <div>
                    <h2 className="text-2xl font-bold flex items-center gap-2">
                        {title} {emoji}
                    </h2>
                    <p className="text-sm text-muted-foreground">{description}</p>
                </div>
            </div>

            <div className={`h-1 w-24 bg-gradient-to-r ${gradientFrom} ${gradientTo} rounded-full mb-6 opacity-50`} />

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {templates.map((template, index) => (
                    <div
                        key={template.id}
                        className="animate-in fade-in slide-in-from-bottom-4"
                        style={{ animationDelay: `${index * 100}ms`, animationFillMode: "both" }}
                    >
                        <TemplateCard template={template} />
                    </div>
                ))}
            </div>
        </div>
    );
}
