"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Share2, Download, Edit2, X, MoreVertical } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";

interface FloatingActionsProps {
  onShare?: () => void;
  onExport?: () => void;
  onEdit?: () => void;
  showEdit?: boolean;
  className?: string;
}

export function FloatingActions({
  onShare,
  onExport,
  onEdit,
  showEdit = false,
  className,
}: FloatingActionsProps) {
  const [isOpen, setIsOpen] = useState(false);

  const actions = [
    { icon: Share2, label: "Share", onClick: onShare, show: !!onShare },
    { icon: Download, label: "Export", onClick: onExport, show: !!onExport },
    { icon: Edit2, label: "Edit", onClick: onEdit, show: showEdit && !!onEdit },
  ].filter((action) => action.show);

  if (actions.length === 0) return null;

  return (
    <div
      className={cn(
        "fixed bottom-20 right-4 md:bottom-8 z-40",
        "flex flex-col-reverse items-end gap-2",
        className
      )}
    >
      {/* Action buttons - visible when open */}
      {isOpen &&
        actions.map((action, index) => (
          <Button
            key={index}
            size="sm"
            onClick={() => {
              action.onClick?.();
              setIsOpen(false);
            }}
            className={cn(
              "h-10 px-4 rounded-full",
              "bg-raised backdrop-blur-xl ",
              "text-foreground hover:bg-overlay",
              "shadow-lg shadow-black/20",
              "animate-in fade-in slide-in-from-bottom-2",
              "duration-200"
            )}
            style={{ animationDelay: `${index * 50}ms` }}
          >
            <action.icon className="w-4 h-4 mr-2" />
            {action.label}
          </Button>
        ))}

      {/* Main FAB */}
      <Button
        size="icon"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "w-14 h-14 rounded-full",
          "bg-primary text-primary-foreground",
          " hover:scale-105",
          "transition-all duration-200"
        )}
      >
        {isOpen ? (
          <X className="w-6 h-6" />
        ) : (
          <MoreVertical className="w-6 h-6" />
        )}
      </Button>
    </div>
  );
}
