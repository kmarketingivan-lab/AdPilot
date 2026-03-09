import { jsPDF } from "jspdf";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReportDateRange {
  start: Date;
  end: Date;
}

interface KpiSummary {
  totalImpressions: number;
  totalClicks: number;
  totalConversions: number;
  totalSpend: number;
  avgCpc: number;
  avgCtr: number;
  avgRoas: number;
  activeCampaigns: number;
}

interface CampaignRow {
  name: string;
  platform: string;
  status: string;
  impressions: number;
  clicks: number;
  conversions: number;
  spend: number;
  cpc: number;
  ctr: number;
  roas: number;
}

interface DailyRow {
  date: string;
  impressions: number;
  clicks: number;
  conversions: number;
  spend: number;
}

// ---------------------------------------------------------------------------
// Data fetching helpers
// ---------------------------------------------------------------------------

async function fetchKpiSummary(
  workspaceId: string,
  dateRange: ReportDateRange,
): Promise<KpiSummary> {
  const metrics = await prisma.campaignMetric.findMany({
    where: {
      campaign: { workspaceId },
      date: { gte: dateRange.start, lte: dateRange.end },
    },
    include: { campaign: { select: { status: true } } },
  });

  let totalImpressions = 0;
  let totalClicks = 0;
  let totalConversions = 0;
  let totalSpend = 0;
  let totalCpc = 0;
  let totalRoas = 0;
  let cpcCount = 0;
  let roasCount = 0;

  for (const m of metrics) {
    totalImpressions += m.impressions;
    totalClicks += m.clicks;
    totalConversions += m.conversions;
    totalSpend += m.spend;
    if (m.cpc != null) {
      totalCpc += m.cpc;
      cpcCount++;
    }
    if (m.roas != null) {
      totalRoas += m.roas;
      roasCount++;
    }
  }

  const activeCampaigns = await prisma.campaign.count({
    where: { workspaceId, status: "ACTIVE" },
  });

  return {
    totalImpressions,
    totalClicks,
    totalConversions,
    totalSpend: Math.round(totalSpend * 100) / 100,
    avgCpc: cpcCount > 0 ? Math.round((totalCpc / cpcCount) * 100) / 100 : 0,
    avgCtr:
      totalImpressions > 0
        ? Math.round((totalClicks / totalImpressions) * 10000) / 100
        : 0,
    avgRoas:
      roasCount > 0 ? Math.round((totalRoas / roasCount) * 100) / 100 : 0,
    activeCampaigns,
  };
}

async function fetchCampaignRows(
  workspaceId: string,
  dateRange: ReportDateRange,
): Promise<CampaignRow[]> {
  const campaigns = await prisma.campaign.findMany({
    where: { workspaceId },
    include: {
      metrics: {
        where: { date: { gte: dateRange.start, lte: dateRange.end } },
      },
    },
    orderBy: { name: "asc" },
  });

  return campaigns.map((c) => {
    let impressions = 0;
    let clicks = 0;
    let conversions = 0;
    let spend = 0;
    let cpcSum = 0;
    let cpcCount = 0;
    let roasSum = 0;
    let roasCount = 0;

    for (const m of c.metrics) {
      impressions += m.impressions;
      clicks += m.clicks;
      conversions += m.conversions;
      spend += m.spend;
      if (m.cpc != null) {
        cpcSum += m.cpc;
        cpcCount++;
      }
      if (m.roas != null) {
        roasSum += m.roas;
        roasCount++;
      }
    }

    return {
      name: c.name,
      platform: c.platform,
      status: c.status,
      impressions,
      clicks,
      conversions,
      spend: Math.round(spend * 100) / 100,
      cpc: cpcCount > 0 ? Math.round((cpcSum / cpcCount) * 100) / 100 : 0,
      ctr:
        impressions > 0
          ? Math.round((clicks / impressions) * 10000) / 100
          : 0,
      roas:
        roasCount > 0 ? Math.round((roasSum / roasCount) * 100) / 100 : 0,
    };
  });
}

async function fetchDailyRows(
  workspaceId: string,
  dateRange: ReportDateRange,
): Promise<DailyRow[]> {
  const metrics = await prisma.campaignMetric.findMany({
    where: {
      campaign: { workspaceId },
      date: { gte: dateRange.start, lte: dateRange.end },
    },
    orderBy: { date: "asc" },
  });

  // Aggregate by date
  const byDate = new Map<string, DailyRow>();
  for (const m of metrics) {
    const dateKey = m.date.toISOString().split("T")[0];
    const existing = byDate.get(dateKey);
    if (existing) {
      existing.impressions += m.impressions;
      existing.clicks += m.clicks;
      existing.conversions += m.conversions;
      existing.spend += m.spend;
    } else {
      byDate.set(dateKey, {
        date: dateKey,
        impressions: m.impressions,
        clicks: m.clicks,
        conversions: m.conversions,
        spend: m.spend,
      });
    }
  }

  return Array.from(byDate.values()).map((r) => ({
    ...r,
    spend: Math.round(r.spend * 100) / 100,
  }));
}

// ---------------------------------------------------------------------------
// PDF Report
// ---------------------------------------------------------------------------

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function formatNumber(n: number): string {
  return n.toLocaleString("it-IT");
}

function formatCurrency(n: number): string {
  return `€${n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export async function generatePdfReport(
  workspaceId: string,
  dateRange: ReportDateRange,
): Promise<Buffer> {
  const [kpi, campaigns] = await Promise.all([
    fetchKpiSummary(workspaceId, dateRange),
    fetchCampaignRows(workspaceId, dateRange),
  ]);

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 20;

  // --- Header ---
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.text("AdPilot Report", pageWidth / 2, y, { align: "center" });
  y += 10;

  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text(
    `${formatDate(dateRange.start)} — ${formatDate(dateRange.end)}`,
    pageWidth / 2,
    y,
    { align: "center" },
  );
  y += 6;

  doc.setDrawColor(200);
  doc.line(15, y, pageWidth - 15, y);
  y += 10;

  // --- KPI Summary Table ---
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("KPI Summary", 15, y);
  y += 8;

  const kpiData: [string, string][] = [
    ["Impressions", formatNumber(kpi.totalImpressions)],
    ["Clicks", formatNumber(kpi.totalClicks)],
    ["Conversions", formatNumber(kpi.totalConversions)],
    ["Spend", formatCurrency(kpi.totalSpend)],
    ["Avg CPC", formatCurrency(kpi.avgCpc)],
    ["Avg CTR", `${kpi.avgCtr}%`],
    ["Avg ROAS", `${kpi.avgRoas}x`],
    ["Active Campaigns", String(kpi.activeCampaigns)],
  ];

  doc.setFontSize(10);
  const kpiColWidth = (pageWidth - 30) / 2;
  for (const [label, value] of kpiData) {
    doc.setFont("helvetica", "normal");
    doc.text(label, 15, y);
    doc.setFont("helvetica", "bold");
    doc.text(value, 15 + kpiColWidth, y);
    y += 6;
  }

  y += 6;
  doc.setDrawColor(200);
  doc.line(15, y, pageWidth - 15, y);
  y += 10;

  // --- Campaign Performance Table ---
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("Campaign Performance", 15, y);
  y += 8;

  // Table headers
  const headers = [
    "Campaign",
    "Platform",
    "Impr.",
    "Clicks",
    "Conv.",
    "Spend",
    "ROAS",
  ];
  const colWidths = [50, 22, 22, 18, 18, 24, 18];
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");

  let x = 15;
  for (let i = 0; i < headers.length; i++) {
    doc.text(headers[i], x, y);
    x += colWidths[i];
  }
  y += 2;
  doc.setDrawColor(180);
  doc.line(15, y, pageWidth - 15, y);
  y += 4;

  // Table rows
  doc.setFont("helvetica", "normal");
  for (const campaign of campaigns) {
    // Check for page break
    if (y > 270) {
      doc.addPage();
      y = 20;
    }

    const row = [
      campaign.name.substring(0, 25),
      campaign.platform,
      formatNumber(campaign.impressions),
      formatNumber(campaign.clicks),
      formatNumber(campaign.conversions),
      formatCurrency(campaign.spend),
      `${campaign.roas}x`,
    ];

    x = 15;
    for (let i = 0; i < row.length; i++) {
      doc.text(row[i], x, y);
      x += colWidths[i];
    }
    y += 5;
  }

  if (campaigns.length === 0) {
    doc.setFont("helvetica", "italic");
    doc.text("No campaign data for this period.", 15, y);
    y += 5;
  }

  // --- Footer ---
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(150);
    doc.text(
      `AdPilot Report — Page ${i} of ${totalPages}`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 10,
      { align: "center" },
    );
    doc.setTextColor(0);
  }

  const arrayBuffer = doc.output("arraybuffer");
  return Buffer.from(arrayBuffer);
}

// ---------------------------------------------------------------------------
// Excel Report
// ---------------------------------------------------------------------------

export async function generateExcelReport(
  workspaceId: string,
  dateRange: ReportDateRange,
): Promise<Buffer> {
  const [kpi, campaigns, daily] = await Promise.all([
    fetchKpiSummary(workspaceId, dateRange),
    fetchCampaignRows(workspaceId, dateRange),
    fetchDailyRows(workspaceId, dateRange),
  ]);

  const wb = XLSX.utils.book_new();

  // --- Sheet 1: KPI Summary ---
  const kpiSheetData = [
    ["AdPilot Report"],
    [`Period: ${formatDate(dateRange.start)} — ${formatDate(dateRange.end)}`],
    [],
    ["Metric", "Value"],
    ["Total Impressions", kpi.totalImpressions],
    ["Total Clicks", kpi.totalClicks],
    ["Total Conversions", kpi.totalConversions],
    ["Total Spend (€)", kpi.totalSpend],
    ["Avg CPC (€)", kpi.avgCpc],
    ["Avg CTR (%)", kpi.avgCtr],
    ["Avg ROAS", kpi.avgRoas],
    ["Active Campaigns", kpi.activeCampaigns],
  ];
  const kpiWs = XLSX.utils.aoa_to_sheet(kpiSheetData);
  kpiWs["!cols"] = [{ wch: 25 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, kpiWs, "KPI Summary");

  // --- Sheet 2: Campaign Details ---
  const campaignHeaders = [
    "Campaign",
    "Platform",
    "Status",
    "Impressions",
    "Clicks",
    "Conversions",
    "Spend (€)",
    "CPC (€)",
    "CTR (%)",
    "ROAS",
  ];
  const campaignRows = campaigns.map((c) => [
    c.name,
    c.platform,
    c.status,
    c.impressions,
    c.clicks,
    c.conversions,
    c.spend,
    c.cpc,
    c.ctr,
    c.roas,
  ]);
  const campaignWs = XLSX.utils.aoa_to_sheet([campaignHeaders, ...campaignRows]);
  campaignWs["!cols"] = [
    { wch: 30 },
    { wch: 14 },
    { wch: 12 },
    { wch: 14 },
    { wch: 10 },
    { wch: 12 },
    { wch: 12 },
    { wch: 10 },
    { wch: 10 },
    { wch: 10 },
  ];
  XLSX.utils.book_append_sheet(wb, campaignWs, "Campaign Details");

  // --- Sheet 3: Daily Breakdown ---
  const dailyHeaders = [
    "Date",
    "Impressions",
    "Clicks",
    "Conversions",
    "Spend (€)",
  ];
  const dailyRows = daily.map((d) => [
    d.date,
    d.impressions,
    d.clicks,
    d.conversions,
    d.spend,
  ]);
  const dailyWs = XLSX.utils.aoa_to_sheet([dailyHeaders, ...dailyRows]);
  dailyWs["!cols"] = [
    { wch: 14 },
    { wch: 14 },
    { wch: 10 },
    { wch: 12 },
    { wch: 12 },
  ];
  XLSX.utils.book_append_sheet(wb, dailyWs, "Daily Breakdown");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return Buffer.from(buf);
}
