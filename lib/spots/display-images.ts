import {
  classifySpotPhoto,
  isRealSpotPhotoKind,
  summarizeSpotPhotos,
} from "@/lib/place-images";

export function isRealDisplaySpotPhoto(photo: string | null | undefined): boolean {
  return isRealSpotPhotoKind(classifySpotPhoto(photo));
}

export function getFirstRealDisplaySpotPhoto(
  photos: string[] | null | undefined,
): string | null {
  return getRealDisplaySpotPhotos(photos)[0] || null;
}

export function getRealDisplaySpotPhotos(
  photos: string[] | null | undefined,
): string[] {
  return photos?.filter((photo) => isRealDisplaySpotPhoto(photo)) || [];
}

export function hasRealDisplaySpotPhoto(
  photos: string[] | null | undefined,
): boolean {
  return summarizeSpotPhotos(photos).hasRealPhoto;
}

export function countRealDisplaySpotPhotos(
  photos: string[] | null | undefined,
): number {
  const summary = summarizeSpotPhotos(photos);
  return (
    summary.kinds.proxy +
    summary.kinds.remote_https +
    summary.kinds.local_asset
  );
}
