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
  return photos?.find((photo) => isRealDisplaySpotPhoto(photo)) || null;
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
