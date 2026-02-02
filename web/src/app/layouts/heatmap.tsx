import { useEffect, useMemo, useRef, useState } from "react";
import { buildAuthenticatedWebSocketUrl } from "./authentication-heatmap";

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
};

/* ===================== CONSTANTS ===================== */

const HEADER_HEIGHT = 48;
const MIN_TILE = 22; // 🔥 smaller tiles = more coins
const MAX_COINS = 220;

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
const tileGlow = (pct?: number | null) => {
  if (pct == null) return "none";

  return pct >= 0
    ? `
      inset 0 1px 0 rgba(255,255,255,0.12),
      0 0 0 1px rgba(34,197,94,0.35),
      0 8px 20px rgba(34,197,94,0.25)
    `
    : `
      inset 0 1px 0 rgba(255,255,255,0.08),
      0 0 0 1px rgba(239,68,68,0.35),
      0 8px 20px rgba(239,68,68,0.25)
    `;
};

const tileOverlay = (pct?: number | null) =>
  pct == null
    ? "none"
    : pct >= 0
    ? "linear-gradient(135deg, rgba(34,197,94,0.25), transparent)"
    : "linear-gradient(135deg, rgba(239,68,68,0.25), transparent)";

const heatColor = (pct?: number | null) => {
  if (pct == null) return "#1f2533";
  const i = Math.min(Math.abs(pct), 10) / 10;
  const l = 64 - i * 26;
  return pct >= 0
    ? `hsl(135, 60%, ${l}%)`
    : `hsl(0, 70%, ${l}%)`;
};

const formatNumber = (n?: number | null) =>
  n == null ? "—" : n.toLocaleString(undefined, { maximumFractionDigits: 6 });

const formatPct = (n?: number | null) =>
  n == null ? "—" : `${n.toFixed(2)}%`;

const safe = (n: number) => Math.max(MIN_TILE, Math.floor(n));

/* ===================== TREEMAP ===================== */

const partition = (
  items: Rect[],
  x: number,
  y: number,
  w: number,
  h: number,
  horizontal = true
): Rect[] => {
  if (!items.length) return [];
  if (items.length === 1)
    return [{ ...items[0], x, y, width: w, height: h }];

  const total = items.reduce(
    (s, it) => s + computeWeight(it.price, it.priceChange24hr),
    0
  );

  let acc = 0;
  let idx = 0;
  for (let i = 0; i < items.length; i++) {
    acc += computeWeight(items[i].price, items[i].priceChange24hr);
    if (acc >= total / 2) {
      idx = i;
      break;
    }
  }

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

/* ===================== COMPONENT ===================== */

export const HeatmapLayout: React.FC = () => {
  const fullscreenRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const socketRef = useRef<WebSocket | null>(null);

  const [prices, setPrices] = useState<Record<string, PriceEntry>>({});
  const [size, setSize] = useState({ width: 800, height: 520 });
  const [zoom, setZoom] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showHeader, setShowHeader] = useState(true);

  /* ---------- FULLSCREEN (MOBILE SAFE) ---------- */
// useEffect(() => {
//   document.body.style.fontFamily =
//     "'Lato', system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
//   document.body.style.webkitFontSmoothing = "antialiased";
// }, []);

  const toggleFullscreen = async () => {
    const el = fullscreenRef.current;
    if (!el) return;

    if (!document.fullscreenElement) {
      if (el.requestFullscreen) await el.requestFullscreen();
    } else {
      if (document.exitFullscreen) await document.exitFullscreen();
    }
  };

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () =>
      document.removeEventListener("fullscreenchange", onChange);
  }, []);

  /* Prevent body scroll */
  useEffect(() => {
    document.body.style.overflow = isFullscreen ? "hidden" : "";
  }, [isFullscreen]);

  /* ---------- AUTO-HIDE HEADER ---------- */

  useEffect(() => {
    if (!isFullscreen) {
      setShowHeader(true);
      return;
    }

    let t: any;
    const show = () => {
      setShowHeader(true);
      clearTimeout(t);
      t = setTimeout(() => setShowHeader(false), 2000);
    };

    show();
    window.addEventListener("mousemove", show);
    window.addEventListener("touchstart", show);

    return () => {
      clearTimeout(t);
      window.removeEventListener("mousemove", show);
      window.removeEventListener("touchstart", show);
    };
  }, [isFullscreen]);

  /* ---------- WEBSOCKET ---------- */

  useEffect(() => {
    let alive = true;

    const connect = async () => {
      const wsUrl = await buildAuthenticatedWebSocketUrl(
        "wss://oracle-app.zeeve.net/api/ws/prices"
      );
      const ws = new WebSocket(wsUrl.toString());
      socketRef.current = ws;

      ws.onmessage = (e) => {
        if (!alive) return;
        const msg = JSON.parse(e.data) as SocketMessage;
        if (msg.type !== "price_update") return;

        const d: any = msg.data;
        const key = d.symbol ?? d.id ?? d.ticker;
        if (!key) return;

        setPrices((p) => ({
          ...p,
          [key]: {
            data: d,
            price: getNumericPrice(d),
            priceChange24hr: Number(d.priceChange24h) || 0,
          },
        }));
      };
    };

    connect();
    return () => {
      alive = false;
      socketRef.current?.close();
    };
  }, []);

  /* ---------- RESIZE ---------- */

  useEffect(() => {
    const update = () => {
      if (!containerRef.current) return;
      const r = containerRef.current.getBoundingClientRect();
      setSize({ width: r.width, height: r.height });
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [isFullscreen]);

  /* ---------- DATA ---------- */

  const entries = useMemo<Rect[]>(() => {
    return Object.entries(prices)
      .map(([k, v]) => ({
        key: k,
        price: v.price,
        priceChange24hr: v.priceChange24hr,
        x: 0,
        y: 0,
        width: 0,
        height: 0,
      }))
      .sort(
        (a, b) =>
          computeWeight(b.price, b.priceChange24hr) -
          computeWeight(a.price, a.priceChange24hr)
      )
      .slice(0, MAX_COINS);
  }, [prices]);

  const rects = useMemo(
    () => partition(entries, 0, 0, size.width, size.height),
    [entries, size]
  );

  /* ===================== RENDER ===================== */

  return (
    <div
      ref={fullscreenRef}
      style={{
        width: "100%",
        height: isFullscreen ? "100vh" : "auto",
        background: "#0b1220",
        color: "#fff",
        transition: "opacity 300ms ease", // 🎬 fade-in
        fontFamily:
      "'Lato', system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        opacity: isFullscreen ? 1 : 1,
      }}
    >
      {/* HEADER */}
      <div
        style={{
          height: HEADER_HEIGHT,
          opacity: showHeader ? 1 : 0,
          pointerEvents: showHeader ? "auto" : "none",
          transition: "opacity 300ms ease",
          display: "flex",
          alignItems: "center",
          padding: "0 14px",
          background: "#0e1627",
          borderBottom: "1px solid #1c2538",
          fontSize: 12,
        }}
      >
        <span>Market Heatmap</span>

        <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
          <button onClick={() => setZoom((z) => Math.min(z + 0.1, 2))}>🔍+</button>
          <button onClick={() => setZoom((z) => Math.max(z - 0.1, 0.5))}>🔍-</button>
          <button onClick={toggleFullscreen}>
            {isFullscreen ? "🡼" : "⛶"}
          </button>
        </div>
      </div>

      {/* HEATMAP */}
      <div
        ref={containerRef}
        style={{
          height: isFullscreen
            ? `calc(100vh - ${HEADER_HEIGHT}px)`
            : 520,
          position: "relative",
          overflow: "hidden",
        }}
      >
       {rects.map((r) => {
  const area = r.width * r.height;

  const symbolFont = Math.max(12, Math.sqrt(area) / 6);
  const priceFont = Math.max(10, symbolFont * 0.55);
  const changeFont = Math.max(9, symbolFont * 0.45);

  return (
    <div
  key={r.key}
  style={{
    position: "absolute",
    left: r.x,
    top: r.y,
    width: r.width,
    height: r.height,
    background: heatColor(r.priceChange24hr),
    boxShadow: tileGlow(r.priceChange24hr),
    boxSizing: "border-box",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    padding: 6,
    borderRadius: 6,
    overflow: "hidden",
    transition: "transform 180ms ease, box-shadow 180ms ease",
  }}
>
  {/* OVERLAY GRADIENT */}
  <div
    style={{
      position: "absolute",
      inset: 0,
      background: tileOverlay(r.priceChange24hr),
      pointerEvents: "none",
      
    }}
  />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          lineHeight: 1.1,
          pointerEvents: "none",
          fontWeight: 900,
letterSpacing: 0.6,
        }}
      >
        {/* SYMBOL */}
        <div
          style={{
            fontWeight: 800,
            fontSize: symbolFont,
            letterSpacing: 0.5,
          }}
        >
          {r.key}
        </div>

        {/* PRICE */}
        <div
          style={{
            fontSize: priceFont,
            opacity: 0.95,
            marginTop: 2,
            fontWeight: 400,

          }}
        >
          {formatNumber(r.price)}
        </div>

        {/* CHANGE */}
        <div
          style={{
            fontSize: changeFont,
            opacity: 0.85,
            marginTop: 2,
            fontWeight: 700,

          }}
        >
          {formatPct(r.priceChange24hr)}
        </div>
      </div>
    </div>
  );
})}

      </div>
    </div>
  );
};
