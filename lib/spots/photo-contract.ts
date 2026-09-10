export type PhotoGalleryResponse = {
    status: "available" | "unavailable";
    photos: Array<{
        id: string;
        url: string;
        sourceLabel: string;
        attributions: Array<{ displayName: string; uri?: string }>;
    }>;
    message?: string;
};
