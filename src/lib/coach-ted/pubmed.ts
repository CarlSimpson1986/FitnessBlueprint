import { serverEnv } from "@/lib/env";

/**
 * PubMed search via NCBI's E-utilities API. Free, no auth required,
 * though an API key (PUBMED_API_KEY) raises the rate limit from
 * 3 to 10 requests/second — get one at
 * https://www.ncbi.nlm.nih.gov/account/settings/
 */

const EUTILS_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";

// PubMed is an extra, not a dependency — if NCBI is slow, Ted answers
// without it rather than keeping the member waiting.
const PUBMED_TIMEOUT_MS = 4000;

export type PubMedArticle = {
  pmid: string;
  title: string;
  journal: string;
  pubDate: string;
  url: string;
};

const STOPWORDS = new Set(
  (
    "a an the is are was were be been being am do does did doing to of in on at for from by with about " +
    "into over after before between and or but if then so than too very can could should would will " +
    "i me my we our you your he she it they them this that these those what which who whom how why when " +
    "where there here best way good better much many more most some any per day days get got make should " +
    "really just also ok okay please tell know want need thing things"
  ).split(" ")
);

/**
 * PubMed searches literally — a member's whole sentence ("What is the best
 * way to warm up before heavy squats?") ANDs every word and finds nothing.
 * Keep the meaningful words ("warm up heavy squats").
 */
export function pubmedQueryFrom(question: string) {
  const words = question
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
  return words.slice(0, 6).join(" ");
}

export async function searchPubMed(
  query: string,
  maxResults = 5
): Promise<PubMedArticle[]> {
  const apiKey = serverEnv().PUBMED_API_KEY;
  const keyParam = apiKey ? `&api_key=${apiKey}` : "";

  const term = pubmedQueryFrom(query);
  if (!term) return [];

  const searchUrl =
    `${EUTILS_BASE}/esearch.fcgi?db=pubmed&retmode=json&retmax=${maxResults}&sort=relevance` +
    `&term=${encodeURIComponent(term)}${keyParam}`;

  const signal = AbortSignal.timeout(PUBMED_TIMEOUT_MS);
  const searchRes = await fetch(searchUrl, { signal });
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

  const summaryRes = await fetch(summaryUrl, { signal });
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
