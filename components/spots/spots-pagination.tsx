"use client";

import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

interface SpotsPaginationProps {
    currentPage: number;
    totalCount: number;
    pageSize: number;
    onPageChange: (page: number) => void;
    isPending: boolean;
}

export function SpotsPagination({
    currentPage,
    totalCount,
    pageSize,
    onPageChange,
    isPending,
}: SpotsPaginationProps) {
    const totalPages = Math.ceil(totalCount / pageSize);

    // Don't render if only one page
    if (totalPages <= 1) return null;

    // Generate page numbers to display
    const getPageNumbers = (): (number | "ellipsis")[] => {
        const pages: (number | "ellipsis")[] = [];
        const showEllipsisThreshold = 7;

        if (totalPages <= showEllipsisThreshold) {
            // Show all pages if total is small
            for (let i = 1; i <= totalPages; i++) {
                pages.push(i);
            }
        } else {
            // Always show first page
            pages.push(1);

            // Show ellipsis or pages near current
            if (currentPage > 3) {
                pages.push("ellipsis");
            }

            // Pages around current
            const start = Math.max(2, currentPage - 1);
            const end = Math.min(totalPages - 1, currentPage + 1);

            for (let i = start; i <= end; i++) {
                if (!pages.includes(i)) {
                    pages.push(i);
                }
            }

            // Show ellipsis or pages near end
            if (currentPage < totalPages - 2) {
                pages.push("ellipsis");
            }

            // Always show last page
            if (!pages.includes(totalPages)) {
                pages.push(totalPages);
            }
        }

        return pages;
    };

    return (
        <nav
            className="flex items-center justify-center gap-1 mt-8"
            aria-label="Pagination"
        >
            {/* Previous Button */}
            <Button
                variant="outline"
                size="icon"
                onClick={() => onPageChange(currentPage - 1)}
                disabled={currentPage <= 1 || isPending}
                aria-label="Previous page"
                className="h-9 w-9"
            >
                <ChevronLeft className="h-4 w-4" />
            </Button>

            {/* Page Numbers */}
            <div className="flex items-center gap-1">
                {getPageNumbers().map((page, index) => {
                    if (page === "ellipsis") {
                        return (
                            <span
                                key={`ellipsis-${index}`}
                                className="px-2 text-muted-foreground"
                                aria-hidden="true"
                            >
                                <MoreHorizontal className="h-4 w-4" />
                            </span>
                        );
                    }

                    const isActive = page === currentPage;
                    return (
                        <Button
                            key={page}
                            variant={isActive ? "default" : "outline"}
                            size="icon"
                            onClick={() => onPageChange(page)}
                            disabled={isPending}
                            aria-label={`Page ${page}`}
                            aria-current={isActive ? "page" : undefined}
                            className={cn(
                                "h-9 w-9",
                                isActive && "bg-violet-600 hover:bg-violet-700 text-white"
                            )}
                        >
                            {page}
                        </Button>
                    );
                })}
            </div>

            {/* Next Button */}
            <Button
                variant="outline"
                size="icon"
                onClick={() => onPageChange(currentPage + 1)}
                disabled={currentPage >= totalPages || isPending}
                aria-label="Next page"
                className="h-9 w-9"
            >
                <ChevronRight className="h-4 w-4" />
            </Button>

            {/* Page info for screen readers */}
            <span className="sr-only">
                Page {currentPage} of {totalPages}
            </span>
        </nav>
    );
}
