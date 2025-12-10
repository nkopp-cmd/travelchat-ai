"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@clerk/nextjs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Star, ThumbsUp, Loader2, Calendar, Pencil, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { ReviewForm } from "./review-form";

interface Review {
    id: string;
    rating: number;
    comment: string | null;
    visit_date: string | null;
    helpful_count: number;
    created_at: string;
    clerk_user_id: string;
    user: {
        name: string | null;
        avatar_url: string | null;
    } | null;
    user_voted?: boolean;
}

interface ReviewListProps {
    spotId: string;
}

export function ReviewList({ spotId }: ReviewListProps) {
    const { userId } = useAuth();
    const { toast } = useToast();
    const [reviews, setReviews] = useState<Review[]>([]);
    const [loading, setLoading] = useState(true);
    const [sortBy, setSortBy] = useState("recent");
    const [total, setTotal] = useState(0);
    const [averageRating, setAverageRating] = useState(0);
    const [ratingDistribution, setRatingDistribution] = useState([0, 0, 0, 0, 0]);
    const [editingReview, setEditingReview] = useState<Review | null>(null);
    const [deleteId, setDeleteId] = useState<string | null>(null);
    const [votingId, setVotingId] = useState<string | null>(null);

    const fetchReviews = useCallback(async () => {
        setLoading(true);
        try {
            const response = await fetch(`/api/spots/${spotId}/reviews?sort=${sortBy}`);
            if (response.ok) {
                const data = await response.json();
                setReviews(data.reviews);
                setTotal(data.total);
                setAverageRating(data.averageRating);
                setRatingDistribution(data.ratingDistribution);
            }
        } catch (error) {
            console.error("Error fetching reviews:", error);
        } finally {
            setLoading(false);
        }
    }, [spotId, sortBy]);

    useEffect(() => {
        fetchReviews();
    }, [fetchReviews]);

    const handleVote = async (reviewId: string, currentlyVoted: boolean) => {
        if (!userId) {
            toast({
                title: "Sign in required",
                description: "Please sign in to mark reviews as helpful",
                variant: "destructive",
            });
            return;
        }

        setVotingId(reviewId);
        try {
            const response = await fetch(
                `/api/spots/${spotId}/reviews/${reviewId}/helpful`,
                { method: currentlyVoted ? "DELETE" : "POST" }
            );

            if (response.ok) {
                const data = await response.json();
                setReviews((prev) =>
                    prev.map((r) =>
                        r.id === reviewId
                            ? { ...r, helpful_count: data.helpful_count, user_voted: data.voted }
                            : r
                    )
                );
            } else {
                const error = await response.json();
                toast({
                    title: "Error",
                    description: error.error || "Failed to vote",
                    variant: "destructive",
                });
            }
        } catch {
            toast({
                title: "Error",
                description: "Something went wrong",
                variant: "destructive",
            });
        } finally {
            setVotingId(null);
        }
    };

    const handleDelete = async () => {
        if (!deleteId) return;

        try {
            const response = await fetch(`/api/spots/${spotId}/reviews/${deleteId}`, {
                method: "DELETE",
            });

            if (response.ok) {
                toast({ title: "Review deleted" });
                fetchReviews();
            } else {
                toast({
                    title: "Error",
                    description: "Failed to delete review",
                    variant: "destructive",
                });
            }
        } catch {
            toast({
                title: "Error",
                description: "Something went wrong",
                variant: "destructive",
            });
        } finally {
            setDeleteId(null);
        }
    };

    const userReview = reviews.find((r) => r.clerk_user_id === userId);

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
        });
    };

    const StarRating = ({ rating }: { rating: number }) => (
        <div className="flex items-center gap-0.5">
            {[1, 2, 3, 4, 5].map((star) => (
                <Star
                    key={star}
                    className={cn(
                        "h-4 w-4",
                        star <= rating
                            ? "fill-yellow-400 text-yellow-400"
                            : "text-gray-300"
                    )}
                />
            ))}
        </div>
    );

    return (
        <div className="space-y-6">
            {/* Rating Summary */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                        <span>Reviews ({total})</span>
                        {total > 0 && (
                            <div className="flex items-center gap-2">
                                <Star className="h-5 w-5 fill-yellow-400 text-yellow-400" />
                                <span className="text-2xl font-bold">{averageRating}</span>
                                <span className="text-muted-foreground text-sm">/5</span>
                            </div>
                        )}
                    </CardTitle>
                </CardHeader>
                {total > 0 && (
                    <CardContent>
                        <div className="space-y-2">
                            {[5, 4, 3, 2, 1].map((star) => {
                                const count = ratingDistribution[star - 1] || 0;
                                const percentage = total > 0 ? (count / total) * 100 : 0;
                                return (
                                    <div key={star} className="flex items-center gap-3">
                                        <span className="text-sm w-4">{star}</span>
                                        <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                                        <Progress value={percentage} className="flex-1 h-2" />
                                        <span className="text-sm text-muted-foreground w-8 text-right">
                                            {count}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </CardContent>
                )}
            </Card>

            {/* Review Form or Edit Form */}
            {editingReview ? (
                <div>
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="font-semibold">Edit Your Review</h3>
                        <Button variant="ghost" size="sm" onClick={() => setEditingReview(null)}>
                            Cancel
                        </Button>
                    </div>
                    <ReviewForm
                        spotId={spotId}
                        existingReview={editingReview}
                        onSuccess={() => {
                            setEditingReview(null);
                            fetchReviews();
                        }}
                    />
                </div>
            ) : !userReview ? (
                <ReviewForm spotId={spotId} onSuccess={fetchReviews} />
            ) : null}

            {/* Sort & Filter */}
            {total > 0 && (
                <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                        {total} {total === 1 ? "review" : "reviews"}
                    </p>
                    <Select value={sortBy} onValueChange={setSortBy}>
                        <SelectTrigger className="w-[160px]">
                            <SelectValue placeholder="Sort by" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="recent">Most Recent</SelectItem>
                            <SelectItem value="helpful">Most Helpful</SelectItem>
                            <SelectItem value="highest">Highest Rated</SelectItem>
                            <SelectItem value="lowest">Lowest Rated</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            )}

            {/* Reviews List */}
            {loading ? (
                <div className="flex justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
            ) : reviews.length > 0 ? (
                <div className="space-y-4">
                    {reviews.map((review) => {
                        const isOwnReview = review.clerk_user_id === userId;
                        const displayName = review.user?.name || "Anonymous";
                        const initials = displayName.slice(0, 2).toUpperCase();

                        return (
                            <Card key={review.id} className={cn(
                                "transition-colors",
                                isOwnReview && "border-violet-200 dark:border-violet-800"
                            )}>
                                <CardContent className="pt-6">
                                    <div className="flex items-start gap-4">
                                        <Avatar className="h-10 w-10">
                                            <AvatarImage src={review.user?.avatar_url || undefined} />
                                            <AvatarFallback>{initials}</AvatarFallback>
                                        </Avatar>

                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between mb-2">
                                                <div>
                                                    <p className="font-medium">{displayName}</p>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <StarRating rating={review.rating} />
                                                        <span className="text-xs text-muted-foreground">
                                                            {formatDate(review.created_at)}
                                                        </span>
                                                    </div>
                                                </div>
                                                {isOwnReview && (
                                                    <div className="flex items-center gap-1">
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-8 w-8"
                                                            onClick={() => setEditingReview(review)}
                                                        >
                                                            <Pencil className="h-4 w-4" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-8 w-8 text-destructive hover:text-destructive"
                                                            onClick={() => setDeleteId(review.id)}
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    </div>
                                                )}
                                            </div>

                                            {review.visit_date && (
                                                <p className="text-xs text-muted-foreground flex items-center gap-1 mb-2">
                                                    <Calendar className="h-3 w-3" />
                                                    Visited {formatDate(review.visit_date)}
                                                </p>
                                            )}

                                            {review.comment && (
                                                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                                                    {review.comment}
                                                </p>
                                            )}

                                            {!isOwnReview && (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className={cn(
                                                        "mt-3 -ml-2",
                                                        review.user_voted && "text-violet-600"
                                                    )}
                                                    onClick={() => handleVote(review.id, !!review.user_voted)}
                                                    disabled={votingId === review.id}
                                                >
                                                    {votingId === review.id ? (
                                                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                                    ) : (
                                                        <ThumbsUp className={cn(
                                                            "h-4 w-4 mr-1",
                                                            review.user_voted && "fill-current"
                                                        )} />
                                                    )}
                                                    Helpful ({review.helpful_count})
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            ) : (
                <Card>
                    <CardContent className="py-12 text-center">
                        <Star className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
                        <h3 className="font-semibold mb-2">No reviews yet</h3>
                        <p className="text-muted-foreground text-sm">
                            Be the first to share your experience!
                        </p>
                    </CardContent>
                </Card>
            )}

            {/* Delete Confirmation */}
            <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Review?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This action cannot be undone. Your review will be permanently deleted.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDelete}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
