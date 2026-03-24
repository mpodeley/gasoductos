import { useEffect, useMemo, useRef, useState } from "react";
import snapshotData from "../data/processed/gcie-network-snapshot.json";

type RouteBase = {
  edgeId: string;
  ruta: string;
  origen: string;
  destino: string;
  gasoducto: string;
  sourceNodeId: string;
  targetNodeId: string;
  xOrigen: number;
  yOrigen: number;
  xDestino: number;
  yDestino: number;
  effectiveCapacity: number | null;
  activeLoopCount: number | null;
  sourceConfidence: string | null;
  topologyStatus: string | null;
};

type NodeBase = {
  nodeId: string;
  nombre: string;
  latitud: number;
  longitud: number;
  x: number;
  y: number;
  roleProxy: string;
  hasCompressor: boolean;
  sourceConfidence: string | null;
  topologyStatus: string | null;
};

type RouteMetric = {
  edgeId: string;
  caudal: number | null;
  capacidad: number | null;
  utilization: number | null;
};

type NodeMetric = {
  nodeId: string;
  nombre: string;
  roleProxy: string;
  observedInflow: number | null;
  observedOutflow: number | null;
  observedThroughput: number | null;
  sourceProxy: number | null;
  convSource: number | null;
  ncSource: number | null;
  boliviaSource: number | null;
  lngSource: number | null;
  sinkProxy: number | null;
  netProxy: number | null;
  supplyMethod: string | null;
};

type Snapshot = {
  date: string;
  stats: {
    routes: number;
    routesWithFlow: number;
    routesWithCapacity: number;
    totalFlow: number;
    totalCapacity: number;
    totalSourceProxy: number;
    totalSinkProxy: number;
    totalConvSource: number;
    totalNcSource: number;
    totalBoliviaSource: number;
    totalLngSource: number;
  };
  metrics: RouteMetric[];
  nodeMetrics: NodeMetric[];
};

type OutlinePoint = { x: number; y: number };
type OutlineDataset = { polygons: OutlinePoint[][] };

type Dataset = {
  latestDate: string;
  availableDates: string[];
  routes: RouteBase[];
  nodes: NodeBase[];
  snapshots: Snapshot[];
  outline: OutlineDataset;
};

type ProjectedNode = NodeBase & { px: number; py: number };
type DisplayRoute = RouteBase & {
  start: ProjectedNode;
  end: ProjectedNode;
  caudal: number | null;
  capacidad: number | null;
  utilization: number | null;
  strokeWidth: number;
};

type Transform = { scale: number; x: number; y: number };

const dataset = snapshotData as Dataset;
const CANVAS_WIDTH = 920;
const CANVAS_HEIGHT = 760;
const MIN_SCALE = 1;
const MAX_SCALE = 5;
const INITIAL_TRANSFORM: Transform = { scale: 1, x: 0, y: 0 };
const TIMELINE_AUTOPLAY_MS = 1400;
const HAS_ANY_NODE_METRICS = dataset.snapshots.some((snapshot) => snapshot.nodeMetrics.length > 0);

function formatNumber(value: number | null, digits = 2) {
  if (value == null || Number.isNaN(value)) return "Sin dato";
  return new Intl.NumberFormat("es-AR", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value);
}

function formatMonthLabel(value: string, options?: Intl.DateTimeFormatOptions) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return new Intl.DateTimeFormat("es-AR", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
    ...options,
  }).format(date);
}

function formatMm(value: number | null) {
  return value == null ? "Sin dato" : `${formatNumber(value)} MMm3/d`;
}

function utilizationColor(utilization: number | null) {
  if (utilization == null) return "#4b648b";
  if (utilization >= 1) return "#ff5f87";
  if (utilization >= 0.8) return "#ff9d4d";
  if (utilization >= 0.5) return "#ffe06d";
  return "#53e0a1";
}

function clampTransform(next: Transform) {
  if (next.scale <= MIN_SCALE) return INITIAL_TRANSFORM;
  const minX = CANVAS_WIDTH - CANVAS_WIDTH * next.scale;
  const minY = CANVAS_HEIGHT - CANVAS_HEIGHT * next.scale;
  return {
    scale: Math.min(MAX_SCALE, Math.max(MIN_SCALE, next.scale)),
    x: Math.min(0, Math.max(minX, next.x)),
    y: Math.min(0, Math.max(minY, next.y)),
  };
}

function useProjectedNetwork(nodes: NodeBase[], routes: RouteBase[], polygons: OutlinePoint[][]) {
  return useMemo(() => {
    const allPoints = [
      ...nodes.map((node) => ({ x: node.x, y: node.y })),
      ...polygons.flat(),
    ];
    const bounds = allPoints.reduce(
      (acc, point) => ({
        minX: Math.min(acc.minX, point.x),
        maxX: Math.max(acc.maxX, point.x),
        minY: Math.min(acc.minY, point.y),
        maxY: Math.max(acc.maxY, point.y),
      }),
      { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
    );
    const pad = 80;
    const scaleX = (CANVAS_WIDTH - pad * 2) / (bounds.maxX - bounds.minX || 1);
    const scaleY = (CANVAS_HEIGHT - pad * 2) / (bounds.maxY - bounds.minY || 1);
    const scale = Math.min(scaleX, scaleY);
    const usedWidth = (bounds.maxX - bounds.minX) * scale;
    const usedHeight = (bounds.maxY - bounds.minY) * scale;
    const offsetX = (CANVAS_WIDTH - usedWidth) / 2;
    const offsetY = (CANVAS_HEIGHT - usedHeight) / 2;

    const project = (x: number, y: number) => ({
      px: offsetX + (x - bounds.minX) * scale,
      py: CANVAS_HEIGHT - (offsetY + (y - bounds.minY) * scale),
    });

    const countryPath = polygons
      .map((polygon) =>
        polygon
          .map((point, index) => {
            const projected = project(point.x, point.y);
            return `${index === 0 ? "M" : "L"} ${projected.px.toFixed(1)} ${projected.py.toFixed(1)}`;
          })
          .join(" ")
      )
      .join(" Z ")
      .concat(" Z");

    const nodeMap = new Map(
      nodes.map((node) => [node.nodeId, { ...node, ...project(node.x, node.y) }])
    );

    const projectedRoutes = routes
      .map((route) => ({
        ...route,
        start: nodeMap.get(route.sourceNodeId)!,
        end: nodeMap.get(route.targetNodeId)!,
      }))
      .filter((route) => route.start && route.end);

    return {
      countryPath,
      nodes: Array.from(nodeMap.values()),
      routes: projectedRoutes,
      gasoductos: Array.from(new Set(routes.map((route) => route.gasoducto))).sort(),
    };
  }, [nodes, routes, polygons]);
}

export default function App() {
  const [selectedGasoducto, setSelectedGasoducto] = useState("Todos");
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [showCriticalOnly, setShowCriticalOnly] = useState(false);
  const [showSource, setShowSource] = useState(true);
  const [showConv, setShowConv] = useState(false);
  const [showNc, setShowNc] = useState(false);
  const [showBolivia, setShowBolivia] = useState(false);
  const [showLng, setShowLng] = useState(false);
  const [showSink, setShowSink] = useState(true);
  const [showObserved, setShowObserved] = useState(false);
  const [selectedDate, setSelectedDate] = useState(dataset.latestDate);
  const [isPlayingTimeline, setIsPlayingTimeline] = useState(false);
  const [transform, setTransform] = useState(INITIAL_TRANSFORM);
  const [isDragging, setIsDragging] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragState = useRef<{ x: number; y: number; moved: boolean } | null>(null);

  const network = useProjectedNetwork(dataset.nodes, dataset.routes, dataset.outline.polygons);

  const selectedSnapshot = useMemo(
    () => dataset.snapshots.find((snapshot) => snapshot.date === selectedDate) ?? dataset.snapshots.at(-1)!,
    [selectedDate]
  );
  const hasNodeData = selectedSnapshot.nodeMetrics.length > 0;

  const routeMetrics = useMemo(
    () => new Map(selectedSnapshot.metrics.map((metric) => [metric.edgeId, metric])),
    [selectedSnapshot]
  );

  const nodeMetrics = useMemo(
    () => new Map(selectedSnapshot.nodeMetrics.map((metric) => [metric.nodeId, metric])),
    [selectedSnapshot]
  );

  const datedRoutes = useMemo(() => {
    const maxCaudal = Math.max(...selectedSnapshot.metrics.map((metric) => metric.caudal ?? 0), 1);
    return network.routes.map((route) => {
      const metric = routeMetrics.get(route.edgeId);
      const caudal = metric?.caudal ?? null;
      return {
        ...route,
        caudal,
        capacidad: metric?.capacidad ?? route.effectiveCapacity ?? null,
        utilization: metric?.utilization ?? null,
        strokeWidth: 1.6 + ((caudal ?? 0) / maxCaudal) * 10,
      };
    });
  }, [network.routes, routeMetrics, selectedSnapshot.metrics]);

  const visibleRoutes = useMemo(
    () =>
      datedRoutes.filter((route) => {
        const gasoductoMatch = selectedGasoducto === "Todos" || route.gasoducto === selectedGasoducto;
        const criticalMatch = !showCriticalOnly || (route.utilization ?? 0) >= 0.8;
        return gasoductoMatch && criticalMatch;
      }),
    [datedRoutes, selectedGasoducto, showCriticalOnly]
  );

  const visibleNodes = useMemo(() => {
    const activeNodeIds = new Set<string>();
    visibleRoutes.forEach((route) => {
      activeNodeIds.add(route.sourceNodeId);
      activeNodeIds.add(route.targetNodeId);
    });
    return network.nodes.filter((node) => activeNodeIds.has(node.nodeId));
  }, [network.nodes, visibleRoutes]);

  const selectedRoute = useMemo(
    () => datedRoutes.find((route) => route.edgeId === selectedRouteId) ?? null,
    [datedRoutes, selectedRouteId]
  );

  const selectedNode = useMemo(
    () => network.nodes.find((node) => node.nodeId === selectedNodeId) ?? null,
    [network.nodes, selectedNodeId]
  );

  const selectedNodeMetric = useMemo(
    () => (selectedNode ? nodeMetrics.get(selectedNode.nodeId) ?? null : null),
    [nodeMetrics, selectedNode]
  );

  const busiestRoutes = useMemo(
    () =>
      [...visibleRoutes]
        .filter((route) => route.utilization != null)
        .sort((a, b) => (b.utilization ?? 0) - (a.utilization ?? 0))
        .slice(0, 6),
    [visibleRoutes]
  );

  const maxBubble = useMemo(
    () => ({
      source: Math.max(...selectedSnapshot.nodeMetrics.map((item) => item.sourceProxy ?? 0), 1),
      conv: Math.max(...selectedSnapshot.nodeMetrics.map((item) => item.convSource ?? 0), 1),
      nc: Math.max(...selectedSnapshot.nodeMetrics.map((item) => item.ncSource ?? 0), 1),
      bolivia: Math.max(...selectedSnapshot.nodeMetrics.map((item) => item.boliviaSource ?? 0), 1),
      lng: Math.max(...selectedSnapshot.nodeMetrics.map((item) => item.lngSource ?? 0), 1),
      sink: Math.max(...selectedSnapshot.nodeMetrics.map((item) => item.sinkProxy ?? 0), 1),
      observed: Math.max(...selectedSnapshot.nodeMetrics.map((item) => item.observedThroughput ?? 0), 1),
    }),
    [selectedSnapshot]
  );

  const highStressCount = useMemo(
    () => datedRoutes.filter((route) => (route.utilization ?? 0) >= 0.8).length,
    [datedRoutes]
  );

  const sourceBreakdown = useMemo(
    () => [
      { label: "Convencional", value: selectedSnapshot.stats.totalConvSource, accent: "#6b8e23" },
      { label: "No convencional", value: selectedSnapshot.stats.totalNcSource, accent: "#38b6e8" },
      { label: "Bolivia", value: selectedSnapshot.stats.totalBoliviaSource, accent: "#f0d080" },
      { label: "GNL", value: selectedSnapshot.stats.totalLngSource, accent: "#4c78a8" },
    ],
    [selectedSnapshot]
  );

  const topSources = useMemo(
    () =>
      [...selectedSnapshot.nodeMetrics]
        .filter((item) => (item.sourceProxy ?? 0) > 0)
        .sort((a, b) => (b.sourceProxy ?? 0) - (a.sourceProxy ?? 0))
        .slice(0, 6),
    [selectedSnapshot]
  );

  const topSinks = useMemo(
    () =>
      [...selectedSnapshot.nodeMetrics]
        .filter((item) => (item.sinkProxy ?? 0) > 0)
        .sort((a, b) => (b.sinkProxy ?? 0) - (a.sinkProxy ?? 0))
        .slice(0, 6),
    [selectedSnapshot]
  );

  const timelineMarks = useMemo(
    () =>
      dataset.availableDates
        .map((date, index) => ({ date, index }))
        .filter(({ date, index }) => {
          const month = Number(date.split("-")[1]);
          return index === 0 || month === 1 || index === dataset.availableDates.length - 1;
        }),
    []
  );

  useEffect(() => {
    if (!isPlayingTimeline) return;
    const intervalId = window.setInterval(() => {
      setSelectedDate((current) => {
        const currentIndex = dataset.availableDates.findIndex((date) => date === current);
        const nextIndex = currentIndex + 1;
        if (nextIndex >= dataset.availableDates.length) {
          window.clearInterval(intervalId);
          setIsPlayingTimeline(false);
          return current;
        }
        return dataset.availableDates[nextIndex];
      });
    }, TIMELINE_AUTOPLAY_MS);
    return () => window.clearInterval(intervalId);
  }, [isPlayingTimeline]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const handler = (event: WheelEvent) => {
      event.preventDefault();
      const factor = event.deltaY > 0 ? 0.9 : 1.12;
      const rect = svg.getBoundingClientRect();
      const pointerX = ((event.clientX - rect.left) / rect.width) * CANVAS_WIDTH;
      const pointerY = ((event.clientY - rect.top) / rect.height) * CANVAS_HEIGHT;
      setTransform((current) => {
        const nextScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, current.scale * factor));
        if (nextScale === current.scale) return current;
        return clampTransform({
          scale: nextScale,
          x: pointerX - (pointerX - current.x) * (nextScale / current.scale),
          y: pointerY - (pointerY - current.y) * (nextScale / current.scale),
        });
      });
    };
    svg.addEventListener("wheel", handler, { passive: false });
    return () => svg.removeEventListener("wheel", handler);
  }, []);

  function setDateByIndex(nextIndex: number) {
    const safeIndex = Math.max(0, Math.min(dataset.availableDates.length - 1, nextIndex));
    setSelectedDate(dataset.availableDates[safeIndex]);
  }

  function handlePointerDown(event: React.PointerEvent<SVGSVGElement>) {
    dragState.current = { x: event.clientX, y: event.clientY, moved: false };
  }

  function handlePointerMove(event: React.PointerEvent<SVGSVGElement>) {
    if (!dragState.current || transform.scale <= MIN_SCALE) return;
    const deltaX = event.clientX - dragState.current.x;
    const deltaY = event.clientY - dragState.current.y;
    const moved = dragState.current.moved || Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3;
    dragState.current = { x: event.clientX, y: event.clientY, moved };
    if (moved) setIsDragging(true);
    setTransform((current) =>
      clampTransform({ ...current, x: current.x + deltaX, y: current.y + deltaY })
    );
  }

  function handlePointerUp() {
    dragState.current = null;
    setIsDragging(false);
  }

  function bubbleRadius(value: number | null, maxValue: number, boost: number) {
    if (value == null || value <= 0) return 0;
    return 3 + Math.sqrt(value / maxValue) * boost;
  }

  return (
    <div className="app-shell">
      <div className="backdrop" />
      <header className="top-shell">
        <section className="hero-bar">
          <div className="control-copy">
            <p className="eyebrow">Sistema De Transporte De Gas En Argentina</p>
            <h1>Mapa operativo de gasoductos y fuentes</h1>
            <p className="lede">
              Visualizacion publica de la red de transporte de gas. Muestra el trazado de los gasoductos, el
              flujo mensual por tramo y, cuando estan disponibles, capas nodales de oferta y demanda.
            </p>
          </div>
          <div className="hero-stats">
            <MetricPill value={`${selectedSnapshot.stats.routesWithFlow}/${selectedSnapshot.stats.routes}`} label="Tramos con caudal" />
            <MetricPill value={formatMm(selectedSnapshot.stats.totalSourceProxy)} label="Source proxy" />
            <MetricPill value={formatMm(selectedSnapshot.stats.totalSinkProxy)} label="Sink proxy" />
            <MetricPill value={`${highStressCount}`} label="Tramos > 80%" />
          </div>
        </section>
        <section className="control-bar">
          <Legend />
          <div className="toolbar-spacer" />
          <label className="control-field">
            <span>Gasoducto</span>
            <select value={selectedGasoducto} onChange={(event) => setSelectedGasoducto(event.target.value)}>
              <option>Todos</option>
              {network.gasoductos.map((gasoducto) => (
                <option key={gasoducto}>{gasoducto}</option>
              ))}
            </select>
          </label>
          <label className="toggle control-field compact-toggle">
            <input type="checkbox" checked={showCriticalOnly} onChange={(event) => setShowCriticalOnly(event.target.checked)} />
            <span>Solo uso mayor a 80%</span>
          </label>
        </section>
      </header>

      <main className="layout">
        <section className="map-panel">
          <div className="panel-heading">
            <div>
              <h2>Red proyectada</h2>
              <p>
                Corte {formatMonthLabel(selectedDate)}. Actividad por tramo y, cuando existen datos nodales,
                burbujas de oferta, demanda y origen del gas.
              </p>
            </div>
            <div className="panel-badges">
              <span className="panel-badge">EPSG:3857</span>
              <span className="panel-badge">{formatMonthLabel(selectedDate)}</span>
              {!hasNodeData ? <span className="panel-badge">Sin datos nodales</span> : null}
            </div>
          </div>

          <div className="timeline-presets" style={{ margin: "10px 18px 0", flexWrap: "wrap" }}>
            <button type="button" className={showSource ? "is-active" : ""} onClick={() => setShowSource((v) => !v)} disabled={!HAS_ANY_NODE_METRICS}>Oferta</button>
            <button type="button" className={showConv ? "is-active" : ""} onClick={() => setShowConv((v) => !v)} disabled={!HAS_ANY_NODE_METRICS}>Convencional</button>
            <button type="button" className={showNc ? "is-active" : ""} onClick={() => setShowNc((v) => !v)} disabled={!HAS_ANY_NODE_METRICS}>No convencional</button>
            <button type="button" className={showBolivia ? "is-active" : ""} onClick={() => setShowBolivia((v) => !v)} disabled={!HAS_ANY_NODE_METRICS}>Bolivia</button>
            <button type="button" className={showLng ? "is-active" : ""} onClick={() => setShowLng((v) => !v)} disabled={!HAS_ANY_NODE_METRICS}>GNL</button>
            <button type="button" className={showSink ? "is-active" : ""} onClick={() => setShowSink((v) => !v)} disabled={!HAS_ANY_NODE_METRICS}>Demanda</button>
            <button type="button" className={showObserved ? "is-active" : ""} onClick={() => setShowObserved((v) => !v)} disabled={!HAS_ANY_NODE_METRICS}>Observado</button>
          </div>

          <div className="map-stage">
            <div className="map-controls">
              <button type="button" className="map-control" onClick={() => setTransform((current) => clampTransform({ scale: Math.min(MAX_SCALE, current.scale * 1.25), x: current.x - CANVAS_WIDTH * 0.125, y: current.y - CANVAS_HEIGHT * 0.125 }))}>+</button>
              <button type="button" className="map-control" onClick={() => setTransform((current) => clampTransform({ scale: Math.max(MIN_SCALE, current.scale / 1.25), x: current.x + CANVAS_WIDTH * 0.1, y: current.y + CANVAS_HEIGHT * 0.1 }))}>−</button>
              <button type="button" className="map-control map-control-fit" onClick={() => setTransform(INITIAL_TRANSFORM)}>Recentrar</button>
            </div>
            <svg
              ref={svgRef}
              viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`}
              className={`network-map ${isDragging ? "is-dragging" : ""}`}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
            >
              <rect x="0" y="0" width={CANVAS_WIDTH} height={CANVAS_HEIGHT} className="map-ocean" />
              <g transform={`translate(${transform.x} ${transform.y})`}>
                <g transform={`scale(${transform.scale})`}>
                  <path d={network.countryPath} className="country-fill" />
                  <rect x="30" y="30" width={CANVAS_WIDTH - 60} height={CANVAS_HEIGHT - 60} rx="30" className="map-frame" />
                  <path d={network.countryPath} className="country-outline" />

                  {visibleNodes.map((node) => {
                    const metric = nodeMetrics.get(node.nodeId);
                    if (!metric) return null;
                    const bubbles = [];
                    if (showObserved && (metric.observedThroughput ?? 0) > 0) {
                      bubbles.push(
                        <circle key={`${node.nodeId}-obs`} cx={node.px} cy={node.py} r={bubbleRadius(metric.observedThroughput, maxBubble.observed, 16)} fill="none" stroke="rgba(228,223,216,0.35)" strokeWidth={1.2} />
                      );
                    }
                    if (showSource && (metric.sourceProxy ?? 0) > 0) {
                      bubbles.push(
                        <circle key={`${node.nodeId}-src`} cx={node.px} cy={node.py} r={bubbleRadius(metric.sourceProxy, maxBubble.source, 24)} fill="rgba(232,168,56,0.18)" stroke="#e8a838" strokeWidth={1.4} />
                      );
                    }
                    if (showConv && (metric.convSource ?? 0) > 0) {
                      bubbles.push(
                        <circle key={`${node.nodeId}-conv`} cx={node.px} cy={node.py} r={bubbleRadius(metric.convSource, maxBubble.conv, 18)} fill="rgba(107,142,35,0.10)" stroke="#6b8e23" strokeWidth={1.1} />
                      );
                    }
                    if (showNc && (metric.ncSource ?? 0) > 0) {
                      bubbles.push(
                        <circle key={`${node.nodeId}-nc`} cx={node.px} cy={node.py} r={bubbleRadius(metric.ncSource, maxBubble.nc, 18)} fill="rgba(56,182,232,0.08)" stroke="#38b6e8" strokeWidth={1.2} strokeDasharray="2 3" />
                      );
                    }
                    if (showBolivia && (metric.boliviaSource ?? 0) > 0) {
                      bubbles.push(
                        <circle key={`${node.nodeId}-bol`} cx={node.px} cy={node.py} r={bubbleRadius(metric.boliviaSource, maxBubble.bolivia, 18)} fill="rgba(240,208,128,0.10)" stroke="#f0d080" strokeWidth={1.2} />
                      );
                    }
                    if (showLng && (metric.lngSource ?? 0) > 0) {
                      bubbles.push(
                        <circle key={`${node.nodeId}-lng`} cx={node.px} cy={node.py} r={bubbleRadius(metric.lngSource, maxBubble.lng, 18)} fill="rgba(76,120,168,0.10)" stroke="#4c78a8" strokeWidth={1.2} strokeDasharray="6 3" />
                      );
                    }
                    if (showSink && (metric.sinkProxy ?? 0) > 0) {
                      bubbles.push(
                        <circle key={`${node.nodeId}-sink`} cx={node.px} cy={node.py} r={bubbleRadius(metric.sinkProxy, maxBubble.sink, 22)} fill="rgba(255,95,135,0.12)" stroke="#ff5f87" strokeWidth={1.2} strokeDasharray="5 4" />
                      );
                    }
                    return (
                      <g key={`${node.nodeId}-bubbles`} onClick={(event) => { event.stopPropagation(); setSelectedNodeId(node.nodeId); setSelectedRouteId(null); }}>
                        {bubbles}
                      </g>
                    );
                  })}

                  {visibleRoutes.map((route) => (
                    <g key={route.edgeId} className="route-hit" onClick={(event) => { event.stopPropagation(); setSelectedRouteId(route.edgeId); setSelectedNodeId(null); }}>
                      <line
                        x1={route.start.px}
                        y1={route.start.py}
                        x2={route.end.px}
                        y2={route.end.py}
                        stroke={utilizationColor(route.utilization)}
                        strokeWidth={route.strokeWidth}
                        strokeLinecap="round"
                        opacity={selectedRoute && selectedRoute.edgeId !== route.edgeId ? 0.14 : 0.9}
                      />
                    </g>
                  ))}

                  {visibleNodes.map((node) => (
                    <g key={node.nodeId} className="node-group" onClick={(event) => { event.stopPropagation(); setSelectedNodeId(node.nodeId); setSelectedRouteId(null); }}>
                      <circle cx={node.px} cy={node.py} r={node.hasCompressor ? 4.2 : 3.4} className="node-dot" />
                      <text x={node.px + 6} y={node.py - 6} className="node-label" style={{ fontSize: `${9 / transform.scale}px` }}>
                        {node.nombre}
                      </text>
                    </g>
                  ))}
                </g>
              </g>
            </svg>
          </div>
          <p className="map-note">
            {hasNodeData
              ? "Vista estatica para GitHub Pages con datos mensuales de la red y capas nodales activas."
              : "Las capas nodales estan temporalmente desactivadas porque el snapshot actual no incluye datos de oferta y demanda por nodo."}
          </p>
        </section>

        <aside className="side-panel">
          <section className="detail-card detail-summary timeline-panel">
            <TimelineControls
              selectedDateLabel={formatMonthLabel(selectedDate, { month: "long", year: "numeric" })}
              selectedDateIndex={dataset.availableDates.findIndex((date) => date === selectedDate)}
              totalDates={dataset.availableDates.length}
              isPlayingTimeline={isPlayingTimeline}
              onStepBack={() => setDateByIndex(dataset.availableDates.findIndex((date) => date === selectedDate) - 1)}
              onTogglePlay={() => setIsPlayingTimeline((current) => !current)}
              onStepForward={() => setDateByIndex(dataset.availableDates.findIndex((date) => date === selectedDate) + 1)}
              onSliderChange={(value) => setDateByIndex(value)}
              timelineMarks={timelineMarks}
              availableDatesDescending={[...dataset.availableDates].reverse()}
              selectedDate={selectedDate}
              onDatePick={(date) => setSelectedDate(date)}
            />
          </section>

          <section className="detail-card inspector-card">
            <h3>Inspector</h3>
            {selectedNode && selectedNodeMetric ? (
              <NodeInspector node={selectedNode} metric={selectedNodeMetric} selectedDate={selectedDate} />
            ) : selectedRoute ? (
              <RouteInspector details={selectedRoute} selectedDate={selectedDate} />
            ) : (
              <div className="history-empty">
                <p className="empty-copy">Selecciona un nodo o un tramo en el mapa para abrir su inspector.</p>
                <div className="detail-grid summary-grid">
                  <Detail label="Source proxy" value={formatMm(selectedSnapshot.stats.totalSourceProxy)} />
                  <Detail label="Conv" value={formatMm(selectedSnapshot.stats.totalConvSource)} />
                  <Detail label="NC" value={formatMm(selectedSnapshot.stats.totalNcSource)} />
                  <Detail label="Sink proxy" value={formatMm(selectedSnapshot.stats.totalSinkProxy)} />
                </div>
              </div>
            )}
          </section>

          <section className="detail-card">
            <h3>Tramos mas exigidos</h3>
            <ul className="hot-list">
              {busiestRoutes.map((route) => (
                <li key={route.edgeId}>
                  <button type="button" onClick={() => { setSelectedRouteId(route.edgeId); setSelectedNodeId(null); }}>
                    <span>{route.ruta}</span>
                    <strong>{formatNumber((route.utilization ?? 0) * 100)}%</strong>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </main>

      <section className="balance-grid">
        <section className="detail-card balance-card">
          <h3>Balance de fuentes y sumideros</h3>
          <p className="balance-copy">
            Resumen nodal de {formatMonthLabel(selectedDate, { month: "long", year: "numeric" })}. La oferta y
            la demanda se expresan como volumen medio diario equivalente.
          </p>
          <div className="balance-kpis">
            <Detail label="Oferta total" value={formatMm(selectedSnapshot.stats.totalSourceProxy)} />
            <Detail label="Demanda total" value={formatMm(selectedSnapshot.stats.totalSinkProxy)} />
            <Detail
              label="Balance neto"
              value={formatMm(selectedSnapshot.stats.totalSourceProxy - selectedSnapshot.stats.totalSinkProxy)}
            />
            <Detail label="Nodos con datos" value={`${selectedSnapshot.nodeMetrics.length}`} />
          </div>
          <div className="balance-breakdown">
            {sourceBreakdown.map((item) => (
              <div key={item.label} className="balance-segment">
                <div className="balance-segment-head">
                  <span className="balance-dot" style={{ background: item.accent }} />
                  <strong>{item.label}</strong>
                </div>
                <span>{formatMm(item.value)}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="detail-card rankings-card">
          <h3>Nodos principales del mes</h3>
          <div className="balance-lists">
            <div>
              <p className="balance-list-title">Mayores fuentes</p>
              <ul className="balance-list">
                {topSources.map((item) => (
                  <li key={`${item.nodeId}-source`}>
                    <span>{item.nombre}</span>
                    <strong>{formatMm(item.sourceProxy)}</strong>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="balance-list-title">Mayores sumideros</p>
              <ul className="balance-list">
                {topSinks.map((item) => (
                  <li key={`${item.nodeId}-sink`}>
                    <span>{item.nombre}</span>
                    <strong>{formatMm(item.sinkProxy)}</strong>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      </section>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Legend() {
  return (
    <div className="legend">
      <div><i style={{ background: "#53e0a1" }} /> Bajo</div>
      <div><i style={{ background: "#ffe06d" }} /> Medio</div>
      <div><i style={{ background: "#ff9d4d" }} /> Alto</div>
      <div><i style={{ background: "#ff5f87" }} /> Saturado</div>
    </div>
  );
}

function MetricPill({ value, label }: { value: string; label: string }) {
  return (
    <div className="metric-pill">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function TimelineControls(props: {
  selectedDateLabel: string;
  selectedDateIndex: number;
  totalDates: number;
  isPlayingTimeline: boolean;
  onStepBack: () => void;
  onTogglePlay: () => void;
  onStepForward: () => void;
  onSliderChange: (value: number) => void;
  timelineMarks: Array<{ date: string; index: number }>;
  availableDatesDescending: string[];
  selectedDate: string;
  onDatePick: (date: string) => void;
}) {
  const {
    selectedDateLabel,
    selectedDateIndex,
    totalDates,
    isPlayingTimeline,
    onStepBack,
    onTogglePlay,
    onStepForward,
    onSliderChange,
    timelineMarks,
    availableDatesDescending,
    selectedDate,
    onDatePick,
  } = props;
  return (
    <section className="timeline-card" aria-label="Controles temporales">
      <div className="timeline-heading">
        <div>
          <span className="timeline-label">Fecha activa</span>
          <strong>{selectedDateLabel}</strong>
        </div>
        <span className="timeline-range">{selectedDateIndex + 1}/{totalDates}</span>
      </div>
      <div className="timeline-actions">
        <button type="button" className="timeline-step" onClick={onStepBack} disabled={selectedDateIndex <= 0}>Mes anterior</button>
        <button type="button" className="timeline-play" onClick={onTogglePlay}>{isPlayingTimeline ? "Pausar" : "Reproducir"}</button>
        <button type="button" className="timeline-step" onClick={onStepForward} disabled={selectedDateIndex >= totalDates - 1}>Mes siguiente</button>
      </div>
      <label className="timeline-slider">
        <span className="sr-only">Mover en la serie mensual</span>
        <input type="range" min={0} max={totalDates - 1} step={1} value={selectedDateIndex} onChange={(event) => onSliderChange(Number(event.target.value))} />
      </label>
      <div className="timeline-marks" aria-hidden="true">
        {timelineMarks.map((mark) => (
          <span key={mark.date} style={{ left: `${(mark.index / (totalDates - 1)) * 100}%` }}>
            {formatMonthLabel(mark.date, { year: "numeric" })}
          </span>
        ))}
      </div>
      <div className="timeline-presets">
        {availableDatesDescending.slice(0, 4).map((date) => (
          <button key={date} type="button" className={date === selectedDate ? "is-active" : ""} onClick={() => onDatePick(date)}>
            {formatMonthLabel(date)}
          </button>
        ))}
      </div>
    </section>
  );
}

function RouteInspector({ details, selectedDate }: { details: DisplayRoute; selectedDate: string }) {
  return (
    <div className="route-inspector">
      <div className="inspector-head">
        <div>
          <p className="history-title">{details.ruta}</p>
          <p className="inspector-subtitle">{details.origen} → {details.destino}</p>
        </div>
        <span className="inspector-chip">{details.gasoducto}</span>
      </div>
      <div className="inspector-stats">
        <Detail label="Fecha" value={formatMonthLabel(selectedDate)} />
        <Detail label="Caudal" value={formatMm(details.caudal)} />
        <Detail label="Capacidad" value={formatMm(details.capacidad)} />
        <Detail label="Utilizacion" value={details.utilization == null ? "Sin dato" : `${formatNumber(details.utilization * 100)}%`} />
      </div>
    </div>
  );
}

function NodeInspector({ node, metric, selectedDate }: { node: ProjectedNode; metric: NodeMetric; selectedDate: string }) {
  return (
    <div className="route-inspector">
      <div className="inspector-head">
        <div>
          <p className="history-title">{node.nombre}</p>
          <p className="inspector-subtitle">{node.roleProxy}</p>
        </div>
        <span className="inspector-chip">{formatMonthLabel(selectedDate)}</span>
      </div>
      <div className="inspector-stats">
        <Detail label="Source proxy" value={formatMm(metric.sourceProxy)} />
        <Detail label="Sink proxy" value={formatMm(metric.sinkProxy)} />
        <Detail label="Net" value={formatMm(metric.netProxy)} />
        <Detail label="Observed throughput" value={formatMm(metric.observedThroughput)} />
        <Detail label="Conv" value={formatMm(metric.convSource)} />
        <Detail label="NC" value={formatMm(metric.ncSource)} />
        <Detail label="Bolivia" value={formatMm(metric.boliviaSource)} />
        <Detail label="LNG" value={formatMm(metric.lngSource)} />
      </div>
      <div className="detail-grid summary-grid">
        <Detail label="Metodo" value={metric.supplyMethod || "Sin dato"} />
        <Detail label="Nodo" value={node.nodeId} />
        <Detail label="Lat" value={formatNumber(node.latitud, 2)} />
        <Detail label="Lon" value={formatNumber(node.longitud, 2)} />
      </div>
    </div>
  );
}
