import { serverEnv } from "@/lib/env";

/**
 * PubMed search via NCBI's E-utilities API. Free, no auth required,
 * though an API key (PUBMED_API_KEY) raises the rate limit from
 * 3 to 10 requests/second — get one at
 * https://www.ncbi.nlm.nih.gov/account/settings/
 */

const EUTILS_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";

export type PubMedArticle = {
  pmid: string;
  title: string;
  journal: string;
  pubDate: string;
  url: string;
};

export async function searchPubMed(
  query: string,
  maxResults = 5
): Promise<PubMedArticle[]> {
  const apiKey = serverEnv().PUBMED_API_KEY;
  const keyParam = apiKey ? `&api_key=${apiKey}` : "";

  const searchUrl =
    `${EUTILS_BASE}/esearch.fcgi?db=pubmed&retmode=json&retmax=${maxResults}` +
    `&term=${encodeURIComponent(query)}${keyParam}`;

  const searchRes = await fetch(searchUrl);
  if (!searchRes.ok) {
    console.error("PubMed esearch failed:", searchRes.status);
    return [];
  }
  const searchData = await searchRes.json();
  const ids: string[] = searchData?.esearchresult?.idlist ?? [];

  if (ids.length === 0) return [];

  const summaryUrl =
    `${EUTILS_BASE}/esummary.fcgi?db=pubmed&retmode=json` +
    `&id=${ids.join(",")}${keyParam}`;

  const summaryRes = await fetch(summaryUrl);
  if (!summaryRes.ok) {
    console.error("PubMed esummary failed:", summaryRes.status);
    return [];
  }
  const summaryData = await summaryRes.json();

  return ids
    .map((id) => {
      const doc = summaryData?.result?.[id];
      if (!doc) return null;
      return {
        pmid: id,
        title: doc.title ?? "Untitled",
        journal: doc.source ?? "Unknown journal",
        pubDate: doc.pubdate ?? "",
        url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
      };
    })
    .filter((a): a is PubMedArticle => a !== null);
}
