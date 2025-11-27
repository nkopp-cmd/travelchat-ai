"use client";

import { useState, useEffect } from 'react';
import { ActivityCard, ActivityCardSkeleton } from '@/components/viator/activity-card';
import { ViatorActivity } from '@/types/viator';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Search, Sparkles } from 'lucide-react';

const CITIES = ['Seoul', 'Tokyo', 'Bangkok', 'Singapore'];
const CATEGORIES = ['All', 'Food & Drink', 'Cultural Tours', 'Nightlife'];

export default function TestViatorPage() {
    const [activities, setActivities] = useState<ViatorActivity[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedCity, setSelectedCity] = useState('Seoul');
    const [selectedCategory, setSelectedCategory] = useState('All');

    const fetchActivities = async () => {
        setLoading(true);
        try {
            const response = await fetch('/api/viator/search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    destination: selectedCity,
                    category: selectedCategory === 'All' ? undefined : selectedCategory,
                }),
            });

            const data = await response.json();
            if (data.success) {
                setActivities(data.data.activities);
            }
        } catch (error) {
            console.error('Error fetching activities:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchActivities();
    }, [selectedCity, selectedCategory]);

    return (
        <div className="min-h-screen bg-gradient-to-b from-violet-50 to-white dark:from-gray-900 dark:to-gray-950">
            <div className="container mx-auto px-4 py-12">
                {/* Header */}
                <div className="text-center mb-12">
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 text-sm font-medium mb-4">
                        <Sparkles className="h-4 w-4" />
                        Viator Integration Test
                    </div>
                    <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">
                        Discover Amazing Activities
                    </h1>
                    <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                        Testing Viator integration with mock data. Real activities will appear once API credentials are added.
                    </p>
                </div>

                {/* Filters */}
                <div className="max-w-4xl mx-auto mb-8">
                    <div className="flex flex-col md:flex-row gap-4 p-6 rounded-2xl border border-border/40 bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm">
                        <div className="flex-1">
                            <label className="text-sm font-medium mb-2 block">City</label>
                            <Select value={selectedCity} onValueChange={setSelectedCity}>
                                <SelectTrigger className="h-12">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {CITIES.map(city => (
                                        <SelectItem key={city} value={city}>{city}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="flex-1">
                            <label className="text-sm font-medium mb-2 block">Category</label>
                            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                                <SelectTrigger className="h-12">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {CATEGORIES.map(category => (
                                        <SelectItem key={category} value={category}>{category}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="flex items-end">
                            <Button
                                onClick={fetchActivities}
                                className="h-12 px-6 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700"
                            >
                                <Search className="mr-2 h-4 w-4" />
                                Search
                            </Button>
                        </div>
                    </div>
                </div>

                {/* Results Count */}
                {!loading && activities.length > 0 && (
                    <div className="max-w-4xl mx-auto mb-6">
                        <p className="text-sm text-muted-foreground">
                            Found <span className="font-semibold text-foreground">{activities.length}</span> activities in {selectedCity}
                            {selectedCategory !== 'All' && ` • ${selectedCategory}`}
                        </p>
                    </div>
                )}

                {/* Activities Grid */}
                <div className="max-w-6xl mx-auto">
                    {loading ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {[...Array(6)].map((_, i) => (
                                <ActivityCardSkeleton key={i} />
                            ))}
                        </div>
                    ) : activities.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {activities.map(activity => (
                                <ActivityCard
                                    key={activity.id}
                                    activity={activity}
                                    onViewDetails={(activity) => {
                                        console.log('View details:', activity);
                                        alert(`Details for: ${activity.title}\n\nThis will open a modal in production.`);
                                    }}
                                />
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-16">
                            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-violet-100 dark:bg-violet-900/20 mb-4">
                                <Search className="h-8 w-8 text-violet-600" />
                            </div>
                            <h3 className="text-xl font-semibold mb-2">No activities found</h3>
                            <p className="text-muted-foreground">
                                Try selecting a different city or category
                            </p>
                        </div>
                    )}
                </div>

                {/* Info Banner */}
                <div className="max-w-4xl mx-auto mt-12 p-6 rounded-2xl bg-gradient-to-r from-violet-50 to-indigo-50 dark:from-violet-950/20 dark:to-indigo-950/20 border border-violet-200/50 dark:border-violet-800/50">
                    <h3 className="font-semibold text-lg mb-2 flex items-center gap-2">
                        <Sparkles className="h-5 w-5 text-violet-600" />
                        Using Mock Data
                    </h3>
                    <p className="text-sm text-muted-foreground mb-3">
                        This page is currently displaying mock Viator activities for testing purposes.
                        Once your Viator API credentials are approved and added to <code className="px-2 py-1 rounded bg-violet-100 dark:bg-violet-900/30">.env.local</code>,
                        real activities will automatically appear.
                    </p>
                    <div className="flex flex-wrap gap-2 text-xs">
                        <span className="px-3 py-1 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                            ✓ Database schema ready
                        </span>
                        <span className="px-3 py-1 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                            ✓ API client working
                        </span>
                        <span className="px-3 py-1 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                            ✓ UI components ready
                        </span>
                        <span className="px-3 py-1 rounded-full bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300">
                            ⏳ Waiting for API approval
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}
