"use client";

import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { ActivityEditor } from "./activity-editor";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Plus, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

interface Activity {
    name: string;
    description?: string;
    time?: string;
    duration?: string;
    cost?: string;
    address?: string;
    type?: string;
    localleyScore?: number;
}

interface DayPlan {
    day: number;
    theme?: string;
    activities: Activity[];
    localTip?: string;
    transportTips?: string;
}

interface DayEditorProps {
    dayPlan: DayPlan;
    onUpdate: (dayPlan: DayPlan) => void;
}

export function DayEditor({ dayPlan, onUpdate }: DayEditorProps) {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [isAddingActivity, setIsAddingActivity] = useState(false);
    const [newActivity, setNewActivity] = useState<Activity>({
        name: "",
        time: "",
        duration: "",
        cost: "",
        address: "",
        description: "",
        type: "morning",
        localleyScore: 4,
    });

    const handleDragEnd = (result: DropResult) => {
        if (!result.destination) return;

        const items = Array.from(dayPlan.activities);
        const [reorderedItem] = items.splice(result.source.index, 1);
        items.splice(result.destination.index, 0, reorderedItem);

        onUpdate({
            ...dayPlan,
            activities: items,
        });
    };

    const handleActivityUpdate = (index: number, activity: Activity) => {
        const updatedActivities = [...dayPlan.activities];
        updatedActivities[index] = activity;
        onUpdate({
            ...dayPlan,
            activities: updatedActivities,
        });
    };

    const handleActivityDelete = (index: number) => {
        if (confirm("Are you sure you want to delete this activity?")) {
            const updatedActivities = dayPlan.activities.filter((_, i) => i !== index);
            onUpdate({
                ...dayPlan,
                activities: updatedActivities,
            });
        }
    };

    const handleActivityDuplicate = (index: number) => {
        const activityToDuplicate = { ...dayPlan.activities[index] };
        const updatedActivities = [...dayPlan.activities];
        updatedActivities.splice(index + 1, 0, activityToDuplicate);
        onUpdate({
            ...dayPlan,
            activities: updatedActivities,
        });
    };

    const handleAddActivity = () => {
        if (!newActivity.name.trim()) return;

        onUpdate({
            ...dayPlan,
            activities: [...dayPlan.activities, newActivity],
        });

        setNewActivity({
            name: "",
            time: "",
            duration: "",
            cost: "",
            address: "",
            description: "",
            type: "morning",
            localleyScore: 4,
        });
        setIsAddingActivity(false);
    };

    return (
        <Card className="overflow-hidden">
            <CardHeader className="bg-gradient-to-r from-violet-600 to-indigo-600 text-white">
                <div className="flex items-center justify-between">
                    <div className="flex-1">
                        <CardTitle className="text-xl mb-2">Day {dayPlan.day}</CardTitle>
                        <Input
                            value={dayPlan.theme || ""}
                            onChange={(e) => onUpdate({ ...dayPlan, theme: e.target.value })}
                            placeholder="Day theme (e.g., 'Food Exploration')"
                            className="bg-white/10 border-white/20 text-white placeholder:text-white/60"
                        />
                    </div>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setIsCollapsed(!isCollapsed)}
                        className="text-white hover:bg-white/10"
                    >
                        {isCollapsed ? <ChevronDown /> : <ChevronUp />}
                    </Button>
                </div>
            </CardHeader>

            {!isCollapsed && (
                <CardContent className="p-6 space-y-6">
                    {/* Activities List with Drag & Drop */}
                    <div>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-semibold">
                                Activities ({dayPlan.activities.length})
                            </h3>
                            <Button
                                onClick={() => setIsAddingActivity(!isAddingActivity)}
                                size="sm"
                                variant="outline"
                                className="gap-2"
                            >
                                <Plus className="h-4 w-4" />
                                Add Activity
                            </Button>
                        </div>

                        {isAddingActivity && (
                            <Card className="p-4 mb-4 bg-green-50/50 dark:bg-green-950/20 border-green-200">
                                <div className="space-y-3">
                                    <h4 className="font-semibold">New Activity</h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        <div className="md:col-span-2">
                                            <Input
                                                value={newActivity.name}
                                                onChange={(e) =>
                                                    setNewActivity({ ...newActivity, name: e.target.value })
                                                }
                                                placeholder="Activity name"
                                            />
                                        </div>
                                        <Input
                                            value={newActivity.time || ""}
                                            onChange={(e) =>
                                                setNewActivity({ ...newActivity, time: e.target.value })
                                            }
                                            placeholder="Time (e.g., 09:00 AM)"
                                        />
                                        <Input
                                            value={newActivity.duration || ""}
                                            onChange={(e) =>
                                                setNewActivity({ ...newActivity, duration: e.target.value })
                                            }
                                            placeholder="Duration (e.g., 1-2 hours)"
                                        />
                                        <Input
                                            value={newActivity.cost || ""}
                                            onChange={(e) =>
                                                setNewActivity({ ...newActivity, cost: e.target.value })
                                            }
                                            placeholder="Cost (e.g., $10-20)"
                                        />
                                        <Input
                                            value={newActivity.address || ""}
                                            onChange={(e) =>
                                                setNewActivity({ ...newActivity, address: e.target.value })
                                            }
                                            placeholder="Address"
                                        />
                                        <div className="md:col-span-2">
                                            <Textarea
                                                value={newActivity.description || ""}
                                                onChange={(e) =>
                                                    setNewActivity({
                                                        ...newActivity,
                                                        description: e.target.value,
                                                    })
                                                }
                                                placeholder="Description"
                                                rows={2}
                                            />
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <Button onClick={handleAddActivity} size="sm">
                                            Add Activity
                                        </Button>
                                        <Button
                                            onClick={() => setIsAddingActivity(false)}
                                            size="sm"
                                            variant="outline"
                                        >
                                            Cancel
                                        </Button>
                                    </div>
                                </div>
                            </Card>
                        )}

                        <DragDropContext onDragEnd={handleDragEnd}>
                            <Droppable droppableId={`day-${dayPlan.day}`}>
                                {(provided) => (
                                    <div
                                        {...provided.droppableProps}
                                        ref={provided.innerRef}
                                        className="space-y-3"
                                    >
                                        {dayPlan.activities.map((activity, index) => (
                                            <Draggable
                                                key={`activity-${dayPlan.day}-${index}`}
                                                draggableId={`activity-${dayPlan.day}-${index}`}
                                                index={index}
                                            >
                                                {(provided, snapshot) => (
                                                    <div
                                                        ref={provided.innerRef}
                                                        {...provided.draggableProps}
                                                        className={
                                                            snapshot.isDragging
                                                                ? "opacity-50"
                                                                : ""
                                                        }
                                                    >
                                                        <ActivityEditor
                                                            activity={activity}
                                                            index={index}
                                                            onUpdate={handleActivityUpdate}
                                                            onDelete={handleActivityDelete}
                                                            onDuplicate={handleActivityDuplicate}
                                                            dragHandleProps={provided.dragHandleProps}
                                                        />
                                                    </div>
                                                )}
                                            </Draggable>
                                        ))}
                                        {provided.placeholder}

                                        {dayPlan.activities.length === 0 && (
                                            <div className="text-center py-8 text-muted-foreground">
                                                <p>No activities yet.</p>
                                                <p className="text-sm">Click &quot;Add Activity&quot; to get started.</p>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </Droppable>
                        </DragDropContext>
                    </div>

                    {/* Day Tips */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t">
                        <div>
                            <label className="text-sm font-medium mb-1 block">Local Tip</label>
                            <Textarea
                                value={dayPlan.localTip || ""}
                                onChange={(e) =>
                                    onUpdate({ ...dayPlan, localTip: e.target.value })
                                }
                                placeholder="Insider tip for this day..."
                                rows={3}
                            />
                        </div>
                        <div>
                            <label className="text-sm font-medium mb-1 block">Transport Tips</label>
                            <Textarea
                                value={dayPlan.transportTips || ""}
                                onChange={(e) =>
                                    onUpdate({ ...dayPlan, transportTips: e.target.value })
                                }
                                placeholder="How to get around..."
                                rows={3}
                            />
                        </div>
                    </div>
                </CardContent>
            )}
        </Card>
    );
}
