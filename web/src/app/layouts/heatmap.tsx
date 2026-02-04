import React, { useEffect, useMemo, useRef, useState } from "react";
import { buildAuthenticatedWebSocketUrl } from "./authentication-heatmap";
import "./heatmap.css";

/*
  HeatmapLayout.tsx — updated to use external CSS (HeatmapLayout.css).
  Dynamic per-tile values (position, size, background, padding, ticker font size)
  are still applied via the inline `style` prop using CSS variables so the layout
  engine can set values per-tile while all static styles move into CSS.
*/

/* ===================== TYPES ===================== */

interface SocketMessage<T = unknown> {
  type: string;
  data?: T;
}

type PriceEntry = {
  data: any;
  price?: number | null;
  priceChange24hr?: number | null;
};

type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
  key: string;
  price?: number | null;
  priceChange24hr?: number | null;
  category?: string;
};

/* ===================== CONSTANTS & THEME (tuned to image) ===================== */

const HEADER_HEIGHT = 52;
const SIDEBAR_WIDTH = 240;
const MIN_TILE = 22;
const HARD_RENDER_CAP = 700;

const FONT_STACK =
  '"Inter", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

const THEME = {
  appBg: "#0b1220",
  headerBg: "#0e1627",
  chromeBorder: "#1c2538",
  leftNavBg: "#0b1320",
  leftNavAccent: "#161d2b",
  tileNegativeBase: "#3c0c0c",
  tileNegativeBase2: "#2b0707",
  tilePositiveBase: "#0f5b27",
  tilePositiveBase2: "#083e1a",
  tileText: "#ffffff",
  tileSubtleText: "rgba(255,255,255,0.88)",
  categoryTintAlpha: 0.12,
  categoryPillAlpha: 0.22,
};

const catColorHsl = (idx: number) => {
  const hue = (idx * 47 + 12) % 360;
  return { hue, s: 64, l: 40 };
};
const catHsla = (idx: number, a = 1) => {
  const c = catColorHsl(idx);
  return `hsla(${c.hue}, ${c.s}%, ${c.l}%, ${a})`;
};

/* ===================== HELPERS ===================== */

const getNumericPrice = (d: any): number | null => {
  if (!d) return null;
  if (typeof d === "number") return d;
  if (typeof d === "string" && !isNaN(Number(d))) return Number(d);
  if (typeof d === "object") {
    for (const k of ["price", "last", "value", "p", "close"]) {
      const v = d[k];
      if (typeof v === "number") return v;
      if (typeof v === "string" && !isNaN(Number(v))) return Number(v);
    }
  }
  return null;
};

const computeWeight = (price?: number | null, change?: number | null) => {
  const p = Math.log10((price ?? 1) + 1);
  const c = Math.min(Math.abs(change ?? 0), 10) / 10;
  return Math.max(0.6, p * 0.5 + c * 1.4);
};

const safe = (n: number) => Math.max(MIN_TILE, Math.floor(n));

const formatNumber = (n?: number | null) =>
  n == null ? "—" : n.toLocaleString(undefined, { maximumFractionDigits: 6 });

const formatPct = (n?: number | null) =>
  n == null ? "—" : `${n.toFixed(2)}%`;

const heatBackground = (pct?: number | null) => {
  if (pct == null) {
    return `linear-gradient(180deg, rgba(255,255,255,0.02), rgba(0,0,0,0.06)), ${THEME.appBg}`;
  }
  if (pct >= 0) {
    const colorTop = THEME.tilePositiveBase;
    const colorBottom = THEME.tilePositiveBase2;
    return `linear-gradient(180deg, ${colorTop}, ${colorBottom})`;
  } else {
    const colorTop = THEME.tileNegativeBase;
    const colorBottom = THEME.tileNegativeBase2;
    return `linear-gradient(180deg, ${colorTop}, ${colorBottom})`;
  }
};

const tileBoxShadow = (pct?: number | null) =>
  pct == null
    ? "none"
    : pct >= 0
    ? "inset 0 -1px 0 rgba(0,0,0,0.25), 0 6px 20px rgba(8,88,40,0.12)"
    : "inset 0 -1px 0 rgba(0,0,0,0.25), 0 6px 20px rgba(76,12,12,0.12)";

/* ticker size scaled on screen size; mobileScale multiplies base sizes */
const tickerFontSizeForArea = (area: number, mobileScale = 1) => {
  if (area <= 900) return 12 * mobileScale;
  if (area <= 2500) return 14 * mobileScale;
  if (area <= 6000) return 16 * mobileScale;
  if (area <= 14000) return 24 * mobileScale;
  return 32 * mobileScale;
};

/* ===================== TREEMAP partition ===================== */

const partition = (
  items: Rect[],
  x: number,
  y: number,
  w: number,
  h: number,
  horizontal = true
): Rect[] => {
  if (!items.length) return [];
  if (items.length === 1) return [{ ...items[0], x, y, width: w, height: h }];

  const total = items.reduce(
    (s, it) => s + computeWeight(it.price, it.priceChange24hr),
    0
  );

  if (total <= 0) {
    const half = Math.floor(items.length / 2);
    return [
      ...partition(items.slice(0, half), x, y, Math.floor(w / 2), h, !horizontal),
      ...partition(items.slice(half), x + Math.floor(w / 2), y, Math.ceil(w / 2), h, !horizontal),
    ];
  }

  let acc = 0;
  let idx = 0;
  for (let i = 0; i < items.length; i++) {
    acc += computeWeight(items[i].price, items[i].priceChange24hr);
    if (acc >= total / 2) {
      idx = i;
      break;
    }
  }

  if (idx <= 0) idx = 0;
  if (idx >= items.length - 1) idx = items.length - 2;

  const a = items.slice(0, idx + 1);
  const b = items.slice(idx + 1);

  const aWeight = a.reduce(
    (s, it) => s + computeWeight(it.price, it.priceChange24hr),
    0
  );

  if (horizontal) {
    const wA = safe((w * aWeight) / total);
    return [
      ...partition(a, x, y, wA, h, !horizontal),
      ...partition(b, x + wA, y, safe(w - wA), h, !horizontal),
    ];
  } else {
    const hA = safe((h * aWeight) / total);
    return [
      ...partition(a, x, y, w, hA, !horizontal),
      ...partition(b, x, y + hA, w, safe(h - hA), !horizontal),
    ];
  }
};

/* ===================== Categories (unchanged heuristics) ===================== */

const FIXED_CATEGORIES = [
  "All",
  "Crypto",
  "Metals",
  "Commodities",
  "Equities",
  "ETF",
  "Indices",
  "FX",
  "Bonds",
  "Other",
];

const KNOWN_CRYPTO_TICKERS = new Set([
  "BTC", "ETH", "BNB", "ADA", "SOL", "DOT", "DOGE", "LTC", "XRP", "LINK",
  "MATIC", "AVAX", "ATOM", "TRX", "ALGO", "XLM", "FIL", "NEAR", "APT"
]);

const KNOWN_QUOTE_SUFFIXES = [
  "USD", "USDT", "USDC", "EUR", "GBP", "JPY", "BTC", "ETH", "BUSD", "TRY",
];

const METAL_IDENTIFIERS = ["XAU", "XAG", "GOLD", "SILVER", "XPT", "XPD", "PLATINUM", "PALLADIUM"];
const COMMODITY_IDENTIFIERS = [
  "WTI", "BRENT", "OIL", "NG", "GAS", "COPPER", "COFFEE", "CORN", "WHEAT", "SOY", "SUGAR", "COTTON",
];

const extractBaseSymbol = (key: string) => {
  if (!key) return key;
  const up = key.toUpperCase();

  const sepMatch = up.match(/^([A-Z0-9]+)[-_\/]/);
  if (sepMatch) return sepMatch[1];
  const dotMatch = up.match(/^([A-Z0-9]+)\./);
  if (dotMatch) return dotMatch[1];

  for (const q of KNOWN_QUOTE_SUFFIXES) {
    if (up.endsWith(q) && up.length > q.length) {
      return up.slice(0, up.length - q.length);
    }
  }
  return up;
};

const detectCategory = (d: any, key?: string): string => {
  const upKey = (key || "").toString().toUpperCase();

  const typeHints = (
    (d && (d.assetClass || d.asset_class || d.asset || d.type || d.instrumentType || d.category)) ||
    ""
  ).toString().toLowerCase();

  if (typeHints.includes("crypto") || typeHints.includes("digital")) return "Crypto";
  if (typeHints.includes("metal") || typeHints.includes("precious")) return "Metals";
  if (typeHints.includes("commodity") || typeHints.includes("commodities")) return "Commodities";
  if (typeHints.includes("etf")) return "ETF";
  if (typeHints.includes("equity") || typeHints.includes("stock")) return "Equities";
  if (typeHints.includes("index")) return "Indices";
  if (typeHints.includes("forex") || typeHints.includes("fx") || typeHints.includes("currency")) return "FX";
  if (typeHints.includes("bond") || typeHints.includes("treasury")) return "Bonds";

  const exchange = ((d && (d.exchange || d.exchangeName || d.market)) || "").toString().toLowerCase();
  if (exchange.includes("binance") || exchange.includes("coinbase") || exchange.includes("kraken")) {
    return "Crypto";
  }
  if (exchange.includes("nyse") || exchange.includes("nasdaq")) {
    return "Equities";
  }

  const base = extractBaseSymbol(upKey);
  if (!base) return "Other";

  for (const m of METAL_IDENTIFIERS) {
    if (base === m || upKey.includes(m)) return "Metals";
  }
  for (const c of COMMODITY_IDENTIFIERS) {
    if (base === c || upKey.includes(c)) return "Commodities";
  }
  if (KNOWN_CRYPTO_TICKERS.has(base)) return "Crypto";

  for (const q of KNOWN_QUOTE_SUFFIXES) {
    if (upKey.endsWith(q)) {
      const possibleBase = upKey.slice(0, upKey.length - q.length);
      if (KNOWN_CRYPTO_TICKERS.has(possibleBase)) return "Crypto";
    }
  }

  const name = ((d && (d.name || d.fullName || d.description)) || "").toString().toLowerCase();
  if (name.includes("bitcoin") || name.includes("ethereum") || name.includes("crypto")) return "Crypto";
  if (name.includes("gold") || name.includes("silver")) return "Metals";
  if (name.includes("oil") || name.includes("brent") || name.includes("wti")) return "Commodities";
  if (name.includes("etf")) return "ETF";
  if (name.match(/\binc\b|\bcorp\b|\bltd\b|\bcompany\b/) && !name.includes("fund")) return "Equities";
  if (name.includes("index")) return "Indices";

  if (/^[A-Z]{6}$/.test(upKey)) {
    const left = upKey.slice(0, 3);
    const right = upKey.slice(3, 6);
    const fiatCandidates = ["USD", "EUR", "GBP", "JPY", "AUD", "CAD", "CHF", "NZD", "CNY", "SGD"];
    if (fiatCandidates.includes(left) && fiatCandidates.includes(right)) return "FX";
  }
  if (upKey.includes("/")) {
    const parts = upKey.split("/");
    if (parts.length === 2) {
      const [a, b] = parts;
      const fiatCandidates = ["USD", "EUR", "GBP", "JPY", "AUD", "CAD", "CHF", "NZD", "CNY", "SGD"];
      if (fiatCandidates.includes(a) && fiatCandidates.includes(b)) return "FX";
    }
  }

  if (upKey.endsWith("ETF") || name.includes("etf")) return "ETF";
  return "Other";
};

/* ===================== COMPONENT ===================== */

export const HeatmapLayout: React.FC = () => {
  const treemapRef = useRef<HTMLDivElement | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  const [prices, setPrices] = useState<Record<string, PriceEntry>>({});
  const [size, setSize] = useState({ width: 1024, height: 720 });

  const [filters, setFilters] = useState({
    search: "",
    show: "all" as
      | "all"
      | "gainers"
      | "losers"
      | "topGainers"
      | "topLosers"
      | "highVol"
      | "lowVol",
    minChange: -100,
    maxChange: 100,
    minPrice: 0,
    maxPrice: Infinity,
    excludeStable: true,
    sortBy: "weight" as "weight" | "change" | "price",
    category: "All" as string | null,
  });

  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  // Responsiveness
  const [isMobile, setIsMobile] = useState<boolean>(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 900px)").matches : false
  );
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 900px)");
    const onChange = (ev: MediaQueryListEvent | MediaQueryList) => {
      setIsMobile(ev.matches);
      // close overlay sidebar when switching to desktop
      if (!ev.matches) {
        setSidebarOpen(false);
        document.body.style.overflow = "";
      }
    };
    mq.addEventListener ? mq.addEventListener("change", onChange) : mq.addListener(onChange);
    return () => {
      mq.removeEventListener ? mq.removeEventListener("change", onChange) : mq.removeListener(onChange);
    };
  }, []);

  // Body scroll lock when sidebar drawer open
  useEffect(() => {
    if (sidebarOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
  }, [sidebarOpen]);

  /* ---------- WEBSOCKET ---------- */

  useEffect(() => {
    let alive = true;

    const connect = async () => {
      try {
        const wsUrl = await buildAuthenticatedWebSocketUrl(
          "wss://oracle-app.zeeve.net/api/ws/prices"
        );
        const ws = new WebSocket(wsUrl.toString());
        socketRef.current = ws;

        ws.onmessage = (e) => {
          if (!alive) return;
          try {
            const msg = JSON.parse(e.data) as SocketMessage;
            if (msg.type !== "price_update") return;

            const d: any = msg.data;
            const key = (d.symbol ?? d.id ?? d.ticker)?.toString();
            if (!key) return;

            setPrices((p) => ({
              ...p,
              [key]: {
                data: d,
                price: getNumericPrice(d),
                priceChange24hr: Number(d.priceChange24h) || 0,
              },
            }));
          } catch (err) {
            // ignore parse errors
          }
        };

        ws.onerror = () => {
          // optional: reconnect/backoff
        };
      } catch (err) {
        // unable to build ws url
      }
    };

    connect();
    return () => {
      alive = false;
      try {
        socketRef.current?.close();
      } catch {}
      socketRef.current = null;
    };
  }, []);

  /* ---------- RESIZE (use ResizeObserver) ---------- */

  useEffect(() => {
    const el = treemapRef.current;
    if (!el) return;

    const update = () => {
      const r = el.getBoundingClientRect();
      setSize({ width: Math.max(10, r.width), height: Math.max(10, r.height) });
    };
    update();

    if (typeof ResizeObserver !== "undefined") {
      resizeObserverRef.current = new ResizeObserver(update);
      resizeObserverRef.current.observe(el);
    } else {
      window.addEventListener("resize", update);
    }

    return () => {
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
        resizeObserverRef.current = null;
      } else {
        window.removeEventListener("resize", update);
      }
    };
  }, [treemapRef, isMobile, sidebarOpen]);

  /* ---------- BUILD CATEGORIES LIST ---------- */

  const categories = useMemo(() => {
    const map = new Map<string, { count: number }>();

    Object.entries(prices).forEach(([k, v]) => {
      const cat = detectCategory(v.data, k);
      const prev = map.get(cat) ?? { count: 0 };
      prev.count++;
      map.set(cat, prev);
    });

    const out: { name: string; count: number; idx: number; color: string; colorBg: string }[] = [];
    FIXED_CATEGORIES.forEach((name, i) => {
      if (name === "All") {
        const total = Object.keys(prices).length;
        out.push({
          name,
          count: total,
          idx: i,
          color: catHsla(i, 1),
          colorBg: catHsla(i, THEME.categoryTintAlpha),
        });
      } else {
        const info = map.get(name);
        out.push({
          name,
          count: info ? info.count : 0,
          idx: i,
          color: catHsla(i, 1),
          colorBg: catHsla(i, THEME.categoryTintAlpha),
        });
      }
    });

    const extras = Array.from(map.entries())
      .filter(([name]) => !FIXED_CATEGORIES.includes(name))
      .sort((a, b) => b[1].count - a[1].count);

    extras.forEach(([name, info]) => {
      const idx = out.length;
      out.push({
        name,
        count: info.count,
        idx,
        color: catHsla(idx, 1),
        colorBg: catHsla(idx, THEME.categoryTintAlpha),
      });
    });

    return out;
  }, [prices]);

  /* ---------- FILTER PIPELINE ---------- */

  const entries = useMemo<Rect[]>(() => {
    let data: Rect[] = Object.entries(prices).map(([k, v]) => {
      const cat = detectCategory(v.data, k);
      return {
        key: k,
        price: v.price,
        priceChange24hr: v.priceChange24hr,
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        category: cat,
      };
    });

    data = data.filter((e) => {
      const pct = e.priceChange24hr ?? 0;
      const price = e.price ?? 0;

      if (filters.excludeStable && ["USDT", "USDC", "DAI", "BUSD", "TUSD"].some((s) => e.key.endsWith(s)))
        return false;

      if (filters.search && !e.key.toLowerCase().includes(filters.search.toLowerCase()))
        return false;

      if (filters.show === "gainers" && pct <= 0) return false;
      if (filters.show === "losers" && pct >= 0) return false;

      if (pct < filters.minChange || pct > filters.maxChange) return false;
      if (price < filters.minPrice || price > filters.maxPrice) return false;

      if (expandedCategory && expandedCategory !== "All") {
        return e.category === expandedCategory;
      }

      if (filters.category && filters.category !== "All" && e.category !== filters.category) return false;

      return true;
    });

    if (filters.show === "topGainers") {
      data = [...data]
        .sort((a, b) => (b.priceChange24hr ?? 0) - (a.priceChange24hr ?? 0))
        .slice(0, 30);
    }

    if (filters.show === "topLosers") {
      data = [...data]
        .sort((a, b) => (a.priceChange24hr ?? 0) - (b.priceChange24hr ?? 0))
        .slice(0, 30);
    }

    if (filters.show === "highVol") {
      data = [...data]
        .sort((a, b) => Math.abs(b.priceChange24hr ?? 0) - Math.abs(a.priceChange24hr ?? 0))
        .slice(0, 40);
    }

    if (filters.show === "lowVol") {
      data = data.filter((e) => Math.abs(e.priceChange24hr ?? 0) <= 1.5);
    }

    if (!["topGainers", "topLosers", "highVol"].includes(filters.show)) {
      if (filters.sortBy === "change") {
        data.sort((a, b) => Math.abs(b.priceChange24hr ?? 0) - Math.abs(a.priceChange24hr ?? 0));
      } else if (filters.sortBy === "price") {
        data.sort((a, b) => (b.price ?? 0) - (a.price ?? 0));
      } else {
        data.sort((a, b) => computeWeight(b.price, b.priceChange24hr) - computeWeight(a.price, a.priceChange24hr));
      }
    }

    return data.slice(0, HARD_RENDER_CAP);
  }, [prices, filters, expandedCategory]);

  /* layout correction: partition uses treemap inner size */
  const TREEMAP_PADDING = 12;

  const rects = useMemo(() => {
    const innerW = Math.max(10, size.width - TREEMAP_PADDING * 2);
    const innerH = Math.max(10, size.height - TREEMAP_PADDING * 2);
    return partition(entries, TREEMAP_PADDING, TREEMAP_PADDING, innerW, innerH);
  }, [entries, size]);

  /* keyboard handlers: Escape closes sidebar or expandedCategory */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (sidebarOpen) setSidebarOpen(false);
        if (expandedCategory) {
          setExpandedCategory(null);
          setFilters((f) => ({ ...f, category: "All" }));
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sidebarOpen, expandedCategory]);

  /* ===================== RENDER ===================== */

  // mobileScale reduces font sizes on smaller screens for readability
  const mobileScale = isMobile ? 0.72 : 1;

  return (
    <div className="heatmap-root" data-theme="dark">
      {/* HEADER */}
      <header className="heatmap-header">
        {isMobile && (
          <button
            aria-label="Open categories"
            onClick={() => setSidebarOpen(true)}
            className="heatmap-hamburger"
          >
            ☰
          </button>
        )}

        <div className="heatmap-title">Market Heatmap</div>

        <div className="heatmap-controls">
          {[
            ["all", "All"],
            ["gainers", "Gainers"],
            ["losers", "Losers"],
            ["lowVol", "Calm"],
          ].map(([v, label]) => (
            <button
              key={v}
              onClick={() => setFilters((f) => ({ ...f, show: v as any }))}
              className={`control-btn ${filters.show === v ? "selected" : ""}`}
              style={{ fontSize: 13 * mobileScale }}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="heatmap-header-right">
          {expandedCategory ? (
            <div className="expanded-info">
              <strong>{expandedCategory}</strong> (fullscreen)
              <button
                className="exit-fullscreen"
                onClick={() => {
                  setExpandedCategory(null);
                  setFilters((f) => ({ ...f, category: "All" }));
                }}
              >
                Exit Fullscreen
              </button>
            </div>
          ) : null}

          <label className="exclude-stables">
            <input
              type="checkbox"
              checked={filters.excludeStable}
              onChange={() => setFilters((f) => ({ ...f, excludeStable: !f.excludeStable }))}
            />
            Exclude Stables
          </label>

          <input
            placeholder="Search"
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
            className="heatmap-search"
            style={{ fontSize: 13 * mobileScale }}
          />
        </div>
      </header>

      {/* MAIN AREA */}
      <div className="heatmap-main">
        {/* SIDEBAR (desktop) or hidden when expandedCategory/fullscreen */}
        {!isMobile && !expandedCategory && (
          <aside className="heatmap-sidebar">
            <div className="sidebar-section">
              <div className="sidebar-title">Universe</div>

              <div className="sidebar-all">
                <button
                  className="all-btn"
                  onClick={() => {
                    setFilters((f) => ({ ...f, category: "All" }));
                    setExpandedCategory(null);
                  }}
                >
                  All ({Object.keys(prices).length})
                </button>
              </div>
            </div>

            <div className="sidebar-section">
              <div className="sidebar-subtitle">Categories</div>
              <div className="categories-list">
                {categories.length === 0 && <div className="no-categories">No categories</div>}
                {categories.map((c) => (
                  <div
                    key={c.name}
                    className={`category-row ${filters.category === c.name ? "active" : ""}`}
                    onClick={() => {
                      setFilters((f) => ({ ...f, category: c.name }));
                      if (c.name === "All") {
                        setExpandedCategory(null);
                      } else {
                        setExpandedCategory(c.name);
                      }
                    }}
                  >
                    <span className="category-swatch" style={{ background: c.color }} />
                    <div className="category-meta">
                      <div className="category-name">{c.name}</div>
                      <div className="category-count">{c.count} items</div>
                    </div>
                    <div className="category-count-right">{c.count}</div>
                  </div>
                ))}
              </div>
            </div>

            <hr className="sidebar-hr" />

            <div className="sidebar-section">
              <div className="sidebar-subtitle">Legend</div>
              <div className="sidebar-legend">
                Positive tiles = green, Negative tiles = burgundy. Categories represent asset types — not trading pairs.
              </div>
            </div>
          </aside>
        )}

        {/* MOBILE SIDEBAR DRAWER */}
        {isMobile && (
          <div
            role="dialog"
            aria-modal="true"
            className={`mobile-drawer ${sidebarOpen ? "open" : ""}`}
          >
            <div className="drawer-header">
              <div className="drawer-title">Categories</div>
              <button className="drawer-close" onClick={() => setSidebarOpen(false)}>✕</button>
            </div>

            <div className="drawer-body">
              <button
                className="drawer-all"
                onClick={() => {
                  setFilters((f) => ({ ...f, category: "All" }));
                  setExpandedCategory(null);
                  setSidebarOpen(false);
                }}
              >
                All ({Object.keys(prices).length})
              </button>

              <div className="drawer-cats">
                {categories.map((c) => (
                  <button
                    key={c.name}
                    className={`drawer-cat ${filters.category === c.name ? "active" : ""}`}
                    onClick={() => {
                      setFilters((f) => ({ ...f, category: c.name }));
                      setExpandedCategory(c.name === "All" ? null : c.name);
                      setSidebarOpen(false);
                    }}
                  >
                    <span className="drawer-cat-swatch" style={{ background: c.color }} />
                    <div className="drawer-cat-meta">
                      <div className="drawer-cat-name">{c.name}</div>
                      <div className="drawer-cat-count">{c.count} items</div>
                    </div>
                    <div className="drawer-cat-count-right">{c.count}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TREEMAP */}
        <div className="heatmap-treemap" style={{ padding: TREEMAP_PADDING }}>
          <div ref={treemapRef} className="treemap-inner">
            {rects.map((r) => {
              const area = r.width * r.height;
              const tickerFontSize = tickerFontSizeForArea(area, mobileScale);
              const catIdx = categories.findIndex((c) => c.name === r.category);
              const tint = catIdx >= 0 ? catHsla(catIdx, THEME.categoryTintAlpha) : "transparent";
              const pillBg = catIdx >= 0 ? catHsla(catIdx, THEME.categoryPillAlpha) : "rgba(255,255,255,0.03)";
              const heatBg = heatBackground(r.priceChange24hr);
              const background = `linear-gradient(180deg, ${tint}, ${tint}), ${heatBg}`;
              const boxShadow = tileBoxShadow(r.priceChange24hr);

              // Use CSS variables for per-tile dynamic values; cast to any to allow custom properties
              const tileStyle = {
                left: r.x,
                top: r.y,
                width: Math.max(0, r.width),
                height: Math.max(0, r.height),
                // custom properties:
                ["--tile-bg" as any]: background,
                ["--tile-padding" as any]: `${12 * mobileScale}px`,
                ["--ticker-font-size" as any]: `${tickerFontSize}px`,
                ["--tile-box-shadow" as any]: boxShadow,
                ["--pill-bg" as any]: pillBg,
              } as React.CSSProperties & Record<string, any>;

              return (
                <div
                  key={r.key}
                  className="treemap-tile"
                  title={`${r.key} — ${formatPct(r.priceChange24hr)}`}
                  style={tileStyle}
                >
                  <div className="tile-col">
                    <div className="tile-top">
                      <div className="tile-ticker">{r.key}</div>
                      {area > 5000 && (
                        <div className="tile-desc">
                          {(prices[r.key]?.data?.name || prices[r.key]?.data?.description) ?? ""}
                        </div>
                      )}
                    </div>

                    {area > 600 && (
                      <div className="tile-bottom">
                        <div className="tile-price-col">
                          <div className="tile-price">{area > 2000 ? `$${formatNumber(r.price)}` : ""}</div>
                          <div className="tile-pct">{formatPct(r.priceChange24hr)}</div>
                        </div>

                        <div className="tile-pill">{r.category ?? "Other"}</div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};