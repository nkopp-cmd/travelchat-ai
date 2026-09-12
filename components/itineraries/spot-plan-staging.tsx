"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { planningCitiesMatch, planHasSpot, type PlanningActivity, type PlanningSpot } from "@/lib/itineraries/spot-planning";

export function SpotPlanStaging({ spot, city, plans, onConfirm }: {
    spot: PlanningSpot;
    city: string;
    plans: { day: number; activities: PlanningActivity[] }[];
    onConfirm: (day: number, position: number) => void;
}) {
    const [day, setDay] = useState("");
    const [position, setPosition] = useState("");
    const selectedDay = plans.find((plan) => String(plan.day) === day);
    const duplicate = planHasSpot(plans, spot.id);
    const compatible = planningCitiesMatch(city, spot.city);
    const selectStyle = "min-h-11 min-w-0 w-full rounded-md border border-muted-foreground bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

    return <Card>
        <CardHeader><CardTitle className="break-words leading-snug">Add {spot.name} to this trip</CardTitle></CardHeader>
        <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">{spot.address || spot.city}</p>
            {duplicate ? <p role="status">This spot is already in your plan.</p>
                : !compatible ? <p role="status">This spot is in {spot.city}. Choose an itinerary for that city.</p>
                : plans.length === 0 ? <p role="status">This itinerary has no days available for this spot.</p>
                : <>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="min-w-0"><label htmlFor="spot-plan-day" className="mb-1 block text-sm font-medium">Day</label>
                            <select id="spot-plan-day" className={selectStyle} value={day} onChange={(event) => { setDay(event.target.value); setPosition(""); }}>
                                <option value="">Choose a day</option>
                                {plans.map((plan) => <option key={plan.day} value={plan.day}>Day {plan.day}</option>)}
                            </select>
                        </div>
                        <div className="min-w-0"><label htmlFor="spot-plan-position" className="mb-1 block text-sm font-medium">Position</label>
                            <select id="spot-plan-position" className={selectStyle} value={position} disabled={!selectedDay} onChange={(event) => setPosition(event.target.value)}>
                                <option value="">Choose a position</option>
                                {selectedDay?.activities.map((activity, index) => <option key={index} value={index}>Before {activity.name}</option>)}
                                {selectedDay && <option value={selectedDay.activities.length}>End of day</option>}
                            </select>
                        </div>
                    </div>
                    <Button className="min-h-11" disabled={!selectedDay || position === ""} onClick={() => onConfirm(Number(day), Number(position))}>Add to draft</Button>
                    <p className="text-sm text-muted-foreground">Choose a day and position first. After adding, save your draft or let the editor save automatically after 30 seconds.</p>
                </>}
        </CardContent>
    </Card>;
}
