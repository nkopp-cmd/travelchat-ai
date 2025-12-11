"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Check, CheckCheck, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useNotifications } from "@/hooks/use-notifications";
import { getNotificationMeta, getNotificationUrl } from "@/lib/notifications";
import { Notification } from "@/types";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

function NotificationItem({
    notification,
    onRead,
    onDelete,
    onClick,
}: {
    notification: Notification;
    onRead: () => void;
    onDelete: () => void;
    onClick: () => void;
}) {
    const { icon, color } = getNotificationMeta(notification.type);

    return (
        <div
            className={cn(
                "flex items-start gap-3 p-3 hover:bg-muted/50 cursor-pointer transition-colors relative group",
                !notification.read && "bg-violet-50/50 dark:bg-violet-950/20"
            )}
            onClick={onClick}
        >
            {/* Unread indicator */}
            {!notification.read && (
                <div className="absolute left-1 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-violet-500" />
            )}

            {/* Icon */}
            <div className={cn("text-xl flex-shrink-0 mt-0.5", color)}>
                {icon}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium leading-tight">{notification.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                    {notification.message}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                    {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                </p>
            </div>

            {/* Actions */}
            <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                {!notification.read && (
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={(e) => {
                            e.stopPropagation();
                            onRead();
                        }}
                    >
                        <Check className="h-4 w-4" />
                    </Button>
                )}
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={(e) => {
                        e.stopPropagation();
                        onDelete();
                    }}
                >
                    <Trash2 className="h-4 w-4" />
                </Button>
            </div>
        </div>
    );
}

function NotificationSkeleton() {
    return (
        <div className="flex items-start gap-3 p-3">
            <Skeleton className="h-6 w-6 rounded-full" />
            <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-1/4" />
            </div>
        </div>
    );
}

export function NotificationCenter() {
    const router = useRouter();
    const [isOpen, setIsOpen] = useState(false);
    const {
        notifications,
        unreadCount,
        isLoading,
        hasMore,
        loadMore,
        markAsRead,
        markAllAsRead,
        deleteNotification,
    } = useNotifications();

    const handleNotificationClick = async (notification: Notification) => {
        if (!notification.read) {
            await markAsRead(notification.id);
        }
        const url = getNotificationUrl(notification);
        setIsOpen(false);
        router.push(url);
    };

    return (
        <Popover open={isOpen} onOpenChange={setIsOpen}>
            <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="relative">
                    <Bell className="h-5 w-5" />
                    {unreadCount > 0 && (
                        <Badge
                            variant="destructive"
                            className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-xs"
                        >
                            {unreadCount > 9 ? "9+" : unreadCount}
                        </Badge>
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0" align="end">
                {/* Header */}
                <div className="flex items-center justify-between p-3 border-b">
                    <h3 className="font-semibold">Notifications</h3>
                    <div className="flex gap-1">
                        {unreadCount > 0 && (
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={markAllAsRead}
                            >
                                <CheckCheck className="h-3 w-3 mr-1" />
                                Mark all read
                            </Button>
                        )}
                    </div>
                </div>

                {/* Content */}
                <ScrollArea className="h-[400px]">
                    {isLoading && notifications.length === 0 ? (
                        <div className="divide-y">
                            {[...Array(5)].map((_, i) => (
                                <NotificationSkeleton key={i} />
                            ))}
                        </div>
                    ) : notifications.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-[200px] text-muted-foreground">
                            <Bell className="h-10 w-10 mb-2 opacity-50" />
                            <p className="text-sm">No notifications yet</p>
                        </div>
                    ) : (
                        <div className="divide-y">
                            {notifications.map((notification) => (
                                <NotificationItem
                                    key={notification.id}
                                    notification={notification}
                                    onRead={() => markAsRead(notification.id)}
                                    onDelete={() => deleteNotification(notification.id)}
                                    onClick={() => handleNotificationClick(notification)}
                                />
                            ))}

                            {hasMore && (
                                <div className="p-2">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="w-full"
                                        onClick={loadMore}
                                        disabled={isLoading}
                                    >
                                        {isLoading ? "Loading..." : "Load more"}
                                    </Button>
                                </div>
                            )}
                        </div>
                    )}
                </ScrollArea>

                {/* Footer */}
                <Separator />
                <div className="p-2">
                    <Button
                        variant="ghost"
                        size="sm"
                        className="w-full"
                        onClick={() => {
                            setIsOpen(false);
                            router.push("/settings");
                        }}
                    >
                        Notification settings
                    </Button>
                </div>
            </PopoverContent>
        </Popover>
    );
}
