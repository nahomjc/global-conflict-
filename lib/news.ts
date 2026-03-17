const CONFLICT_KEYWORDS = [
  "missile",
  "drone",
  "airstrike",
  "strike",
  "attack",
  "conflict",
  "military",
  "shelling",
  "war",
  "clash",
  "offensive",
  "raid",
  "violence",
  "bomb",
  "artillery",
];

const TRUSTED_PUBLISHERS = new Set([
  "Reuters",
  "Associated Press",
  "AP News",
  "BBC News",
  "Al Jazeera",
  "The Washington Post",
  "The New York Times",
  "Financial Times",
  "The Wall Street Journal",
  "Bloomberg",
  "CNN",
  "The Guardian",
  "NPR",
  "Deutsche Welle",
  "France 24",
]);

const TRUSTED_DOMAINS = [
  "reuters.com",
  "apnews.com",
  "bbc.com",
  "aljazeera.com",
  "washingtonpost.com",
  "nytimes.com",
  "ft.com",
  "wsj.com",
  "bloomberg.com",
  "cnn.com",
  "theguardian.com",
  "npr.org",
  "dw.com",
  "france24.com",
];

const NEWS_FEEDS = [
  "https://feeds.reuters.com/Reuters/worldNews",
  "https://news.google.com/rss/search?q=global+conflict+missile+attack&hl=en-US&gl=US&ceid=US:en",
  "https://news.google.com/rss/search?q=military+drone+airstrike+war&hl=en-US&gl=US&ceid=US:en",
];
const RECENT_WINDOW_MS = Number(process.env.TRUSTED_NEWS_MAX_AGE_HOURS ?? 720) * 60 * 60 * 1000;

export interface NewsItem {
  headline: string;
  url: string;
  publisher: string;
  domain: string;
  trusted: boolean;
  publishedAt: string;
}

function stripXml(value: string) {
  return value
    .replace(/<!\[CDATA\[(.*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .trim();
}

function extractTag(block: string, tag: string) {
  const match = block.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? stripXml(match[1]) : "";
}

function cleanTitle(title: string) {
  return title.replace(/\s+-\s+[^-]+$/, "").trim();
}

function getDomain(url: string) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function detectPublisher(rawTitle: string, sourceTag: string, feedUrl: string) {
  if (sourceTag) {
    return sourceTag;
  }

  const fromTitle = rawTitle.match(/\s+-\s+([^-]+)$/)?.[1]?.trim();
  if (fromTitle) {
    return fromTitle;
  }

  if (feedUrl.includes("reuters.com")) {
    return "Reuters";
  }

  return "Unknown";
}

function isTrusted(publisher: string, domain: string) {
  if (TRUSTED_PUBLISHERS.has(publisher)) {
    return true;
  }
  return TRUSTED_DOMAINS.some((trustedDomain) => domain === trustedDomain || domain.endsWith(`.${trustedDomain}`));
}

function normalizePublishedAt(rawDate: string) {
  const ms = Date.parse(rawDate);
  return Number.isNaN(ms) ? "" : new Date(ms).toISOString();
}

function isRecentPublishedAt(publishedAt: string) {
  const ms = Date.parse(publishedAt);
  if (Number.isNaN(ms)) {
    return false;
  }
  return Date.now() - ms <= RECENT_WINDOW_MS;
}

function isWithinSinceYear(publishedAt: string, sinceYear: number) {
  const ms = Date.parse(publishedAt);
  if (Number.isNaN(ms)) {
    return true;
  }
  return ms >= Date.UTC(sinceYear, 0, 1);
}

function countrySearchFeeds(country: string, sinceYear?: number) {
  const dateFilter = typeof sinceYear === "number" ? ` after:${sinceYear}-01-01` : "";
  const queries = [
    `"${country}" (missile OR drone OR airstrike OR strike OR attack OR conflict OR war)${dateFilter}`,
    `"${country}" (military OR clashes OR offensive OR shelling OR bomb OR artillery)${dateFilter}`,
  ];
  return queries.map(
    (query) =>
      `https://news.google.com/rss/search?q=${encodeURIComponent(query.trim())}&hl=en-US&gl=US&ceid=US:en`,
  );
}

async function pullFromFeed(feedUrl: string): Promise<NewsItem[]> {
  try {
    const response = await fetch(feedUrl, { next: { revalidate: 600 } });
    if (!response.ok) {
      return [];
    }

    const xml = await response.text();
    const entries = Array.from(xml.matchAll(/<item>([\s\S]*?)<\/item>/g)).map((match) => match[1]);

    const parsed = entries
      .map((itemXml) => {
        const rawTitle = extractTag(itemXml, "title");
        const link = extractTag(itemXml, "link");
        const sourceTag = extractTag(itemXml, "source");
        const pubDate = extractTag(itemXml, "pubDate");
        const headline = cleanTitle(rawTitle);
        const publisher = detectPublisher(rawTitle, sourceTag, feedUrl);
        const domain = getDomain(link);
        return {
          headline,
          url: link,
          publisher,
          domain,
          trusted: isTrusted(publisher, domain),
          publishedAt: normalizePublishedAt(pubDate),
        };
      })
      .filter((item) => item.headline && item.url)
      .filter((item) => CONFLICT_KEYWORDS.some((keyword) => item.headline.toLowerCase().includes(keyword)));

    return parsed;
  } catch {
    return [];
  }
}

type FetchTrustedNewsOptions = {
  limit?: number;
  sinceYear?: number;
  country?: string;
  includeUntrusted?: boolean;
};

export async function fetchTrustedConflictNews(
  optionsOrLimit: number | FetchTrustedNewsOptions = 12,
): Promise<NewsItem[]> {
  const options: FetchTrustedNewsOptions =
    typeof optionsOrLimit === "number"
      ? { limit: optionsOrLimit }
      : optionsOrLimit;
  const limit = options.limit ?? 12;
  const sinceYear = options.sinceYear;
  const country = options.country?.trim();
  const includeUntrusted = options.includeUntrusted ?? false;

  const feedUrls = country
    ? [...countrySearchFeeds(country, sinceYear), ...NEWS_FEEDS]
    : NEWS_FEEDS;
  const merged = new Map<string, NewsItem>();

  for (const feedUrl of feedUrls) {
    const items = await pullFromFeed(feedUrl);
    for (const item of items) {
      const inRange =
        typeof sinceYear === "number"
          ? isWithinSinceYear(item.publishedAt, sinceYear)
          : isRecentPublishedAt(item.publishedAt);
      if ((item.trusted || includeUntrusted) && inRange) {
        merged.set(item.url, item);
      }
    }
    if (merged.size >= limit) {
      break;
    }
  }

  return Array.from(merged.values()).slice(0, limit);
}
