import Image from "next/image";
import Link from "next/link";
import { Spot } from "@/types";
import { LocalleyScaleIndicator } from "./localley-scale";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, Clock } from "lucide-react";

interface SpotCardProps {
    spot: Spot;
}

export function SpotCard({ spot }: SpotCardProps) {
    return (
        <Link href={`/spots/${spot.id}`}>
            <Card className="overflow-hidden transition-all hover:shadow-md hover:-translate-y-1 h-full flex flex-col">
                <div className="relative aspect-video w-full overflow-hidden">
                    <Image
                        src={spot.photos[0] || "/placeholder-spot.jpg"}
                        alt={spot.name}
                        fill
                        className="object-cover transition-transform hover:scale-105"
                    />
                    <div className="absolute top-2 right-2">
                        <LocalleyScaleIndicator score={spot.localleyScore} showLabel={false} />
                    </div>
                    {spot.trending && (
                        <Badge className="absolute top-2 left-2 bg-red-500 hover:bg-red-600">
                            Trending
                        </Badge>
                    )}
                </div>
                <CardHeader className="p-4 pb-2">
                    <div className="flex justify-between items-start">
                        <div>
                            <h3 className="font-semibold text-lg leading-none tracking-tight line-clamp-1">
                                {spot.name}
                            </h3>
                            <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {spot.location.address}
                            </p>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-4 pt-2 flex-1">
                    <p className="text-sm text-muted-foreground line-clamp-2">
                        {spot.description}
                    </p>
                    <div className="flex flex-wrap gap-2 mt-3">
                        {spot.subcategories.slice(0, 2).map((sub) => (
                            <Badge key={sub} variant="secondary" className="text-xs">
                                {sub}
                            </Badge>
                        ))}
                    </div>
                </CardContent>
                <CardFooter className="p-4 pt-0 border-t bg-muted/50 mt-auto">
                    <div className="flex items-center justify-between w-full py-2 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {spot.bestTime}
                        </div>
                        <div>{spot.localPercentage}% Locals</div>
                    </div>
                </CardFooter>
            </Card>
        </Link>
    );
}
