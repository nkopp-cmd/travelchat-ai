// Push EA3: every visible free-trial claim derives from PRO_TRIAL_DAYS (lib/subscription.ts), the same number
// checkoutTrialDays passes to Stripe. A later trial change (or its end) can then never leave a false "free"
// promise on the paid path. The scan reads app/, components/, lib/ and emails/ source; comments are skipped.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkoutTrialDays, PRO_TRIAL_DAYS } from "@/lib/subscription";

const ROOTS = ["app", "components", "lib", "emails"];
// A digit glued to a trial claim: "7 days free", "7-day free trial", "7 day trial", "14-day trial".
export const LITERAL_TRIAL = /\b\d+(?:-day|\s+days?)\s+(?:free\b|(?:free\s+)?trial\b)/i;

function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) return sourceFiles(path);
        return /\.(ts|tsx|mdx?)$/.test(name) ? [path] : [];
    });
}

function codeLines(text: string): string[] {
    return text.split("\n").filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line));
}

describe("trial claim has one source (Push EA3)", () => {
    it("the pattern catches literal claims and leaves derived ones alone", () => {
        for (const bad of ["Try Pro 7 days free", "7-day free trial", "a 14 day trial", "3-day trial"]) expect(bad).toMatch(LITERAL_TRIAL);
        for (const good of ["Try Pro ${PRO_TRIAL_DAYS} days free", "${trialDays}-day free trial", "last 7 days", "7-day itinerary", "MET 7-day forecast"])
            expect(good).not.toMatch(LITERAL_TRIAL);
    });

    it("no source line states a trial length as a fixed number", () => {
        const offenders = ROOTS.flatMap((root) =>
            sourceFiles(root).flatMap((file) =>
                codeLines(readFileSync(file, "utf8"))
                    .filter((line) => LITERAL_TRIAL.test(line))
                    .map((line) => `${file}: ${line.trim()}`),
            ),
        );
        expect(offenders).toEqual([]);
    });

    it("the pricing card reads PRO_TRIAL_DAYS, and checkout gives that many days to a new Pro customer only", () => {
        const pricing = readFileSync("app/pricing/pricing-plans.tsx", "utf8");
        expect(pricing).toMatch(/\$\{PRO_TRIAL_DAYS\} days free/);
        expect(checkoutTrialDays("pro", null)).toBe(PRO_TRIAL_DAYS);
        expect(checkoutTrialDays("pro", { stripe_subscription_id: "sub_old" })).toBe(0);
        expect(checkoutTrialDays("premium", null)).toBe(0);
    });
});
