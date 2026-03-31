export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body || "{}")
        : (req.body || {});

    const favorite = body.favorite || {
      type: "driver",
      name: "Fernando Alonso",
      team: "Aston Martin"
    };

    const queries = buildQueries(favorite);
    const allItems = [];

    for (const query of queries) {
      const rssUrl = buildGoogleNewsRssUrl(query);
      const response = await fetch(rssUrl);

      if (!response.ok) continue;

      const xml = await response.text();
      const items = parseRssItems(xml);

      allItems.push(...items);
    }

    const uniqueItems = dedupeNews(allItems).slice(0, 8);

    return res.status(200).json({
      favorite,
      items: uniqueItems
    });
  } catch (error) {
    return res.status(500).json({
      error: "Server error",
      message: error.message
    });
  }
}

function buildQueries(favorite) {
  if (favorite.type === "team") {
    const queries = [
      `"${favorite.name}" Formula 1`,
      `"${favorite.name}" F1`
    ];

    if (favorite.drivers) {
      const driverNames = favorite.drivers
        .split("·")
        .map(x => x.trim())
        .filter(Boolean);

      driverNames.forEach(name => {
        queries.push(`"${name}" "${favorite.name}" Formula 1`);
      });
    }

    return queries.slice(0, 4);
  }

  return [
    `"${favorite.name}" Formula 1`,
    `"${favorite.name}" "${favorite.team}" Formula 1`,
    `"${favorite.team}" Formula 1`
  ].slice(0, 4);
}

function buildGoogleNewsRssUrl(query) {
  const encoded = encodeURIComponent(query);
  return `https://news.google.com/rss/search?q=${encoded}&hl=es-419&gl=ES&ceid=ES:es-419`;
}

function parseRssItems(xml) {
  const matches = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)];

  return matches.map(match => {
    const block = match[1];

    const title = cleanText(extractTag(block, "title"));
    const link = cleanText(extractTag(block, "link"));
    const pubDate = cleanText(extractTag(block, "pubDate"));
    const source = extractSource(block) || getDomainFromUrl(link);

    return {
      title,
      link,
      pubDate,
      source
    };
  }).filter(item => item.title && item.link);
}

function extractTag(block, tag) {
  const regex = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i");
  const match = block.match(regex);
  return match ? match[1] : "";
}

function extractSource(block) {
  const match = block.match(/<source[^>]*>([\s\S]*?)<\/source>/i);
  return match ? cleanText(match[1]) : "";
}

function cleanText(text) {
  return decodeHtmlEntities(
    String(text || "")
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
      .replace(/<[^>]+>/g, "")
      .trim()
  );
}

function decodeHtmlEntities(text) {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#8217;/g, "’")
    .replace(/&#8211;/g, "–")
    .replace(/&#8230;/g, "…");
}

function getDomainFromUrl(url) {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    return hostname;
  } catch {
    return "News";
  }
}

function dedupeNews(items) {
  const seen = new Set();
  const result = [];

  for (const item of items) {
    const key = `${item.title}__${item.link}`.toLowerCase();

    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }

  return result;
}