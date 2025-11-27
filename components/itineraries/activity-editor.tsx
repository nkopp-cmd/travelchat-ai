"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { GripVertical, Trash2, Copy, Edit2, Check, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";

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

interface ActivityEditorProps {
    activity: Activity;
    index: number;
    onUpdate: (index: number, activity: Activity) => void;
    onDelete: (index: number) => void;
    onDuplicate: (index: number) => void;
    dragHandleProps?: any;
}

export function ActivityEditor({
    activity,
    index,
    onUpdate,
    onDelete,
    onDuplicate,
    dragHandleProps,
}: ActivityEditorProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [editedActivity, setEditedActivity] = useState(activity);

    const handleSave = () => {
        onUpdate(index, editedActivity);
        setIsEditing(false);
    };

    const handleCancel = () => {
        setEditedActivity(activity);
        setIsEditing(false);
    };

    if (!isEditing) {
        return (
            <Card className="p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start gap-3">
                    {/* Drag Handle */}
                    <div
                        {...dragHandleProps}
                        className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground mt-1"
                    >
                        <GripVertical className="h-5 w-5" />
                    </div>

                    {/* Activity Content */}
                    <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-2">
                            <div className="flex-1">
                                <h4 className="font-semibold text-lg">{activity.name}</h4>
                                {activity.address && (
                                    <p className="text-sm text-muted-foreground line-clamp-1">
                                        {activity.address}
                                    </p>
                                )}
                            </div>
                            <div className="flex gap-1 flex-shrink-0">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setIsEditing(true)}
                                    className="h-8 w-8 p-0"
                                >
                                    <Edit2 className="h-4 w-4" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => onDuplicate(index)}
                                    className="h-8 w-8 p-0"
                                >
                                    <Copy className="h-4 w-4" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => onDelete(index)}
                                    className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                                >
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>

                        {activity.description && (
                            <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                                {activity.description}
                            </p>
                        )}

                        <div className="flex flex-wrap gap-2">
                            {activity.time && (
                                <Badge variant="outline" className="gap-1">
                                    🕐 {activity.time}
                                </Badge>
                            )}
                            {activity.duration && (
                                <Badge variant="outline" className="gap-1">
                                    ⏱️ {activity.duration}
                                </Badge>
                            )}
                            {activity.cost && (
                                <Badge variant="outline" className="gap-1">
                                    💰 {activity.cost}
                                </Badge>
                            )}
                            {activity.type && (
                                <Badge variant="outline" className="gap-1">
                                    {activity.type}
                                </Badge>
                            )}
                            {activity.localleyScore && (
                                <Badge
                                    variant="secondary"
                                    className="gap-1 bg-violet-100 text-violet-700 dark:bg-violet-900/30"
                                >
                                    ⭐ {activity.localleyScore}/6
                                </Badge>
                            )}
                        </div>
                    </div>
                </div>
            </Card>
        );
    }

    return (
        <Card className="p-4 border-violet-200 bg-violet-50/50 dark:bg-violet-950/20">
            <div className="flex items-start gap-3">
                {/* Drag Handle (disabled when editing) */}
                <div className="text-muted-foreground/30 mt-1">
                    <GripVertical className="h-5 w-5" />
                </div>

                {/* Edit Form */}
                <div className="flex-1 space-y-3">
                    <div className="flex items-center justify-between">
                        <h4 className="font-semibold">Editing Activity</h4>
                        <div className="flex gap-1">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleSave}
                                className="h-8 w-8 p-0 text-green-600 hover:text-green-700"
                            >
                                <Check className="h-4 w-4" />
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleCancel}
                                className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="md:col-span-2">
                            <label className="text-sm font-medium mb-1 block">Activity Name</label>
                            <Input
                                value={editedActivity.name}
                                onChange={(e) =>
                                    setEditedActivity({ ...editedActivity, name: e.target.value })
                                }
                                placeholder="e.g., Coffee at Hidden Alley Cafe"
                            />
                        </div>

                        <div className="md:col-span-2">
                            <label className="text-sm font-medium mb-1 block">Address</label>
                            <Input
                                value={editedActivity.address || ""}
                                onChange={(e) =>
                                    setEditedActivity({ ...editedActivity, address: e.target.value })
                                }
                                placeholder="e.g., 123 Main St, Seoul"
                            />
                        </div>

                        <div>
                            <label className="text-sm font-medium mb-1 block">Time</label>
                            <Input
                                value={editedActivity.time || ""}
                                onChange={(e) =>
                                    setEditedActivity({ ...editedActivity, time: e.target.value })
                                }
                                placeholder="e.g., 09:00 AM"
                            />
                        </div>

                        <div>
                            <label className="text-sm font-medium mb-1 block">Duration</label>
                            <Input
                                value={editedActivity.duration || ""}
                                onChange={(e) =>
                                    setEditedActivity({ ...editedActivity, duration: e.target.value })
                                }
                                placeholder="e.g., 1-2 hours"
                            />
                        </div>

                        <div>
                            <label className="text-sm font-medium mb-1 block">Cost</label>
                            <Input
                                value={editedActivity.cost || ""}
                                onChange={(e) =>
                                    setEditedActivity({ ...editedActivity, cost: e.target.value })
                                }
                                placeholder="e.g., $10-20"
                            />
                        </div>

                        <div>
                            <label className="text-sm font-medium mb-1 block">Type</label>
                            <Input
                                value={editedActivity.type || ""}
                                onChange={(e) =>
                                    setEditedActivity({ ...editedActivity, type: e.target.value })
                                }
                                placeholder="e.g., morning"
                            />
                        </div>

                        <div className="md:col-span-2">
                            <label className="text-sm font-medium mb-1 block">Description</label>
                            <Textarea
                                value={editedActivity.description || ""}
                                onChange={(e) =>
                                    setEditedActivity({ ...editedActivity, description: e.target.value })
                                }
                                placeholder="Why this place is special..."
                                rows={3}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </Card>
    );
}
