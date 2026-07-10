import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppBackground } from "@/components/layout/app-background";
import { SocialSubmissionRecovery } from "@/components/admin/social-submission-recovery";
import { verifyAdminAuth } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Community Recovery | Localley Admin",
  description: "Review and run bounded recovery for legacy community submissions.",
};

export default async function AdminSocialSubmissionsPage() {
  const admin = await verifyAdminAuth();
  if (!admin.authorized) notFound();

  return (
    <AppBackground ambient className="min-h-screen">
      <SocialSubmissionRecovery
        instagramConfigured={Boolean(process.env.APIFY_API_TOKEN?.trim())}
      />
    </AppBackground>
  );
}
