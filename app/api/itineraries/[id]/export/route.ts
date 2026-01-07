import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createSupabaseServerClient } from "@/lib/supabase";
import { Errors, handleApiError } from "@/lib/api-errors";

// Activity and Day types for export
interface ExportActivity {
  name?: string;
  time?: string;
  address?: string;
  description?: string;
  cost?: string | number;
  tips?: string;
  localley_score?: number;
  duration?: string;
}

interface ExportDay {
  day?: number;
  theme?: string;
  activities?: ExportActivity[];
  localTip?: string;
  transportTips?: string;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createSupabaseServerClient();

    // Fetch itinerary
    const { data: itinerary, error } = await supabase
      .from("itineraries")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !itinerary) {
      return Errors.notFound("Itinerary");
    }

    // Check if user has access (either owner or itinerary is shared)
    const { userId } = await auth();
    const isOwner = userId && itinerary.clerk_user_id === userId;
    const isShared = itinerary.shared;

    if (!isOwner && !isShared) {
      return Errors.forbidden();
    }

    // Parse activities
    const dailyPlans = typeof itinerary.activities === "string"
      ? JSON.parse(itinerary.activities)
      : itinerary.activities;

    // Generate HTML content for PDF
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${itinerary.title}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #1f2937;
      padding: 40px;
      max-width: 800px;
      margin: 0 auto;
    }
    h1 {
      color: #7c3aed;
      font-size: 32px;
      margin-bottom: 16px;
      border-bottom: 3px solid #7c3aed;
      padding-bottom: 16px;
    }
    .meta {
      display: flex;
      gap: 16px;
      margin-bottom: 24px;
      color: #6b7280;
      font-size: 14px;
    }
    .meta span {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .highlights {
      background: linear-gradient(135deg, #f3e8ff 0%, #dbeafe 100%);
      padding: 20px;
      border-radius: 12px;
      margin-bottom: 32px;
      border-left: 4px solid #7c3aed;
    }
    .highlights h2 {
      color: #7c3aed;
      font-size: 18px;
      margin-bottom: 12px;
    }
    .highlights ul {
      list-style: none;
      padding-left: 0;
    }
    .highlights li {
      padding: 4px 0;
      padding-left: 20px;
      position: relative;
    }
    .highlights li:before {
      content: "✓";
      position: absolute;
      left: 0;
      color: #7c3aed;
      font-weight: bold;
    }
    .day {
      margin-bottom: 32px;
      page-break-inside: avoid;
    }
    .day-header {
      background: linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%);
      color: white;
      padding: 16px 20px;
      border-radius: 12px 12px 0 0;
      margin-bottom: 0;
    }
    .day-header h2 {
      font-size: 24px;
      margin-bottom: 4px;
    }
    .day-theme {
      opacity: 0.9;
      font-size: 16px;
    }
    .day-content {
      border: 2px solid #e5e7eb;
      border-top: none;
      border-radius: 0 0 12px 12px;
      padding: 20px;
    }
    .activity {
      margin-bottom: 24px;
      padding-bottom: 24px;
      border-bottom: 1px solid #e5e7eb;
    }
    .activity:last-child {
      border-bottom: none;
      margin-bottom: 0;
      padding-bottom: 0;
    }
    .activity-header {
      display: flex;
      justify-content: space-between;
      align-items: start;
      margin-bottom: 8px;
    }
    .activity-name {
      font-size: 18px;
      font-weight: 600;
      color: #1f2937;
    }
    .activity-time {
      background: #f3f4f6;
      padding: 4px 12px;
      border-radius: 6px;
      font-size: 14px;
      color: #4b5563;
    }
    .activity-address {
      color: #6b7280;
      font-size: 14px;
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .activity-description {
      color: #4b5563;
      margin-bottom: 12px;
    }
    .activity-details {
      display: flex;
      gap: 16px;
      font-size: 14px;
      color: #6b7280;
    }
    .tips-section {
      margin-top: 20px;
      padding-top: 20px;
      border-top: 2px solid #e5e7eb;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
    }
    .tip {
      background: #fef9c3;
      padding: 12px;
      border-radius: 8px;
      border-left: 3px solid #eab308;
    }
    .tip h4 {
      font-size: 14px;
      margin-bottom: 4px;
      color: #854d0e;
    }
    .tip p {
      font-size: 13px;
      color: #713f12;
    }
    .footer {
      margin-top: 48px;
      padding-top: 24px;
      border-top: 2px solid #e5e7eb;
      text-align: center;
      color: #6b7280;
      font-size: 14px;
    }
    .logo {
      font-weight: bold;
      background: linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      font-size: 18px;
    }
    @media print {
      body {
        padding: 20px;
      }
      .day {
        page-break-inside: avoid;
      }
    }
  </style>
</head>
<body>
  <h1>${itinerary.title}</h1>

  <div class="meta">
    <span>📍 ${itinerary.city}</span>
    <span>📅 ${itinerary.days} ${itinerary.days === 1 ? "Day" : "Days"}</span>
    ${itinerary.local_score ? `<span>⭐ Local Score: ${itinerary.local_score}/10</span>` : ""}
    ${itinerary.estimated_cost ? `<span>💰 ${itinerary.estimated_cost}</span>` : ""}
  </div>

  ${
    itinerary.highlights && Array.isArray(itinerary.highlights) && itinerary.highlights.length > 0
      ? `
  <div class="highlights">
    <h2>✨ Trip Highlights</h2>
    <ul>
      ${itinerary.highlights.map((h: string) => `<li>${h}</li>`).join("")}
    </ul>
  </div>
  `
      : ""
  }

  ${dailyPlans
    .map(
      (day: ExportDay) => `
  <div class="day">
    <div class="day-header">
      <h2>Day ${day.day || ""}</h2>
      ${day.theme ? `<div class="day-theme">${day.theme}</div>` : ""}
    </div>
    <div class="day-content">
      ${(day.activities || [])
        .map(
          (activity: ExportActivity) => `
      <div class="activity">
        <div class="activity-header">
          <div class="activity-name">${activity.name || "Activity"}</div>
          ${activity.time ? `<div class="activity-time">${activity.time}</div>` : ""}
        </div>
        ${activity.address ? `<div class="activity-address">📍 ${activity.address}</div>` : ""}
        ${activity.description ? `<div class="activity-description">${activity.description}</div>` : ""}
        <div class="activity-details">
          ${activity.duration ? `<span>⏱️ ${activity.duration}</span>` : ""}
          ${activity.cost ? `<span>💵 ${activity.cost}</span>` : ""}
        </div>
      </div>
      `
        )
        .join("")}

      ${
        day.localTip || day.transportTips
          ? `
      <div class="tips-section">
        ${
          day.localTip
            ? `
        <div class="tip">
          <h4>💡 Local Tip</h4>
          <p>${day.localTip}</p>
        </div>
        `
            : ""
        }
        ${
          day.transportTips
            ? `
        <div class="tip">
          <h4>🚌 Getting Around</h4>
          <p>${day.transportTips}</p>
        </div>
        `
            : ""
        }
      </div>
      `
          : ""
      }
    </div>
  </div>
  `
    )
    .join("")}

  <div class="footer">
    <div class="logo">Localley</div>
    <p>Your guide to authentic hidden gems and local experiences</p>
    <p style="margin-top: 8px; font-size: 12px;">Generated on ${new Date().toLocaleDateString()}</p>
  </div>
</body>
</html>
    `;

    // Return HTML that will trigger browser print dialog
    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html",
        "Content-Disposition": `inline; filename="${itinerary.title.replace(/[^a-z0-9]/gi, "-")}.html"`,
      },
    });
  } catch (error) {
    return handleApiError(error, "itinerary-export");
  }
}
