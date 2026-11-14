import type { CSSProperties, ReactNode } from "react";
import { Button, Heading, Img, Link, Section, Text } from "@react-email/components";
import { NewsletterLayout, styles, tokens } from "./newsletter-layout";
import { cityPhoto, LEVELS, levelIcon, utilityIcon, type LevelId, type UtilityIcon } from "./newsletter-assets";

export interface NewsletterPick {
  city: string;
  title: string;
  body: string;
  url: string;
  linkLabel: string;
}

export interface NewsletterStat { value: string; label: string }
export interface ScoreRow { level: LevelId; count: number }
export interface RankedSpot { name: string; area: string; level: LevelId; localShare: number; note: string; url: string }
export interface CityShare { city: string; share: number; url: string }
export interface CityCard { city: string; photo: string; title: string; body: string; url: string; linkLabel: string }
export interface TipBlock { icon: UtilityIcon; eyebrow: string; title: string; body: string; url: string; linkLabel: string }

export interface NewsletterIssue {
  subject: string;
  preview: string;
  title: string;
  intro: string;
  hero?: { photo: string; alt: string; credit: string };
  stats?: NewsletterStat[];
  scores?: { title: string; caption: string; rows: ScoreRow[]; url: string; linkLabel: string };
  ranked?: { title: string; caption: string; spots: RankedSpot[] };
  cityShares?: { title: string; caption: string; rows: CityShare[]; source: string };
  trend?: TipBlock;
  tip?: TipBlock;
  cityCards?: { title: string; cards: CityCard[] };
  picks?: NewsletterPick[];
  cta: { label: string; url: string };
  sources?: string;
}

const eyebrow: CSSProperties = {
  ...styles.muted, fontSize: "12px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", margin: "0 0 6px",
};
const h2: CSSProperties = { color: tokens.text, fontSize: "19px", lineHeight: "25px", fontWeight: 700, margin: "0 0 6px" };
const table: CSSProperties = { width: "100%", borderCollapse: "separate", borderSpacing: 0 };
const card: CSSProperties = { backgroundColor: tokens.raised, borderRadius: "16px", padding: "16px" };

function Block({ children }: { children: ReactNode }) {
  return <Section style={{ marginTop: "28px" }}>{children}</Section>;
}

function Icon({ src, size = 24 }: { src: string; size?: number }) {
  return <Img src={src} width={size} height={size} alt="" style={{ display: "block", border: 0 }} />;
}

/** Horizontal bar as two table cells; works in Outlook, Gmail and Apple Mail without images. */
function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.max(2, Math.round((value / max) * 100));
  return (
    <table role="presentation" cellPadding={0} cellSpacing={0} style={{ ...table, backgroundColor: tokens.background, borderRadius: "6px" }}>
      <tbody>
        <tr>
          <td style={{ width: `${pct}%`, backgroundColor: color, height: "10px", borderRadius: "6px", fontSize: 0, lineHeight: 0 }}>&nbsp;</td>
          {pct < 100 ? <td style={{ fontSize: 0, lineHeight: 0 }}>&nbsp;</td> : null}
        </tr>
      </tbody>
    </table>
  );
}

function Stats({ stats }: { stats: NewsletterStat[] }) {
  return (
    <table role="presentation" cellPadding={0} cellSpacing={0} style={{ ...table, marginTop: "20px" }}>
      <tbody>
        <tr>
          {stats.map((stat, index) => (
            <td key={stat.label} style={{ width: `${100 / stats.length}%`, paddingLeft: index === 0 ? 0 : "8px", verticalAlign: "top" }}>
              <div style={{ ...card, padding: "14px 12px" }}>
                <div style={{ color: tokens.action, fontSize: "26px", lineHeight: "30px", fontWeight: 800 }}>{stat.value}</div>
                <div style={{ color: tokens.muted, fontSize: "12px", lineHeight: "16px", marginTop: "4px" }}>{stat.label}</div>
              </div>
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  );
}

function Scores({ scores }: { scores: NonNullable<NewsletterIssue["scores"]> }) {
  const max = Math.max(...scores.rows.map((row) => row.count));
  return (
    <Block>
      <Text style={h2}>{scores.title}</Text>
      <Text style={{ ...styles.muted, margin: "0 0 14px" }}>{scores.caption}</Text>
      <div style={card}>
        <table role="presentation" cellPadding={0} cellSpacing={0} style={table}>
          <tbody>
            {scores.rows.map((row) => {
              const level = LEVELS[row.level];
              return (
                <tr key={row.level}>
                  <td style={{ width: "28px", padding: "7px 8px 7px 0", verticalAlign: "middle" }}><Icon src={levelIcon(row.level)} size={22} /></td>
                  <td style={{ padding: "7px 0", verticalAlign: "middle" }}>
                    <div style={{ color: tokens.text, fontSize: "14px", lineHeight: "18px", fontWeight: 600, marginBottom: "5px" }}>{level.name}</div>
                    <Bar value={row.count} max={max} color={level.color} />
                  </td>
                  <td style={{ width: "44px", padding: "7px 0 7px 10px", textAlign: "right", verticalAlign: "bottom", color: tokens.text, fontSize: "15px", fontWeight: 700 }}>
                    {row.count}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Link href={scores.url} style={{ ...styles.link, fontWeight: 600, fontSize: "15px", display: "inline-block", marginTop: "12px" }}>{scores.linkLabel}</Link>
    </Block>
  );
}

function Ranked({ ranked }: { ranked: NonNullable<NewsletterIssue["ranked"]> }) {
  return (
    <Block>
      <Text style={h2}>{ranked.title}</Text>
      <Text style={{ ...styles.muted, margin: "0 0 14px" }}>{ranked.caption}</Text>
      {ranked.spots.map((spot, index) => (
        <div key={spot.url} style={{ ...card, marginTop: index === 0 ? 0 : "8px", padding: "14px 16px" }}>
          <table role="presentation" cellPadding={0} cellSpacing={0} style={table}>
            <tbody>
              <tr>
                <td style={{ width: "34px", verticalAlign: "top", color: tokens.action, fontSize: "22px", lineHeight: "24px", fontWeight: 800 }}>{index + 1}</td>
                <td style={{ verticalAlign: "top" }}>
                  <Link href={spot.url} style={{ color: tokens.text, fontSize: "16px", lineHeight: "22px", fontWeight: 700, textDecoration: "none" }}>{spot.name}</Link>
                  <div style={{ color: tokens.muted, fontSize: "13px", lineHeight: "19px", marginTop: "2px" }}>{spot.area} · {spot.localShare}% locals</div>
                  <div style={{ color: tokens.muted, fontSize: "14px", lineHeight: "20px", marginTop: "6px" }}>{spot.note}</div>
                </td>
                <td style={{ width: "28px", verticalAlign: "top", paddingLeft: "8px" }}><Icon src={levelIcon(spot.level)} size={22} /></td>
              </tr>
            </tbody>
          </table>
        </div>
      ))}
    </Block>
  );
}

function CityShares({ data }: { data: NonNullable<NewsletterIssue["cityShares"]> }) {
  return (
    <Block>
      <Text style={h2}>{data.title}</Text>
      <Text style={{ ...styles.muted, margin: "0 0 14px" }}>{data.caption}</Text>
      <div style={card}>
        <table role="presentation" cellPadding={0} cellSpacing={0} style={table}>
          <tbody>
            {data.rows.map((row) => (
              <tr key={row.city}>
                <td style={{ width: "86px", padding: "8px 10px 8px 0", verticalAlign: "middle" }}>
                  <Link href={row.url} style={{ color: tokens.text, fontSize: "14px", fontWeight: 600, textDecoration: "none" }}>{row.city}</Link>
                </td>
                <td style={{ padding: "8px 0", verticalAlign: "middle" }}><Bar value={row.share} max={100} color={LEVELS[5].color} /></td>
                <td style={{ width: "44px", padding: "8px 0 8px 10px", textAlign: "right", verticalAlign: "middle", color: tokens.text, fontSize: "15px", fontWeight: 700 }}>{row.share}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Text style={{ ...styles.muted, fontSize: "12px", lineHeight: "17px", margin: "10px 0 0" }}>{data.source}</Text>
    </Block>
  );
}

function Tip({ tip }: { tip: TipBlock }) {
  return (
    <Block>
      <div style={card}>
        <table role="presentation" cellPadding={0} cellSpacing={0} style={table}>
          <tbody>
            <tr>
              <td style={{ width: "44px", verticalAlign: "top" }}>
                <div style={{ backgroundColor: tokens.background, borderRadius: "12px", width: "36px", height: "36px", padding: "6px", boxSizing: "border-box" }}>
                  <Icon src={utilityIcon(tip.icon)} size={24} />
                </div>
              </td>
              <td style={{ verticalAlign: "top" }}>
                <Text style={{ ...eyebrow, margin: "0 0 2px" }}>{tip.eyebrow}</Text>
                <Text style={{ ...h2, fontSize: "17px", lineHeight: "23px" }}>{tip.title}</Text>
                <Text style={{ ...styles.muted, fontSize: "14px", margin: "0 0 8px" }}>{tip.body}</Text>
                <Link href={tip.url} style={{ ...styles.link, fontWeight: 600, fontSize: "15px" }}>{tip.linkLabel}</Link>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </Block>
  );
}

function CityCards({ data }: { data: NonNullable<NewsletterIssue["cityCards"]> }) {
  return (
    <Block>
      <Text style={h2}>{data.title}</Text>
      {data.cards.map((city, index) => (
        <div key={city.city} style={{ ...card, padding: 0, overflow: "hidden", marginTop: index === 0 ? "10px" : "8px" }}>
          <table role="presentation" cellPadding={0} cellSpacing={0} style={table}>
            <tbody>
              <tr>
                <td style={{ width: "120px", verticalAlign: "top" }}>
                  <Link href={city.url}>
                    <Img src={cityPhoto(city.photo, "card")} width={120} height={120} alt={city.city}
                      style={{ display: "block", border: 0, width: "120px", height: "120px", objectFit: "cover", borderRadius: "16px 0 0 16px" }} />
                  </Link>
                </td>
                <td style={{ verticalAlign: "middle", padding: "12px 14px" }}>
                  <div style={{ ...eyebrow, margin: "0 0 2px" }}>{city.city}</div>
                  <div style={{ color: tokens.text, fontSize: "15px", lineHeight: "20px", fontWeight: 700 }}>{city.title}</div>
                  <div style={{ color: tokens.muted, fontSize: "13px", lineHeight: "18px", margin: "4px 0 6px" }}>{city.body}</div>
                  <Link href={city.url} style={{ ...styles.link, fontWeight: 600, fontSize: "14px" }}>{city.linkLabel}</Link>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      ))}
    </Block>
  );
}

export default function NewsletterIssueEmail({ issue, unsubscribeUrl }: { issue: NewsletterIssue; unsubscribeUrl: string }) {
  return (
    <NewsletterLayout
      preview={issue.preview}
      unsubscribeUrl={unsubscribeUrl}
      footerReason="You get this email because you signed up for the Localley newsletter and confirmed your address."
      hero={issue.hero ? (
        <>
          <Img src={cityPhoto(issue.hero.photo, "hero")} width={560} alt={issue.hero.alt}
            style={{ display: "block", width: "100%", height: "auto", border: 0, borderRadius: "20px 20px 0 0" }} />
        </>
      ) : undefined}>
      <Heading as="h1" style={{ ...styles.heading, fontSize: "26px", lineHeight: "32px" }}>{issue.title}</Heading>
      <Text style={{ ...styles.text, margin: 0 }}>{issue.intro}</Text>
      {issue.stats ? <Stats stats={issue.stats} /> : null}
      {issue.scores ? <Scores scores={issue.scores} /> : null}
      {issue.ranked ? <Ranked ranked={issue.ranked} /> : null}
      {issue.cityShares ? <CityShares data={issue.cityShares} /> : null}
      {issue.trend ? <Tip tip={issue.trend} /> : null}
      {issue.tip ? <Tip tip={issue.tip} /> : null}
      {issue.cityCards ? <CityCards data={issue.cityCards} /> : null}
      {issue.picks?.map((pick) => (
        <Tip key={pick.url} tip={{ icon: "pin", eyebrow: pick.city, title: pick.title, body: pick.body, url: pick.url, linkLabel: pick.linkLabel }} />
      ))}
      <Section style={{ marginTop: "28px", textAlign: "center" }}>
        <Button href={issue.cta.url} style={{ ...styles.button, width: "100%", boxSizing: "border-box", textAlign: "center" }}>{issue.cta.label}</Button>
      </Section>
      {issue.sources ? <Text style={{ ...styles.muted, fontSize: "12px", lineHeight: "17px", margin: "20px 0 0" }}>{issue.sources}</Text> : null}
    </NewsletterLayout>
  );
}
