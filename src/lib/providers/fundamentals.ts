import { z } from "zod";
import { publicJson as json } from "./http";
export type Source = {
  id: string;
  url: string;
  retrievedAt: number;
  publishedAt: string | null;
  title: string;
};
export type Fundamentals = {
  symbol: string;
  mapping: "verified" | "unverified";
  metrics: Record<string, number | null>;
  sources: Source[];
  warnings: string[];
  news: { title: string; url: string; publishedAt: string }[];
  retrievedAt: number;
};
// 개별 검토한 계약 ID / 프로젝트 연결만 허용. 심볼 검색 결과를 자동 연결하지 않는다.
const mappings: Record<
  string,
  { id: string; domain: string; contract?: string; protocol?: string }
> = {
  BTCUSDT: { id: "bitcoin", domain: "bitcoin.org" },
  ETHUSDT: { id: "ethereum", domain: "ethereum.org" },
  SOLUSDT: { id: "solana", domain: "solana.com" },
  AAVEUSDT: {
    id: "aave",
    domain: "aave.com",
    contract: "0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9",
    protocol: "aave",
  },
};
const cache = new Map<string, Fundamentals>();
const nullable = z.number().finite().nonnegative().nullable().optional();
export async function getFundamentals(symbol: string): Promise<Fundamentals> {
  const old = cache.get(symbol);
  if (old && Date.now() - old.retrievedAt < 600000) return old;
  const result: Fundamentals = {
    symbol,
    mapping: "unverified",
    metrics: {},
    sources: [],
    warnings: [],
    news: [],
    retrievedAt: Date.now(),
  };
  const m = mappings[symbol];
  if (!m) {
    result.warnings.push("미확인 매핑: 펀더멘털 결론을 생략합니다.");
    return result;
  }
  try {
    const url = `https://api.coingecko.com/api/v3/coins/${m.id}?localization=false&tickers=false&community_data=false&developer_data=false`;
    const raw = await json(
      url,
      process.env.COINGECKO_DEMO_API_KEY
        ? { "x-cg-demo-api-key": process.env.COINGECKO_DEMO_API_KEY }
        : undefined,
    );
    const coin = z
      .object({
        id: z.string(),
        platforms: z.record(z.string(), z.string().nullable()),
        links: z.object({ homepage: z.array(z.string()) }),
        market_data: z.object({
          market_cap: z.object({ usd: nullable }),
          fully_diluted_valuation: z.object({ usd: nullable }),
          circulating_supply: nullable,
          total_supply: nullable,
          max_supply: nullable,
        }),
        last_updated: z.string().refine((v) => Number.isFinite(Date.parse(v))),
      })
      .parse(raw);
    const domainMatch = coin.links.homepage.some((h) => {
      try {
        const host = new URL(h).hostname;
        return host === m.domain || host === `www.${m.domain}`;
      } catch {
        return false;
      }
    });
    if (
      coin.id !== m.id ||
      !domainMatch ||
      (m.contract && coin.platforms.ethereum?.toLowerCase() !== m.contract)
    )
      throw Error("프로젝트 연결 검증 실패");
    result.mapping = "verified";
    result.metrics = {
      marketCapUSD: coin.market_data.market_cap.usd ?? null,
      fdvUSD: coin.market_data.fully_diluted_valuation.usd ?? null,
      circulatingSupply: coin.market_data.circulating_supply ?? null,
      totalSupply: coin.market_data.total_supply ?? null,
      maxSupply: coin.market_data.max_supply ?? null,
    };
    result.sources.push({
      id: "coingecko",
      url: `https://www.coingecko.com/en/coins/${m.id}`,
      title: "CoinGecko · 검토된 ID 및 공식 홈페이지 연결",
      retrievedAt: Date.now(),
      publishedAt: coin.last_updated,
    });
    if (Date.now() - Date.parse(coin.last_updated) > 86400000)
      result.warnings.push("CoinGecko 자료 24시간 이상 경과");
  } catch {
    result.warnings.push(
      "CoinGecko 연결/프로젝트 연결 검증 불가. 키 또는 제공자 정책을 확인하세요.",
    );
  }
  if (m.protocol && result.mapping === "verified") {
    try {
      // 검토된 protocol slug만 사용. 전체 이력 대신 작은 현재 TVL 응답을 조회한다.
      const value = z
        .number()
        .nonnegative()
        .parse(await json(`https://api.llama.fi/tvl/${m.protocol}`));
      result.metrics.tvlUSD = value;
      result.sources.push({
        id: "defillama",
        url: `https://defillama.com/protocol/${m.protocol}`,
        title: "DefiLlama · 프로토콜 전체 TVL",
        retrievedAt: Date.now(),
        publishedAt: null,
      });
    } catch {
      result.warnings.push("DefiLlama TVL 연결/매핑 검증 불가");
    }
    for (const metric of ["dailyFees", "dailyRevenue"] as const) {
      try {
        const url = `https://api.llama.fi/summary/fees/${m.protocol}?dataType=${metric}`;
        const data = z
          .object({
            total24h: z.number().nonnegative().nullable(),
          })
          .parse(await json(url));
        result.metrics[metric] = data.total24h;
        result.sources.push({
          id: metric,
          url: "https://defillama.com/fees/aave",
          title: `DefiLlama · ${metric} · 최근 24h`,
          retrievedAt: Date.now(),
          publishedAt: null,
        });
      } catch {
        result.metrics[metric] = null;
        result.warnings.push(`${metric} 자료 없음`);
      }
    }
    try {
      const raw = await json("https://governance.aave.com/latest.json");
      const data = z
        .object({
          topic_list: z.object({
            topics: z.array(
              z.object({
                id: z.number().int(),
                title: z.string().max(500),
                created_at: z.string(),
              }),
            ),
          }),
        })
        .parse(raw);
      result.news = data.topic_list.topics
        .filter((t) => !/(unlock|언락|잠금.?해제)/i.test(t.title))
        .slice(0, 3)
        .map((t) => ({
          title: t.title,
          url: `https://governance.aave.com/t/${t.id}`,
          publishedAt: t.created_at,
        }));
      for (const [i, n] of result.news.entries())
        result.sources.push({
          id: `news-${i}`,
          url: n.url,
          title: n.title,
          retrievedAt: Date.now(),
          publishedAt: n.publishedAt,
        });
    } catch {
      result.warnings.push("공식 거버넌스 최신 제목 자료 없음");
    }
  }
  if (cache.size >= 100) cache.delete(cache.keys().next().value!);
  cache.set(symbol, result);
  return result;
}
