"use client";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Mail, Loader2, CheckCircle } from "lucide-react";
import { itineraryMailCandidateUrl } from "@/lib/app-data/itinerary-mail-candidate-url";

/** Only the authorized candidate detail page supplies this fixed owner identity. */
export function OwnerEmailPreviewDialog({ itineraryId, ownerEmail }: { itineraryId: string; ownerEmail: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<"idle" | "queued" | "error">("idle");
  const inFlight = useRef(false);
  const submitted = useRef(false);
  const save = async () => {
    if (inFlight.current || submitted.current || result !== "idle") return;
    submitted.current = true;
    const url = itineraryMailCandidateUrl(itineraryId);
    if (!url || ownerEmail.length > 200
      || !/^[a-z0-9.!#$%&'*+\/=?^_`{|}~-]+@preview\.localley\.test$/i.test(ownerEmail)) {
      setResult("error"); return;
    }
    inFlight.current = true; setLoading(true);
    try {
      const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientEmail: ownerEmail }) });
      const data = await response.json();
      if (!response.ok || data?.success !== true || data.queued !== true || data.sent !== false
        || data.reason !== "preview_outbox") throw new Error("Preview not confirmed");
      setResult("queued");
    } catch { setResult("error"); }
    finally { inFlight.current = false; setLoading(false); }
  };
  const changeOpen = (value: boolean) => {
    if (inFlight.current) return;
    if (value) { submitted.current = false; setResult("idle"); }
    setOpen(value);
  };
  return <Dialog open={open} onOpenChange={changeOpen}>
    <DialogTrigger asChild><Button variant="outline" className="min-h-11 gap-2">
      <Mail className="h-4 w-4" />Preview email link
    </Button></DialogTrigger>
    <DialogContent className="sm:max-w-md">
      <DialogHeader><DialogTitle>Preview an email link</DialogTitle>
        <DialogDescription>Save a private link for your account. No email is sent from this preview.</DialogDescription>
      </DialogHeader>
      <div className="space-y-2 py-4">
        <p className="text-sm text-muted-foreground">Your account</p>
        <p className="break-all text-sm">{ownerEmail}</p>
        {result === "queued" && <div role="status" className="flex items-start gap-2 rounded-lg border p-3">
          <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
          <p className="text-sm">Preview saved. No email was sent.</p>
        </div>}
        {result === "error" && <p role="alert" className="text-sm text-destructive">
          The preview could not be confirmed. No delivery is confirmed.
        </p>}
      </div>
      <DialogFooter>
        <Button variant="outline" className="min-h-11" disabled={loading} onClick={() => changeOpen(false)}>Close</Button>
        {result === "idle" && <Button className="min-h-11" disabled={loading} onClick={save}>
          {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving preview...</> : "Save preview"}
        </Button>}
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
