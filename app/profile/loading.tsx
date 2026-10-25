/**
 * Streamed shell for /profile (perf-speed-of-light.md): the page waits for its data reads (~35 ms on D1) before it
 * can render, so without this file the first byte waited too. Same shape as the page: header card, stats, tabs.
 */
export default function ProfileLoading() {
    return (
        <div className="mx-auto w-full max-w-5xl space-y-5 px-4 pb-28 pt-5 sm:space-y-6 sm:px-6 sm:pb-10 sm:pt-8" aria-busy="true" aria-label="Loading your profile">
            <div className="overflow-hidden rounded-2xl bg-raised">
                <div className="h-24 bg-surface sm:h-32" />
                <div className="flex items-end gap-4 px-4 pb-5 sm:px-6">
                    <div className="-mt-10 size-20 rounded-full bg-surface motion-safe:animate-pulse sm:size-24" />
                    <div className="flex-1 space-y-2 pb-1">
                        <div className="h-6 w-40 rounded bg-surface motion-safe:animate-pulse" />
                        <div className="h-4 w-56 rounded bg-surface motion-safe:animate-pulse" />
                    </div>
                </div>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[0, 1, 2, 3].map((i) => <div key={i} className="h-24 rounded-2xl bg-raised motion-safe:animate-pulse" />)}
            </div>
            <div className="h-11 w-full rounded-2xl bg-raised lg:w-[400px]" />
            <div className="h-64 rounded-2xl bg-raised motion-safe:animate-pulse" />
        </div>
    );
}
