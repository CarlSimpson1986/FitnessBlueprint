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
const PUBMED_TIMEOUT_MS = 5000;

export type PubMedArticle = {
  pmid: string;
  title: string;
  journal: string;
  pubDate: string;
  /** The abstract's Conclusion(s) section, as the authors wrote it. */
  conclusion: string;
  url: string;
};

const STOPWORDS = new Set(
  (
    "a an the is are was were be been being am do does did doing to of in on at for from by with about " +
    "into over after before between and or but if then so than too very can could should would will " +
    "i me my we our you your he she it they them this that these those what which who whom how why when " +
    "where there here best way good better much many more most some any per day days get got make should " +
    "really just also ok okay please tell know want need thing things take eat do use start stop go feel " +
    "try avoid week weeks times time often long beginner " +
    // Everyday words that narrowed searches to nothing or the wrong papers
    // ("is it bad to train when I'm sore" found smoking and COVID studies).
    "help helps helping bad good fine safe right normal needs enough doing getting going train training " +
    "exercise exercising gym session sessions workout workouts"
  ).split(" ")
);

/** Member words PubMed indexes under a different term. */
const SYNONYMS: Record<string, string> = {
  sore: "soreness",
  aching: "soreness",
  stretch: "stretching",
  stretches: "stretching",
  lifting: "resistance",
  weights: "resistance",
  cardio: "aerobic",
};

/**
 * PubMed searches literally — a member's whole sentence ("What is the best
 * way to warm up before heavy squats?") ANDs every word and finds nothing.
 * Keep the meaningful words ("warm up heavy squats").
 */
export function pubmedKeywords(question: string) {
  return question
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w))
    .map((w) => SYNONYMS[w] ?? w)
    .filter((w, i, all) => all.indexOf(w) === i)
    .slice(0, 6);
}

/**
 * searches: PubMed searches written for this question (writePubMedQuery in
 * claude.ts), best first. Without them, falls back to keywords picked out
 * of the question.
 */
export async function searchPubMed(
  query: string,
  maxResults = 5,
  searches?: string[] | null
): Promise<PubMedArticle[]> {
  const apiKey = serverEnv().PUBMED_API_KEY;
  const keyParam = apiKey ? `&api_key=${apiKey}` : "";

  const terms = searches?.length ? searches : [pubmedKeywords(query).join(" ")].filter(Boolean);
  if (terms.length === 0) return [];

  const signal = AbortSignal.timeout(PUBMED_TIMEOUT_MS);
  // Searches more than it keeps: only papers whose abstract has a labelled
  // Conclusion(s) section are used (see parseArticles). Systematic reviews
  // and meta-analyses only: the strongest evidence, and their abstracts
  // nearly always have one.
  const esearch = async (searchList: string[]): Promise<string[]> => {
    const either = searchList.map((words) => `(${words})`).join(" OR ");
    const url =
      `${EUTILS_BASE}/esearch.fcgi?db=pubmed&retmode=json&retmax=${maxResults * SEARCH_MULTIPLIER}&sort=relevance` +
      `&term=${encodeURIComponent(`(${either}) AND (systematic[sb] OR meta-analysis[pt])`)}${keyParam}`;
    const res = await fetch(url, { signal });
    if (!res.ok) {
      console.error("PubMed esearch failed:", res.status);
      return [];
    }
    const data = await res.json();
    return data?.esearchresult?.idlist ?? [];
  };

  // All searches in one request (PubMed allows 3 requests a second without
  // an API key, and a question already needs two). If that finds nothing,
  // once more on each search's first two words — never on "any word",
  // which is what pulled in unrelated papers.
  let ids = await esearch(terms.slice(0, 3));
  if (ids.length === 0) {
    const shorter = terms.slice(0, 3).map((words) => words.split(/\s+/).slice(0, 2).join(" "));
    if (shorter.join("|") !== terms.slice(0, 3).join("|")) ids = await esearch(shorter);
  }
  if (ids.length === 0) return [];

  // efetch returns the full records (title, journal, date, abstract) as XML.
  const fetchUrl = `${EUTILS_BASE}/efetch.fcgi?db=pubmed&retmode=xml&id=${ids.join(",")}${keyParam}`;
  const fetchRes = await fetch(fetchUrl, { signal });
  if (!fetchRes.ok) {
    console.error("PubMed efetch failed:", fetchRes.status);
    return [];
  }
  const byId = new Map(parseArticles(await fetchRes.text()).map((a) => [a.pmid, a]));

  // Keep PubMed's relevance order.
  return ids
    .map((id) => byId.get(id))
    .filter((a): a is PubMedArticle => a !== undefined)
    .slice(0, maxResults);
}

const SEARCH_MULTIPLIER = 2;
const MAX_CONCLUSION_CHARS = 700;

function decodeXml(text: string) {
  return text
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Pulls title, journal, year and the abstract's Conclusion(s) section out
 * of efetch XML. Articles without a labelled conclusion are dropped — Ted
 * bases research claims only on what authors concluded (Carl, 2026-10-05),
 * and guessing which sentence of an unstructured abstract is the
 * conclusion would undo that.
 */
export function parseArticles(xml: string): PubMedArticle[] {
  const articles: PubMedArticle[] = [];
  for (const [, block] of xml.matchAll(/<PubmedArticle>([\s\S]*?)<\/PubmedArticle>/g)) {
    const pmid = block!.match(/<PMID[^>]*>(\d+)<\/PMID>/)?.[1];
    if (!pmid) continue;
    const conclusion = [...block!.matchAll(/<AbstractText\b([^>]*)>([\s\S]*?)<\/AbstractText>/g)]
      .filter(([, attrs]) => /NlmCategory="CONCLUSIONS"|Label="CONCLUSIONS?"/i.test(attrs!))
      .map(([, , text]) => decodeXml(text!))
      .join(" ");
    if (!conclusion) continue;
    const title = block!.match(/<ArticleTitle[^>]*>([\s\S]*?)<\/ArticleTitle>/)?.[1];
    const journal =
      block!.match(/<ISOAbbreviation>([\s\S]*?)<\/ISOAbbreviation>/)?.[1] ??
      block!.match(/<Journal>[\s\S]*?<Title>([\s\S]*?)<\/Title>/)?.[1];
    const pubDate = block!.match(/<PubDate>[\s\S]*?<Year>(\d{4})<\/Year>/)?.[1] ?? block!.match(/<PubDate>[\s\S]*?<MedlineDate>(\d{4})/)?.[1];
    articles.push({
      pmid,
      title: title ? decodeXml(title) : "Untitled",
      journal: journal ? decodeXml(journal) : "Unknown journal",
      pubDate: pubDate ?? "",
      conclusion:
        conclusion.length > MAX_CONCLUSION_CHARS ? `${conclusion.slice(0, MAX_CONCLUSION_CHARS).trimEnd()}…` : conclusion,
      url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
    });
  }
  return articles;
}
