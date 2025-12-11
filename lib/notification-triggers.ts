import { createAndSendNotification } from "./web-push";
import { getRankTitle } from "./gamification";

// ============== Achievement Notifications ==============

export async function notifyAchievementUnlocked(
    clerkUserId: string,
    achievementName: string,
    achievementDescription: string,
    xpReward: number
) {
    return createAndSendNotification({
        clerkUserId,
        type: "achievement",
        title: `🏆 Achievement Unlocked: ${achievementName}`,
        message: `${achievementDescription} (+${xpReward} XP)`,
        data: {
            achievementName,
            xpReward,
        },
    });
}

// ============== Level Up Notifications ==============

export async function notifyLevelUp(
    clerkUserId: string,
    newLevel: number,
    totalXp: number
) {
    const newTitle = getRankTitle(newLevel);

    return createAndSendNotification({
        clerkUserId,
        type: "level_up",
        title: `⬆️ Level Up! You're now Level ${newLevel}`,
        message: `Congratulations! You've reached "${newTitle}" status. Keep exploring!`,
        data: {
            level: newLevel,
            title: newTitle,
            totalXp,
        },
    });
}

// ============== Spot Notifications ==============

export async function notifyNewSpotInArea(
    clerkUserId: string,
    spotName: string,
    spotId: string,
    category: string,
    city: string
) {
    return createAndSendNotification({
        clerkUserId,
        type: "new_spot",
        title: `📍 New ${category} in ${city}`,
        message: `Check out "${spotName}" - a new hidden gem has been discovered!`,
        data: {
            spotId,
            spotName,
            category,
            city,
        },
    });
}

// ============== Itinerary Notifications ==============

export async function notifyItineraryShared(
    clerkUserId: string,
    sharerName: string,
    itineraryTitle: string,
    itineraryId: string,
    shareCode: string
) {
    return createAndSendNotification({
        clerkUserId,
        type: "itinerary_shared",
        title: `📤 ${sharerName} shared an itinerary with you`,
        message: `"${itineraryTitle}" - tap to explore this travel plan`,
        data: {
            itineraryId,
            shareCode,
            sharerName,
            url: `/shared/${shareCode}`,
        },
    });
}

export async function notifyItineraryLiked(
    clerkUserId: string,
    likerName: string,
    itineraryTitle: string,
    itineraryId: string
) {
    return createAndSendNotification({
        clerkUserId,
        type: "itinerary_liked",
        title: `❤️ ${likerName} liked your itinerary`,
        message: `Your "${itineraryTitle}" itinerary is getting love!`,
        data: {
            itineraryId,
            likerName,
        },
    });
}

// ============== Review Notifications ==============

export async function notifyReviewHelpful(
    clerkUserId: string,
    spotName: string,
    spotId: string,
    helpfulCount: number
) {
    return createAndSendNotification({
        clerkUserId,
        type: "review_helpful",
        title: `👍 Your review is helping others`,
        message: `${helpfulCount} people found your review of "${spotName}" helpful!`,
        data: {
            spotId,
            spotName,
            helpfulCount,
        },
    });
}

// ============== Friend Notifications ==============

export async function notifyFriendRequest(
    clerkUserId: string,
    senderName: string,
    senderAvatar: string | null,
    senderId: string
) {
    return createAndSendNotification({
        clerkUserId,
        type: "friend_request",
        title: `👋 ${senderName} wants to connect`,
        message: "Tap to view their profile and accept their friend request",
        data: {
            userId: senderId,
            userName: senderName,
            userAvatar: senderAvatar,
        },
    });
}

export async function notifyFriendAccepted(
    clerkUserId: string,
    friendName: string,
    friendId: string
) {
    return createAndSendNotification({
        clerkUserId,
        type: "friend_accepted",
        title: `🤝 ${friendName} accepted your friend request`,
        message: "You're now connected! Start sharing itineraries and spots.",
        data: {
            userId: friendId,
            userName: friendName,
        },
    });
}

// ============== Challenge Notifications ==============

export async function notifyChallengeStart(
    clerkUserId: string,
    challengeName: string,
    challengeId: string,
    xpReward: number,
    description: string
) {
    return createAndSendNotification({
        clerkUserId,
        type: "challenge_start",
        title: `🎯 New Challenge: ${challengeName}`,
        message: `${description} - Earn ${xpReward} XP!`,
        data: {
            challengeId,
            challengeName,
            xpReward,
        },
    });
}

export async function notifyChallengeEnding(
    clerkUserId: string,
    challengeName: string,
    challengeId: string,
    hoursRemaining: number
) {
    return createAndSendNotification({
        clerkUserId,
        type: "challenge_ending",
        title: `⏰ Challenge ending soon!`,
        message: `"${challengeName}" ends in ${hoursRemaining} hours. Complete it before time runs out!`,
        data: {
            challengeId,
            challengeName,
            hoursRemaining,
        },
    });
}

// ============== System Notifications ==============

export async function notifySystemAnnouncement(
    clerkUserId: string,
    title: string,
    message: string,
    url?: string
) {
    return createAndSendNotification({
        clerkUserId,
        type: "system",
        title: `📢 ${title}`,
        message,
        data: url ? { url } : undefined,
    });
}

// ============== Weekly Digest ==============

export async function notifyWeeklyDigest(
    clerkUserId: string,
    stats: {
        spotsVisited: number;
        itinerariesCreated: number;
        xpEarned: number;
        newAchievements: number;
    }
) {
    const highlights: string[] = [];

    if (stats.spotsVisited > 0) {
        highlights.push(`${stats.spotsVisited} spots visited`);
    }
    if (stats.itinerariesCreated > 0) {
        highlights.push(`${stats.itinerariesCreated} itineraries created`);
    }
    if (stats.xpEarned > 0) {
        highlights.push(`${stats.xpEarned} XP earned`);
    }
    if (stats.newAchievements > 0) {
        highlights.push(`${stats.newAchievements} achievements unlocked`);
    }

    const message = highlights.length > 0
        ? `This week: ${highlights.join(", ")}`
        : "Start exploring to see your stats!";

    return createAndSendNotification({
        clerkUserId,
        type: "weekly_digest",
        title: `📊 Your Weekly Localley Recap`,
        message,
        data: stats,
    });
}
