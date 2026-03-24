import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const OUTPUT_ROOT = "data";
const RAW_DIR = join(OUTPUT_ROOT, "raw");
const PROCESSED_DIR = join(OUTPUT_ROOT, "processed");
const MERCATOR_RADIUS = 6378137;

const RESOURCE_KEY = "948aa3aa-1c05-4cc3-b68c-6dd65a53c694";
const MODEL_ID = 11730893;
const API_ROOT = "https://wabi-south-central-us-api.analysis.windows.net/public/reports";
const ARGENTINA_OUTLINE = [
  [
    [-65.5, -55.2],
    [-66.45, -55.25],
    [-66.95992, -54.89681],
    [-67.56244, -54.87001],
    [-68.63335, -54.8695],
    [-68.63401, -52.63637],
    [-68.25, -53.1],
    [-67.75, -53.85],
    [-66.45, -54.45],
    [-65.05, -54.7],
    [-65.5, -55.2]
  ],
  [
    [-64.964892, -22.075862],
    [-64.377021, -22.798091],
    [-63.986838, -21.993644],
    [-62.846468, -22.034985],
    [-62.685057, -22.249029],
    [-60.846565, -23.880713],
    [-60.028966, -24.032796],
    [-58.807128, -24.771459],
    [-57.777217, -25.16234],
    [-57.63366, -25.603657],
    [-58.618174, -27.123719],
    [-57.60976, -27.395899],
    [-56.486702, -27.548499],
    [-55.695846, -27.387837],
    [-54.788795, -26.621786],
    [-54.625291, -25.739255],
    [-54.13005, -25.547639],
    [-53.628349, -26.124865],
    [-53.648735, -26.923473],
    [-54.490725, -27.474757],
    [-55.162286, -27.881915],
    [-56.2909, -28.852761],
    [-57.625133, -30.216295],
    [-57.874937, -31.016556],
    [-58.14244, -32.044504],
    [-58.132648, -33.040567],
    [-58.349611, -33.263189],
    [-58.427074, -33.909454],
    [-58.495442, -34.43149],
    [-57.22583, -35.288027],
    [-57.362359, -35.97739],
    [-56.737487, -36.413126],
    [-56.788285, -36.901572],
    [-57.749157, -38.183871],
    [-59.231857, -38.72022],
    [-61.237445, -38.928425],
    [-62.335957, -38.827707],
    [-62.125763, -39.424105],
    [-62.330531, -40.172586],
    [-62.145994, -40.676897],
    [-62.745803, -41.028761],
    [-63.770495, -41.166789],
    [-64.73209, -40.802677],
    [-65.118035, -41.064315],
    [-64.978561, -42.058001],
    [-64.303408, -42.359016],
    [-63.755948, -42.043687],
    [-63.458059, -42.563138],
    [-64.378804, -42.873558],
    [-65.181804, -43.495381],
    [-65.328823, -44.501366],
    [-65.565269, -45.036786],
    [-66.509966, -45.039628],
    [-67.293794, -45.551896],
    [-67.580546, -46.301773],
    [-66.597066, -47.033925],
    [-65.641027, -47.236135],
    [-65.985088, -48.133289],
    [-67.166179, -48.697337],
    [-67.816088, -49.869669],
    [-68.728745, -50.264218],
    [-69.138539, -50.73251],
    [-68.815561, -51.771104],
    [-68.149995, -52.349983],
    [-68.571545, -52.299444],
    [-69.498362, -52.142761],
    [-71.914804, -52.009022],
    [-72.329404, -51.425956],
    [-72.309974, -50.67701],
    [-72.975747, -50.74145],
    [-73.328051, -50.378785],
    [-73.415436, -49.318436],
    [-72.648247, -48.878618],
    [-72.331161, -48.244238],
    [-72.447355, -47.738533],
    [-71.917258, -46.884838],
    [-71.552009, -45.560733],
    [-71.659316, -44.973689],
    [-71.222779, -44.784243],
    [-71.329801, -44.407522],
    [-71.793623, -44.207172],
    [-71.464056, -43.787611],
    [-71.915424, -43.408565],
    [-72.148898, -42.254888],
    [-71.746804, -42.051386],
    [-71.915734, -40.832339],
    [-71.680761, -39.808164],
    [-71.413517, -38.916022],
    [-70.814664, -38.552995],
    [-71.118625, -37.576827],
    [-71.121881, -36.658124],
    [-70.364769, -36.005089],
    [-70.388049, -35.169688],
    [-69.817309, -34.193571],
    [-69.814777, -33.273886],
    [-70.074399, -33.09121],
    [-70.535069, -31.36501],
    [-69.919008, -30.336339],
    [-70.01355, -29.367923],
    [-69.65613, -28.459141],
    [-69.001235, -27.521214],
    [-68.295542, -26.89934],
    [-68.5948, -26.506909],
    [-68.386001, -26.185016],
    [-68.417653, -24.518555],
    [-67.328443, -24.025303],
    [-66.985234, -22.986349],
    [-67.106674, -22.735925],
    [-66.273339, -21.83231],
    [-64.964892, -22.075862]
  ]
];

function makeHeaders() {
  return {
    Accept: "application/json",
    ActivityId: randomUUID(),
    RequestId: randomUUID(),
    "Content-Type": "application/json",
    "X-PowerBI-ResourceKey": RESOURCE_KEY
  };
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }

  return response.json();
}

async function fetchModelsAndExploration() {
  return fetchJson(
    `${API_ROOT}/${RESOURCE_KEY}/modelsAndExploration?preferReadOnlySession=true`,
    { headers: makeHeaders() }
  );
}

async function fetchConceptualSchema() {
  return fetchJson(`${API_ROOT}/${RESOURCE_KEY}/conceptualschema`, {
    headers: makeHeaders()
  });
}

function buildColumn(source, property, name) {
  return {
    Column: {
      Expression: {
        SourceRef: { Source: source }
      },
      Property: property
    },
    Name: name
  };
}

function buildAggregation(source, property, fn, name) {
  return {
    Aggregation: {
      Expression: {
        Column: {
          Expression: {
            SourceRef: { Source: source }
          },
          Property: property
        }
      },
      Function: fn
    },
    Name: name
  };
}

function buildDateEqualsCondition(source, property, isoDate) {
  return {
    Condition: {
      Comparison: {
        ComparisonKind: 0,
        Left: {
          Column: {
            Expression: {
              SourceRef: { Source: source }
            },
            Property: property
          }
        },
        Right: {
          Literal: {
            Value: `datetime'${isoDate}T00:00:00'`
          }
        }
      }
    }
  };
}

async function queryData({ from, select, where = [], projections, top = 500 }) {
  const body = {
    version: "1.0.0",
    queries: [
      {
        Query: {
          Commands: [
            {
              SemanticQueryDataShapeCommand: {
                Query: {
                  Version: 2,
                  From: from,
                  Select: select,
                  ...(where.length > 0 ? { Where: where } : {})
                },
                Binding: {
                  Primary: {
                    Groupings: [
                      {
                        Projections: projections
                      }
                    ]
                  },
                  DataReduction: {
                    DataVolume: 3,
                    Primary: {
                      Top: {
                        Count: top
                      }
                    }
                  },
                  Version: 1
                },
                ExecutionMetricsKind: 1
              }
            }
          ]
        }
      }
    ],
    modelId: MODEL_ID
  };

  return fetchJson(`${API_ROOT}/querydata?synchronous=true`, {
    method: "POST",
    headers: makeHeaders(),
    body: JSON.stringify(body)
  });
}

function decodeValue(raw, schemaEntry, valueDicts) {
  if (raw == null) {
    return null;
  }

  if (schemaEntry?.DN) {
    return valueDicts?.[schemaEntry.DN]?.[raw] ?? raw;
  }

  if (schemaEntry?.T === 7) {
    return new Date(raw).toISOString().slice(0, 10);
  }

  if (schemaEntry?.T === 3 || schemaEntry?.T === 4) {
    return typeof raw === "number" ? raw : Number(raw);
  }

  return fixMojibake(raw);
}

function fixMojibake(value) {
  if (typeof value !== "string") {
    return value;
  }

  if (!/[ÃÂ]/.test(value)) {
    return value;
  }

  try {
    return Buffer.from(value, "latin1").toString("utf8");
  } catch {
    return value;
  }
}

function parseDsrRows(queryResult) {
  const ds = queryResult.results[0]?.result?.data?.dsr?.DS?.[0];
  const rowSet = ds?.PH?.[0]?.DM0 ?? [];

  if (rowSet.length === 0) {
    return [];
  }

  const schema = rowSet[0].S;
  const valueDicts = ds.ValueDicts ?? {};
  const rows = [];
  let previous = new Array(schema.length).fill(null);

  for (const entry of rowSet) {
    const current = [];

    if (!("C" in entry)) {
      for (let index = 0; index < schema.length; index += 1) {
        const schemaEntry = schema[index];
        current.push(decodeValue(entry[schemaEntry.N], schemaEntry, valueDicts));
      }
    } else {
      const compressed = entry.C ?? [];
      const repeatMask = entry.R ?? 0;
      let cursor = 0;

      for (let index = 0; index < schema.length; index += 1) {
        const shouldRepeat = (repeatMask & (1 << index)) !== 0;
        const value = shouldRepeat ? previous[index] : compressed[cursor++];
        current.push(decodeValue(value, schema[index], valueDicts));
      }
    }

    rows.push(current);
    previous = current;
  }

  return rows;
}

function rowsToObjects(rows, keys) {
  return rows.map((row) =>
    Object.fromEntries(keys.map((key, index) => [key, row[index] ?? null]))
  );
}

async function getAvailableDates() {
  const payload = await queryData({
    from: [{ Name: "h", Entity: "Fechas", Type: 0 }],
    select: [buildColumn("h", "Fecha", "Fechas.Fecha")],
    projections: [0],
    top: 2000
  });

  return parseDsrRows(payload)
    .map((row) => row[0])
    .filter(Boolean)
    .sort();
}

async function getRoutes() {
  const payload = await queryData({
    from: [{ Name: "b", Entity: "BaseRutas", Type: 0 }],
    select: [
      buildColumn("b", "Ruta", "BaseRutas.Ruta"),
      buildColumn("b", "Origen", "BaseRutas.Origen"),
      buildColumn("b", "Destino", "BaseRutas.Destino"),
      buildColumn("b", "Gasoducto", "BaseRutas.Gasoducto"),
      buildColumn("b", "Latitud Origen", "BaseRutas.Latitud Origen"),
      buildColumn("b", "Longitud Origen", "BaseRutas.Longitud Origen"),
      buildColumn("b", "Latitud Destino", "BaseRutas.Latitud Destino"),
      buildColumn("b", "Longitud Destino", "BaseRutas.Longitud Destino")
    ],
    projections: [0, 1, 2, 3, 4, 5, 6, 7],
    top: 100
  });

  return rowsToObjects(parseDsrRows(payload), [
    "ruta",
    "origen",
    "destino",
    "gasoducto",
    "latitudOrigen",
    "longitudOrigen",
    "latitudDestino",
    "longitudDestino"
  ]);
}

async function getAllFlows() {
  throw new Error("Use getMonthlyFlows instead");
}

async function getAllCapacity() {
  throw new Error("Use getMonthlyCapacity instead");
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await mapper(items[index], index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker())
  );

  return results;
}

async function getFlowsForDate(date) {
  const payload = await queryData({
    from: [{ Name: "f", Entity: "Flujos", Type: 0 }],
    select: [
      buildColumn("f", "Fecha", "Flujos.Fecha"),
      buildColumn("f", "Ruta", "Flujos.Ruta"),
      buildColumn("f", "Caudal", "Flujos.Caudal"),
      buildColumn("f", "F-CF", "Flujos.F-CF"),
      buildColumn("f", "Flujo-ContrFlujo", "Flujos.Flujo-ContrFlujo")
    ],
    where: [buildDateEqualsCondition("f", "Fecha", date)],
    projections: [0, 1, 2, 3, 4],
    top: 500
  });

  return rowsToObjects(parseDsrRows(payload), [
    "fecha",
    "ruta",
    "caudal",
    "fcf",
    "sentido"
  ]);
}

async function getCapacityForDate(date) {
  const payload = await queryData({
    from: [{ Name: "c", Entity: "Capacidad", Type: 0 }],
    select: [
      buildColumn("c", "Fecha", "Capacidad.Fecha"),
      buildColumn("c", "Ruta", "Capacidad.Ruta"),
      buildColumn("c", "Capacidad", "Capacidad.Capacidad")
    ],
    where: [buildDateEqualsCondition("c", "Fecha", date)],
    projections: [0, 1, 2],
    top: 500
  });

  return rowsToObjects(parseDsrRows(payload), ["fecha", "ruta", "capacidad"]);
}

async function getMonthlyFlows(dates) {
  const monthly = await mapWithConcurrency(dates, 6, async (date) => {
    console.log(`  Flujos ${date}...`);
    return getFlowsForDate(date);
  });

  return monthly.flat();
}

async function getMonthlyCapacity(dates) {
  const monthly = await mapWithConcurrency(dates, 6, async (date) => {
    console.log(`  Capacidad ${date}...`);
    return getCapacityForDate(date);
  });

  return monthly.flat();
}

function buildMetadata(modelsAndExploration, conceptualSchema, latestDate, availableDates) {
  const model = modelsAndExploration.models[0];
  const exploration = modelsAndExploration.exploration;
  const entities =
    conceptualSchema.schemas[0]?.schema?.Entities?.map((entity) => ({
      name: entity.Name,
      columns: entity.Properties.map((property) => property.Name)
    })) ?? [];

  return {
    generatedAt: new Date().toISOString(),
    source: "ENARGAS Power BI public report",
    resourceKey: RESOURCE_KEY,
    model: {
      id: model.id,
      name: model.name,
      displayName: model.displayName,
      lastRefreshTime: model.LastRefreshTime
    },
    availableDates: availableDates.length,
    latestDate,
    visuals: exploration.sections[0].visualContainers.map((visual) => {
      const config = JSON.parse(visual.config);
      return {
        id: visual.id,
        visualType: config.singleVisual?.visualType ?? "n/a"
      };
    }),
    entities
  };
}

function projectMercator(lon, lat) {
  const clampedLat = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const lambda = (lon * Math.PI) / 180;
  const phi = (clampedLat * Math.PI) / 180;
  return {
    x: MERCATOR_RADIUS * lambda,
    y: MERCATOR_RADIUS * Math.log(Math.tan(Math.PI / 4 + phi / 2))
  };
}

function buildProjectedOutline() {
  const polygons = ARGENTINA_OUTLINE.map((ring) =>
    ring.map(([lon, lat]) => {
      const projected = projectMercator(lon, lat);
      return {
        lon,
        lat,
        x: projected.x,
        y: projected.y
      };
    })
  );

  const bounds = polygons.flat().reduce(
    (acc, point) => ({
      minX: Math.min(acc.minX, point.x),
      maxX: Math.max(acc.maxX, point.x),
      minY: Math.min(acc.minY, point.y),
      maxY: Math.max(acc.maxY, point.y)
    }),
    {
      minX: Infinity,
      maxX: -Infinity,
      minY: Infinity,
      maxY: -Infinity
    }
  );

  return {
    projection: "EPSG:3857",
    polygons,
    bounds
  };
}

function selectMonthlyDates(dates) {
  const byMonth = new Map();

  for (const date of dates) {
    byMonth.set(date.slice(0, 7), date);
  }

  return Array.from(byMonth.values()).sort();
}

function buildTimelineDataset({ dates, latestDate, routes, flows, capacity }) {
  const selectedDates = new Set(dates);
  const projectedRoutes = routes.map((route) => {
    const originProjected = projectMercator(route.longitudOrigen, route.latitudOrigen);
    const destinationProjected = projectMercator(
      route.longitudDestino,
      route.latitudDestino
    );

    return {
      ...route,
      xOrigen: originProjected.x,
      yOrigen: originProjected.y,
      xDestino: destinationProjected.x,
      yDestino: destinationProjected.y
    };
  });

  const flowMetrics = flows.filter((item) => selectedDates.has(item.fecha));
  const capacityMetrics = capacity.filter((item) => selectedDates.has(item.fecha));

  const flowByDateAndRoute = new Map(
    flowMetrics.map((item) => [`${item.fecha}::${item.ruta}`, item])
  );
  const capacityByDateAndRoute = new Map(
    capacityMetrics.map((item) => [`${item.fecha}::${item.ruta}`, item])
  );

  const snapshots = dates.map((date) => {
    const metrics = routes.map((route) => {
      const flow = flowByDateAndRoute.get(`${date}::${route.ruta}`) ?? {};
      const cap = capacityByDateAndRoute.get(`${date}::${route.ruta}`) ?? {};
      const caudal = flow.caudal ?? null;
      const capacidad = cap.capacidad ?? null;
      const utilization =
        caudal != null && capacidad != null && capacidad !== 0
          ? caudal / capacidad
          : null;

      return {
        ruta: route.ruta,
        fecha: date,
        caudal,
        capacidad,
        fcf: flow.fcf ?? null,
        sentido: flow.sentido ?? null,
        utilization
      };
    });

    const withFlow = metrics.filter((item) => item.caudal != null);
    const withCapacity = metrics.filter((item) => item.capacidad != null);

    return {
      date,
      stats: {
        routes: routes.length,
        routesWithFlow: withFlow.length,
        routesWithCapacity: withCapacity.length,
        totalFlow: withFlow.reduce((sum, item) => sum + item.caudal, 0),
        totalCapacity: withCapacity.reduce((sum, item) => sum + item.capacidad, 0)
      },
      metrics
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    source: "ENARGAS Power BI public report",
    projection: "EPSG:3857",
    latestDate,
    availableDates: dates,
    routes: projectedRoutes,
    snapshots
  };
}

async function main() {
  await mkdir(RAW_DIR, { recursive: true });
  await mkdir(PROCESSED_DIR, { recursive: true });

  console.log("Fetching Power BI report metadata...");
  const [modelsAndExploration, conceptualSchema] = await Promise.all([
    fetchModelsAndExploration(),
    fetchConceptualSchema()
  ]);

  console.log("Resolving available dates...");
  const availableDates = await getAvailableDates();
  const latestDate = availableDates.at(-1);
  const timelineDates = selectMonthlyDates(availableDates);

  console.log(`Fetching route metadata and time series (${timelineDates.length} monthly cuts)...`);
  const [routes, flows, capacity] = await Promise.all([
    getRoutes(),
    getMonthlyFlows(timelineDates),
    getMonthlyCapacity(timelineDates)
  ]);

  const metadata = buildMetadata(
    modelsAndExploration,
    conceptualSchema,
    latestDate,
    availableDates
  );
  const timelineSnapshot = buildTimelineDataset({
    dates: timelineDates,
    latestDate,
    routes,
    flows,
    capacity
  });
  const projectedOutline = buildProjectedOutline();

  await Promise.all([
    writeFile(
      join(RAW_DIR, "powerbi-models-and-exploration.json"),
      JSON.stringify(modelsAndExploration, null, 2),
      "utf8"
    ),
    writeFile(
      join(RAW_DIR, "powerbi-conceptual-schema.json"),
      JSON.stringify(conceptualSchema, null, 2),
      "utf8"
    ),
    writeFile(
      join(PROCESSED_DIR, "powerbi-report-metadata.json"),
      JSON.stringify(metadata, null, 2),
      "utf8"
    ),
    writeFile(
      join(PROCESSED_DIR, "powerbi-flows-latest.json"),
      JSON.stringify(timelineSnapshot, null, 2),
      "utf8"
    ),
    writeFile(
      join(PROCESSED_DIR, "argentina-outline-3857.json"),
      JSON.stringify(projectedOutline, null, 2),
      "utf8"
    )
  ]);

  console.log("Done.");
  console.log(`Latest date: ${timelineSnapshot.latestDate}`);
  console.log(`Cuts included: ${timelineSnapshot.availableDates.length}`);
  console.log(`Routes: ${timelineSnapshot.routes.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
