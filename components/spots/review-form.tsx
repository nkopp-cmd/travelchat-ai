"use client";

import { useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Star, Loader2, Calendar } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface ReviewFormProps {
    spotId: string;
    onSuccess?: () => void;
    existingReview?: {
        id: string;
        rating: number;
        comment: string | null;
        visit_date: string | null;
    };
}

export function ReviewForm({ spotId, onSuccess, existingReview }: ReviewFormProps) {
    const { isSignedIn } = useAuth();
    const { toast } = useToast();
    const [rating, setRating] = useState(existingReview?.rating || 0);
    const [hoveredRating, setHoveredRating] = useState(0);
    const [comment, setComment] = useState(existingReview?.comment || "");
    const [visitDate, setVisitDate] = useState(existingReview?.visit_date || "");
    const [loading, setLoading] = useState(false);

    const isEditing = !!existingReview;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!isSignedIn) {
            toast({
                title: "Sign in required",
                description: "Please sign in to leave a review",
                variant: "destructive",
            });
            return;
        }

        if (rating === 0) {
            toast({
                title: "Rating required",
                description: "Please select a star rating",
                variant: "destructive",
            });
            return;
        }

        setLoading(true);

        try {
            const url = isEditing
                ? `/api/spots/${spotId}/reviews/${existingReview.id}`
                : `/api/spots/${spotId}/reviews`;

            const response = await fetch(url, {
                method: isEditing ? "PUT" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    rating,
                    comment: comment.trim() || null,
                    visitDate: visitDate || null,
                }),
            });

            if (response.ok) {
                toast({
                    title: isEditing ? "Review updated!" : "Review submitted!",
                    description: "Thanks for sharing your experience",
                });
                if (!isEditing) {
                    setRating(0);
                    setComment("");
                    setVisitDate("");
                }
                onSuccess?.();
            } else {
                const error = await response.json();
                toast({
                    title: "Error",
                    description: error.error || "Failed to submit review",
                    variant: "destructive",
                });
            }
        } catch {
            toast({
                title: "Error",
                description: "Something went wrong. Please try again.",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    const displayRating = hoveredRating || rating;

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-lg">
                    {isEditing ? "Edit Your Review" : "Write a Review"}
                </CardTitle>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Star Rating */}
                    <div className="space-y-2">
                        <Label>Your Rating</Label>
                        <div className="flex items-center gap-1">
                            {[1, 2, 3, 4, 5].map((star) => (
                                <button
                                    key={star}
                                    type="button"
                                    onClick={() => setRating(star)}
                                    onMouseEnter={() => setHoveredRating(star)}
                                    onMouseLeave={() => setHoveredRating(0)}
                                    className="p-1 transition-transform hover:scale-110 focus:outline-none"
                                    disabled={loading}
                                >
                                    <Star
                                        className={cn(
                                            "h-8 w-8 transition-colors",
                                            star <= displayRating
                                                ? "fill-yellow-400 text-yellow-400"
                                                : "text-gray-300"
                                        )}
                                    />
                                </button>
                            ))}
                            {displayRating > 0 && (
                                <span className="ml-2 text-sm text-muted-foreground">
                                    {displayRating === 1 && "Poor"}
                                    {displayRating === 2 && "Fair"}
                                    {displayRating === 3 && "Good"}
                                    {displayRating === 4 && "Very Good"}
                                    {displayRating === 5 && "Excellent"}
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Comment */}
                    <div className="space-y-2">
                        <Label htmlFor="comment">Your Review (optional)</Label>
                        <Textarea
                            id="comment"
                            placeholder="Share your experience... What made this spot special? Any tips for visitors?"
                            value={comment}
                            onChange={(e) => setComment(e.target.value)}
                            maxLength={1000}
                            rows={4}
                            disabled={loading}
                        />
                        <p className="text-xs text-muted-foreground text-right">
                            {comment.length}/1000
                        </p>
                    </div>

                    {/* Visit Date */}
                    <div className="space-y-2">
                        <Label htmlFor="visitDate" className="flex items-center gap-2">
                            <Calendar className="h-4 w-4" />
                            When did you visit? (optional)
                        </Label>
                        <input
                            type="date"
                            id="visitDate"
                            value={visitDate}
                            onChange={(e) => setVisitDate(e.target.value)}
                            max={new Date().toISOString().split("T")[0]}
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={loading}
                        />
                    </div>

                    {/* Submit */}
                    <Button
                        type="submit"
                        className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700"
                        disabled={loading || rating === 0}
                    >
                        {loading ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                {isEditing ? "Updating..." : "Submitting..."}
                            </>
                        ) : (
                            isEditing ? "Update Review" : "Submit Review"
                        )}
                    </Button>
                </form>
            </CardContent>
        </Card>
    );
}
