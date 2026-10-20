import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../components/ui/dialog';
import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '../components/ui/sheet';
import { Heart } from '../components/ui/icons';
import '../app/globals.css';
import '../styles/borderless-tokens.css';
import '../styles/borderless-theme.css';

function FoundationPreview() {
  const [saved, setSaved] = useState(false);
  const [status, setStatus] = useState('');
  return <main className="mx-auto min-h-dvh max-w-5xl space-y-8 p-4 pb-16 md:p-8">
    <header className="space-y-3">
      <p className="text-sm text-muted-foreground">Internal component preview. Controls use the actual shared React components. No account or application data changes.</p>
      <h1>Make room for local life.</h1>
      <p className="max-w-prose text-muted-foreground">Filled surfaces, full names and clear actions. App routes and the planner still need acceptance.</p>
    </header>
    <div className="grid items-start gap-8 md:grid-cols-2">
      <Card>
        <CardHeader><Badge variant="secondary">Market</Badge><CardTitle>Haengdang-dong Local Market</CardTitle><CardDescription>Haengdang-dong, Seoul · Market</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <p>Traditional market in Seongdong-gu serving local residents.</p>
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => setStatus('Preview only. No trip data changed.')}>Add to trip</Button>
            <Button variant="outline" aria-label={saved ? 'Remove saved place' : 'Save place'} aria-pressed={saved} onClick={() => setSaved(!saved)}><Heart weight={saved ? 'fill' : 'duotone'} />{saved ? 'Saved' : 'Save'}</Button>
          </div>
          <Tabs defaultValue="visit">
            <TabsList aria-label="Place information"><TabsTrigger value="visit">Visit</TabsTrigger><TabsTrigger value="notes">Notes</TabsTrigger></TabsList>
            <TabsContent value="visit"><p className="py-3 text-muted-foreground">Make space for one neighborhood market.</p></TabsContent>
            <TabsContent value="notes"><p className="py-3 text-muted-foreground">Check current hours before visiting.</p></TabsContent>
          </Tabs>
        </CardContent>
      </Card>
      <form className="space-y-5" onSubmit={event => {event.preventDefault();setStatus('Preview only. No form data saved.');}}>
        <div className="space-y-2"><label htmlFor="city" className="font-medium">City</label><Input id="city" name="city" defaultValue="Seoul" autoComplete="off" /></div>
        <div className="space-y-2"><label htmlFor="notes" className="font-medium">What would make a good day?</label><Textarea id="notes" name="notes" placeholder="A market, a quiet walk, time for coffee" /></div>
        <div className="space-y-2"><label htmlFor="invalid" className="font-medium">Date with an error</label><Input id="invalid" aria-invalid="true" aria-describedby="date-error" defaultValue="Yesterday" /><p id="date-error" className="text-sm text-[rgb(var(--ll-error))]">Choose a future date.</p></div>
        <div className="flex flex-wrap gap-3"><Button type="submit">Keep these inputs</Button><Button disabled>Unavailable</Button></div>
      </form>
    </div>
    <section className="space-y-4" aria-labelledby="overlays-title"><h2 id="overlays-title">Overlays</h2><div className="flex flex-wrap gap-3">
      <Dialog><DialogTrigger asChild><Button variant="secondary">Open details</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>About this place</DialogTitle><DialogDescription>This internal preview checks keyboard focus and filled dialog surfaces.</DialogDescription></DialogHeader><label htmlFor="dialog-note">Your note</label><Input id="dialog-note" autoComplete="off" /></DialogContent></Dialog>
      <Sheet><SheetTrigger asChild><Button variant="outline">Open trip panel</Button></SheetTrigger><SheetContent><SheetHeader><SheetTitle>Your trip</SheetTitle><SheetDescription>No saved trip is loaded in this internal preview.</SheetDescription></SheetHeader></SheetContent></Sheet>
    </div></section>
    <p role="status" className="min-h-6 text-muted-foreground">{status}</p>
  </main>;
}
createRoot(document.getElementById('root')!).render(<FoundationPreview />);
