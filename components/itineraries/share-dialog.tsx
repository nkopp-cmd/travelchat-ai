"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Share2, Copy, Check, Loader2, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ShareDialogProps {
  itineraryId: string;
  itineraryTitle: string;
}

export function ShareDialog({ itineraryId, itineraryTitle }: ShareDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const handleShare = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/itineraries/${itineraryId}/share`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Failed to generate share link");
      }

      const data = await response.json();
      setShareUrl(data.shareUrl);

      toast({
        title: "Share link generated!",
        description: "Your itinerary is now publicly accessible",
      });
    } catch (error) {
      console.error("Error sharing itinerary:", error);
      toast({
        title: "Failed to generate share link",
        description: "Please try again later",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!shareUrl) return;

    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast({
        title: "Link copied!",
        description: "Share link copied to clipboard",
      });

      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Error copying to clipboard:", error);
      toast({
        title: "Failed to copy",
        description: "Please try again",
        variant: "destructive",
      });
    }
  };

  const handleUnshare = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/itineraries/${itineraryId}/share`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to disable sharing");
      }

      setShareUrl(null);
      toast({
        title: "Sharing disabled",
        description: "Your itinerary is now private",
      });
      setOpen(false);
    } catch (error) {
      console.error("Error unsharing itinerary:", error);
      toast({
        title: "Failed to disable sharing",
        description: "Please try again later",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Share2 className="h-4 w-4" />
          Share
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share itinerary</DialogTitle>
          <DialogDescription>
            {shareUrl
              ? "Anyone with this link can view your itinerary"
              : "Generate a public link to share this itinerary"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!shareUrl ? (
            <div className="space-y-3">
              <div className="text-sm text-muted-foreground">
                <p className="mb-2">When you share this itinerary:</p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>Anyone with the link can view it</li>
                  <li>It will be publicly accessible</li>
                  <li>You can disable sharing anytime</li>
                </ul>
              </div>
              <Button
                onClick={handleShare}
                disabled={loading}
                className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating link...
                  </>
                ) : (
                  <>
                    <Share2 className="mr-2 h-4 w-4" />
                    Generate Share Link
                  </>
                )}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Input
                  value={shareUrl}
                  readOnly
                  className="flex-1"
                  onClick={(e) => e.currentTarget.select()}
                />
                <Button
                  size="icon"
                  variant="outline"
                  onClick={handleCopy}
                  className="flex-shrink-0"
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-green-600" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={handleUnshare}
                  disabled={loading}
                  className="flex-1"
                >
                  {loading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <X className="mr-2 h-4 w-4" />
                  )}
                  Disable Sharing
                </Button>
              </div>

              <div className="text-xs text-muted-foreground bg-muted p-3 rounded-lg">
                💡 Tip: Share this link on social media or send it to friends to help them discover amazing local experiences!
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
