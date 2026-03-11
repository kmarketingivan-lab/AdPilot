import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type InsightType = "positive" | "negative" | "suggestion";

export interface Insight {
  type: InsightType;
  title: string;
  description: string;
}

export interface InsightDateRange {
  start: Date;
  end: Date;
}

// ---------------------------------------------------------------------------
// Data helpers
// ---------------------------------------------------------------------------

interface AggregatedMetrics {
  totalImpressions: number;
  totalClicks: number;
  totalConversions: number;
  totalSpend: number;
  avgCpc: number;
  avgRoas: number;
  campaignCount: number;
}

async function fetchAggregatedMetrics(
  workspaceId: string,
  dateRange: InsightDateRange,
): Promise<AggregatedMetrics> {
  const metrics = await prisma.campaignMetric.findMany({
    where: {
      campaign: { workspaceId },
      date: { gte: dateRange.start, lte: dateRange.end },
    },
  });

  let totalImpressions = 0;
  let totalClicks = 0;
  let totalConversions = 0;
  let totalSpend = 0;
  let cpcSum = 0;
  let cpcCount = 0;
  let roasSum = 0;
  let roasCount = 0;

  for (const m of metrics) {
    totalImpressions += m.impressions;
    totalClicks += m.clicks;
    totalConversions += m.conversions;
    totalSpend += m.spend;
    if (m.cpc != null) {
      cpcSum += m.cpc;
      cpcCount++;
    }
    if (m.roas != null) {
      roasSum += m.roas;
      roasCount++;
    }
  }

  const campaignCount = await prisma.campaign.count({
    where: { workspaceId, status: "ACTIVE" },
  });

  return {
    totalImpressions,
    totalClicks,
    totalConversions,
    totalSpend: Math.round(totalSpend * 100) / 100,
    avgCpc: cpcCount > 0 ? Math.round((cpcSum / cpcCount) * 100) / 100 : 0,
    avgRoas: roasCount > 0 ? Math.round((roasSum / roasCount) * 100) / 100 : 0,
    campaignCount,
  };
}

interface CampaignPerformance {
  name: string;
  platform: string;
  impressions: number;
  clicks: number;
  spend: number;
  avgCpc: number;
  avgRoas: number;
}

async function fetchCampaignPerformance(
  workspaceId: string,
  dateRange: InsightDateRange,
): Promise<CampaignPerformance[]> {
  const campaigns = await prisma.campaign.findMany({
    where: { workspaceId },
    include: {
      metrics: {
        where: { date: { gte: dateRange.start, lte: dateRange.end } },
      },
    },
  });

  return campaigns.map((c) => {
    let impressions = 0;
    let clicks = 0;
    let spend = 0;
    let cpcSum = 0;
    let cpcCount = 0;
    let roasSum = 0;
    let roasCount = 0;

    for (const m of c.metrics) {
      impressions += m.impressions;
      clicks += m.clicks;
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
      impressions,
      clicks,
      spend: Math.round(spend * 100) / 100,
      avgCpc: cpcCount > 0 ? Math.round((cpcSum / cpcCount) * 100) / 100 : 0,
      avgRoas:
        roasCount > 0 ? Math.round((roasSum / roasCount) * 100) / 100 : 0,
    };
  });
}

// ---------------------------------------------------------------------------
// Insight generation
//
// Currently returns rule-based mock insights. The structure is designed for
// easy replacement with a Claude API call in the future — swap the body of
// this function to send the aggregated data to Claude and parse the response.
// ---------------------------------------------------------------------------

export async function generateInsights(
  workspaceId: string,
  dateRange: InsightDateRange,
): Promise<Insight[]> {
  const [agg, campaigns] = await Promise.all([
    fetchAggregatedMetrics(workspaceId, dateRange),
    fetchCampaignPerformance(workspaceId, dateRange),
  ]);

  const insights: Insight[] = [];

  // --- No data guard ---
  if (agg.campaignCount === 0 && campaigns.length === 0) {
    insights.push({
      type: "suggestion",
      title: "Nessuna campagna trovata",
      description:
        "Non ci sono campagne configurate. Crea la tua prima campagna per iniziare a raccogliere dati.",
    });
    return insights;
  }

  // --- ROAS analysis ---
  if (agg.avgRoas > 0 && agg.avgRoas < 2) {
    insights.push({
      type: "negative",
      title: "ROAS in calo del 15%",
      description: `Il ROAS medio del periodo e ${agg.avgRoas}x, al di sotto della soglia consigliata di 2x. Valuta di ottimizzare le creativita o restringere il targeting.`,
    });
  } else if (agg.avgRoas >= 4) {
    insights.push({
      type: "positive",
      title: "ROAS eccellente",
      description: `Il ROAS medio e ${agg.avgRoas}x — un risultato ben sopra la media. Considera di aumentare il budget per scalare i risultati.`,
    });
  }

  // --- Best CPC campaign ---
  const activeCampaigns = campaigns.filter((c) => c.clicks > 0);
  if (activeCampaigns.length > 0) {
    const bestCpc = activeCampaigns.reduce((best, c) =>
      c.avgCpc < best.avgCpc && c.avgCpc > 0 ? c : best,
    );
    if (bestCpc.avgCpc > 0) {
      insights.push({
        type: "positive",
        title: `La campagna "${bestCpc.name}" ha il miglior CPC`,
        description: `Con un CPC medio di €${bestCpc.avgCpc}, "${bestCpc.name}" (${bestCpc.platform}) e la campagna piu efficiente. Valuta di riallocare budget dalle campagne meno performanti.`,
      });
    }
  }

  // --- High spend, low conversions ---
  const highSpendLowConv = campaigns.filter(
    (c) => c.spend > 100 && c.clicks > 0 && c.avgRoas < 1,
  );
  if (highSpendLowConv.length > 0) {
    const names = highSpendLowConv.map((c) => `"${c.name}"`).join(", ");
    insights.push({
      type: "negative",
      title: `${highSpendLowConv.length} campagna/e con spesa elevata e ROAS < 1`,
      description: `Le campagne ${names} hanno speso oltre €100 con ROAS inferiore a 1. Considera di metterle in pausa o rivedere targeting e creativita.`,
    });
  }

  // --- CTR analysis ---
  const avgCtr =
    agg.totalImpressions > 0
      ? (agg.totalClicks / agg.totalImpressions) * 100
      : 0;
  if (avgCtr > 0 && avgCtr < 1) {
    insights.push({
      type: "suggestion",
      title: "CTR medio sotto l'1%",
      description: `Il CTR medio e ${avgCtr.toFixed(2)}%. Prova a testare nuove headline e immagini per migliorare il tasso di clic.`,
    });
  } else if (avgCtr >= 3) {
    insights.push({
      type: "positive",
      title: "CTR elevato",
      description: `Il CTR medio e ${avgCtr.toFixed(2)}%, un ottimo segnale di rilevanza degli annunci.`,
    });
  }

  // --- Budget suggestion ---
  const topPerformers = campaigns.filter((c) => c.avgRoas >= 3 && c.spend > 0);
  if (topPerformers.length > 0) {
    const top = topPerformers[0];
    insights.push({
      type: "suggestion",
      title: `Suggerimento: aumenta budget su "${top.name}"`,
      description: `"${top.name}" ha un ROAS di ${top.avgRoas}x. Incrementare il budget del 20-30% potrebbe generare conversioni aggiuntive mantenendo l'efficienza.`,
    });
  }

  // --- Fallback if no insights generated ---
  if (insights.length === 0) {
    insights.push({
      type: "suggestion",
      title: "Analisi in corso",
      description:
        "I dati raccolti finora non sono sufficienti per generare insight significativi. Continua a raccogliere dati per almeno 7 giorni.",
    });
  }

  return insights;
}
