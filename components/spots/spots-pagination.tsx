"use client";

import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, MoreHorizontal } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import type React from "react";

interface SpotsPaginationProps {
    currentPage: number;
    totalCount: number;
    pageSize: number;
    onPageChange: (page: number) => void;
    isPending: boolean;
    /** Real URL of a page, so crawlers can follow the page links (DA2). */
    hrefFor: (page: number) => string;
}

/** URL of page `page` with every other filter kept; page 1 drops the param. */
export function spotsPageHref(pathname: string, search: string, page: number): string {
    const params = new URLSearchParams(search);
    if (page <= 1) params.delete("page");
    else params.set("page", String(page));
    const query = params.toString();
    return query ? `${pathname}?${query}` : pathname;
}

function PageLink({
    page,
    hrefFor,
    onPageChange,
    children,
    ...buttonProps
}: {
    page: number;
    hrefFor: (page: number) => string;
    onPageChange: (page: number) => void;
    children: React.ReactNode;
} & Omit<React.ComponentProps<typeof Button>, "asChild" | "onClick" | "children">) {
    return (
        <Button asChild {...buttonProps}>
            <a
                href={hrefFor(page)}
                onClick={(event) => {
                    // New tab / window keeps the browser default.
                    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
                    event.preventDefault();
                    onPageChange(page);
                }}
            >
                {children}
            </a>
        </Button>
    );
}

export function SpotsPagination({
    currentPage,
    totalCount,
    pageSize,
    onPageChange,
    isPending,
    hrefFor,
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
            {/* Previous */}
            {currentPage <= 1 || isPending ? (
                <Button variant="outline" size="icon" disabled aria-label="Previous page" className="size-11">
                    <ChevronLeft className="h-4 w-4" />
                </Button>
            ) : (
                <PageLink
                    page={currentPage - 1}
                    hrefFor={hrefFor}
                    onPageChange={onPageChange}
                    variant="outline"
                    size="icon"
                    aria-label="Previous page"
                    rel="prev"
                    className="size-11"
                >
                    <ChevronLeft className="h-4 w-4" />
                </PageLink>
            )}

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
                    if (isActive || isPending) {
                        return (
                            <Button
                                key={page}
                                variant={isActive ? "default" : "outline"}
                                size="icon"
                                disabled={isPending}
                                aria-label={`Page ${page}`}
                                aria-current={isActive ? "page" : undefined}
                                className={cn(
                                    "size-11",
                                    isActive && "bg-violet-600 hover:bg-violet-700 text-white"
                                )}
                            >
                                {page}
                            </Button>
                        );
                    }
                    return (
                        <PageLink
                            key={page}
                            page={page}
                            hrefFor={hrefFor}
                            onPageChange={onPageChange}
                            variant="outline"
                            size="icon"
                            aria-label={`Page ${page}`}
                            className="size-11"
                        >
                            {page}
                        </PageLink>
                    );
                })}
            </div>

            {/* Next */}
            {currentPage >= totalPages || isPending ? (
                <Button variant="outline" size="icon" disabled aria-label="Next page" className="size-11">
                    <ChevronRight className="h-4 w-4" />
                </Button>
            ) : (
                <PageLink
                    page={currentPage + 1}
                    hrefFor={hrefFor}
                    onPageChange={onPageChange}
                    variant="outline"
                    size="icon"
                    aria-label="Next page"
                    rel="next"
                    className="size-11"
                >
                    <ChevronRight className="h-4 w-4" />
                </PageLink>
            )}

            {/* Page info for screen readers */}
            <span className="sr-only">
                Page {currentPage} of {totalPages}
            </span>
        </nav>
    );
}
