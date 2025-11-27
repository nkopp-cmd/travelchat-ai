export interface ItineraryTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  emoji: string;
  days: number;
  pace: 'relaxed' | 'moderate' | 'active';
  focus: string[];
  activitiesPerDay: number;
  targetAudience: string;
  prompt: string;
  tags: string[];
  color: string;
}

export const templates: ItineraryTemplate[] = [
  {
    id: 'weekend-getaway',
    name: 'Weekend Getaway',
    description: 'Perfect for a relaxing 2-day escape with a leisurely pace',
    icon: '🌴',
    emoji: '🌴',
    days: 2,
    pace: 'relaxed',
    focus: ['Relaxation', 'Local Food', 'Easy Sightseeing'],
    activitiesPerDay: 3,
    targetAudience: 'Couples, Solo travelers seeking relaxation',
    prompt: `Create a relaxed weekend getaway itinerary with 3-4 activities per day. Focus on:
- Leisurely brunch spots and casual dining
- Easy-to-reach attractions that don't require much walking
- Relaxing activities like cafes, parks, or scenic viewpoints
- Avoiding crowds and tourist traps
- Leaving plenty of free time between activities
- Local favorites that feel authentic but aren't too adventurous`,
    tags: ['Relaxed', 'Weekend', 'Food', 'Leisure'],
    color: 'from-emerald-500 to-teal-500',
  },
  {
    id: 'week-adventure',
    name: 'Week-Long Adventure',
    description: 'Action-packed 7-day itinerary mixing culture, nature, and nightlife',
    icon: '🗺️',
    emoji: '🗺️',
    days: 7,
    pace: 'active',
    focus: ['Culture', 'Nature', 'Food', 'Nightlife', 'Shopping'],
    activitiesPerDay: 5,
    targetAudience: 'Active travelers, Groups, First-time visitors',
    prompt: `Create an active, comprehensive 7-day itinerary with 5-6 activities per day. Include:
- Mix of cultural sites, museums, and historical landmarks
- Nature experiences (parks, gardens, hiking, scenic spots)
- Diverse food experiences (street food, markets, fine dining)
- Evening entertainment and nightlife options
- Shopping districts and local markets
- Balance between must-see attractions and hidden gems
- Efficient routing to minimize travel time between activities`,
    tags: ['Active', 'Week-long', 'Comprehensive', 'Adventure'],
    color: 'from-orange-500 to-red-500',
  },
  {
    id: 'business-leisure',
    name: 'Business + Leisure',
    description: 'Efficient 3-day plan balancing work and exploration',
    icon: '💼',
    emoji: '💼',
    days: 3,
    pace: 'moderate',
    focus: ['Efficient Sightseeing', 'Quick Dining', 'Evening Entertainment'],
    activitiesPerDay: 3,
    targetAudience: 'Business travelers',
    prompt: `Create a business traveler-friendly itinerary for 3 days. Focus on:
- Activities concentrated in afternoons/evenings (assuming morning meetings)
- Spots near business districts and hotels
- Quick lunch options perfect for work breaks
- Quality dinner spots suitable for client meals or solo dining
- Evening entertainment that's easy to reach and enjoyable
- Efficient transportation options
- Activities that can be done in 1-2 hours`,
    tags: ['Business', 'Efficient', 'Evening', 'Professional'],
    color: 'from-blue-500 to-indigo-500',
  },
  {
    id: 'foodie-tour',
    name: 'Foodie Tour',
    description: 'Ultimate food-focused journey through local cuisine',
    icon: '🍜',
    emoji: '🍜',
    days: 4,
    pace: 'moderate',
    focus: ['Street Food', 'Markets', 'Restaurants', 'Cooking Classes'],
    activitiesPerDay: 5,
    targetAudience: 'Food enthusiasts, Culinary travelers',
    prompt: `Create a food-centric itinerary for 4 days. Emphasize:
- 80% food-related activities (restaurants, markets, street food)
- Breakfast, lunch, dinner, and snack recommendations
- Mix of high-end restaurants and authentic street food
- Food markets and night markets
- Cooking classes or food tours if available
- Neighborhoods known for specific cuisines
- Local specialties and must-try dishes
- Balance different cuisines and price points`,
    tags: ['Food', 'Culinary', 'Street Food', 'Markets'],
    color: 'from-amber-500 to-orange-500',
  },
  {
    id: 'cultural-deep-dive',
    name: 'Cultural Deep Dive',
    description: 'Immersive cultural experience focusing on history and traditions',
    icon: '🏛️',
    emoji: '🏛️',
    days: 5,
    pace: 'moderate',
    focus: ['Museums', 'Historical Sites', 'Traditional Experiences', 'Local Culture'],
    activitiesPerDay: 4,
    targetAudience: 'Culture enthusiasts, History buffs',
    prompt: `Create a culturally immersive 5-day itinerary. Focus on:
- Major museums and cultural institutions
- Historical landmarks and heritage sites
- Traditional neighborhoods and architecture
- Cultural experiences (tea ceremonies, workshops, performances)
- Local temples, shrines, or religious sites
- Art galleries and contemporary culture
- Cultural festivals or events (if applicable)
- Educational depth over entertainment
- Opportunities to learn about local traditions`,
    tags: ['Culture', 'History', 'Museums', 'Traditional'],
    color: 'from-purple-500 to-pink-500',
  },
  {
    id: 'family-friendly',
    name: 'Family Adventure',
    description: 'Fun-filled itinerary perfect for families with kids',
    icon: '👨‍👩‍👧‍👦',
    emoji: '👨‍👩‍👧‍👦',
    days: 4,
    pace: 'relaxed',
    focus: ['Kid-Friendly Activities', 'Parks', 'Interactive Museums', 'Family Dining'],
    activitiesPerDay: 3,
    targetAudience: 'Families with children',
    prompt: `Create a family-friendly 4-day itinerary. Include:
- Kid-friendly attractions (parks, playgrounds, interactive museums)
- Activities suitable for different age groups
- Restaurants with children's menus and casual atmospheres
- Rest breaks and downtime for tired kids
- Educational but fun experiences
- Safe neighborhoods and easy transportation
- Backup indoor options in case of bad weather
- Activities that adults will enjoy too
- Not too much walking or waiting in lines`,
    tags: ['Family', 'Kids', 'Interactive', 'Fun'],
    color: 'from-green-500 to-emerald-500',
  },
  {
    id: 'romantic-getaway',
    name: 'Romantic Getaway',
    description: 'Intimate experiences perfect for couples',
    icon: '❤️',
    emoji: '❤️',
    days: 3,
    pace: 'relaxed',
    focus: ['Romantic Dining', 'Scenic Views', 'Couples Activities', 'Atmosphere'],
    activitiesPerDay: 3,
    targetAudience: 'Couples, Honeymooners',
    prompt: `Create a romantic 3-day itinerary for couples. Emphasize:
- Romantic restaurants with ambiance (rooftop, waterfront, cozy)
- Scenic spots perfect for couples (sunsets, viewpoints, gardens)
- Intimate experiences (wine tasting, spa, couples activities)
- Quiet neighborhoods away from crowds
- Evening activities and nighttime experiences
- Beautiful photo opportunities
- Mix of upscale and charming local spots
- Leisurely pace with plenty of time together
- Special date-night worthy venues`,
    tags: ['Romantic', 'Couples', 'Intimate', 'Scenic'],
    color: 'from-rose-500 to-pink-500',
  },
  {
    id: 'local-authentic',
    name: 'Local\'s Guide',
    description: 'Off-the-beaten-path experiences like a local',
    icon: '🗝️',
    emoji: '🗝️',
    days: 5,
    pace: 'moderate',
    focus: ['Hidden Gems', 'Local Neighborhoods', 'Authentic Experiences'],
    activitiesPerDay: 4,
    targetAudience: 'Seasoned travelers, Repeat visitors',
    prompt: `Create an authentic local-focused 5-day itinerary. Prioritize:
- Hidden gems with high Localley scores (5-6)
- Neighborhoods where locals actually hang out
- No touristy or mainstream attractions
- Authentic food spots loved by residents
- Local markets, cafes, and shops
- Public transportation over taxis
- Community events or local gatherings
- Experiences that feel genuine, not staged for tourists
- Places where you might be the only foreigner`,
    tags: ['Local', 'Authentic', 'Hidden Gems', 'Off-beat'],
    color: 'from-violet-500 to-purple-500',
  },
];

export const getTemplateById = (id: string): ItineraryTemplate | undefined => {
  return templates.find((template) => template.id === id);
};

export const getTemplatesByPace = (pace: 'relaxed' | 'moderate' | 'active'): ItineraryTemplate[] => {
  return templates.filter((template) => template.pace === pace);
};

export const getTemplatesByDays = (days: number): ItineraryTemplate[] => {
  return templates.filter((template) => template.days === days);
};

export const getTemplatesByTag = (tag: string): ItineraryTemplate[] => {
  return templates.filter((template) => template.tags.includes(tag));
};
