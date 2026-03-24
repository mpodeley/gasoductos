import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const OUTPUT_ROOT = "data";
const RAW_DIR = join(OUTPUT_ROOT, "raw");
const PROCESSED_DIR = join(OUTPUT_ROOT, "processed");

const SERVICES = [
  {
    key: "gasoductos",
    label: "Gasoductos de transporte",
    url: "https://sig.enargas.gov.ar/arcgis/rest/services/Enargas_ext/Gsoductos_de_Transporte/MapServer/0/query",
    idField: "OBJECTID",
    outFields: [
      "OBJECTID",
      "ID_LIC",
      "Gasoducto",
      "Tramo",
      "TdTrm",
      "PkiTrm",
      "PkfTrm",
      "Long",
      "PrsDsn",
      "Mapo",
      "Diametro",
      "Espesor",
      "MatNyG",
      "Construc",
      "FchHab",
      "PrsMaxPru",
      "PrsMinPru",
      "Licenciataria",
      "Obs",
      "Fuente"
    ]
  },
  {
    key: "plantas-compresoras",
    label: "Plantas compresoras",
    url: "https://sig.enargas.gov.ar/arcgis/rest/services/Enargas_ext/Plantas_Compresoras/MapServer/0/query",
    idField: "sig_enargas.SDE.PCO_GT.OBJECTID",
    outFields: [
      "sig_enargas.SDE.PCO_GT.OBJECTID",
      "sig_enargas.SDE.PCO_GT.ID_PC",
      "sig_enargas.SDE.PCO_GT.ID_GSD",
      "sig_enargas.SDE.PCO_GT.ID_Tramo",
      "sig_enargas.SDE.PCO_GT.Caudal_Dis",
      "sig_enargas.SDE.PCO_GT.Consumo",
      "sig_enargas.SDE.PCO_GT.Potencia",
      "sig_enargas.SDE.PCO_GT.Comp_Fun",
      "sig_enargas.SDE.PCO_GT.Comp_Tot",
      "sig_enargas.SDE.PCO_GT.Estado",
      "sig_enargas.SDE.PCO_GT.Nombre",
      "sig_enargas.SDE.PCO_GT.Gasoducto",
      "sig_enargas.SDE.PCO_GT.Tramo",
      "sig_enargas.SDE.PCO_GT.Licenciataria",
      "sig_enargas.SDE.PCO_GT.Latitud",
      "sig_enargas.SDE.PCO_GT.Longitud",
      "sig_enargas.SDE.PCO_GT.Obs"
    ]
  }
];

function toQueryString(params) {
  return new URLSearchParams(params).toString();
}

async function fetchAllFeatures(service) {
  const idsResponse = await fetch(
    `${service.url}?${toQueryString({
      where: "1=1",
      returnIdsOnly: "true",
      f: "json"
    })}`
  );

  if (!idsResponse.ok) {
    throw new Error(`HTTP ${idsResponse.status} while fetching IDs for ${service.label}`);
  }

  const idsPayload = await idsResponse.json();
  if (idsPayload.error) {
    throw new Error(`${service.label}: ${idsPayload.error.message}`);
  }

  const objectIds = (idsPayload.objectIds ?? []).sort((a, b) => a - b);
  const chunkSize = 200;
  const features = [];

  for (let index = 0; index < objectIds.length; index += chunkSize) {
    const chunk = objectIds.slice(index, index + chunkSize);
    const query = toQueryString({
      objectIds: chunk.join(","),
      outFields: service.outFields.join(","),
      returnGeometry: "true",
      f: "json",
      outSR: "4326"
    });

    const response = await fetch(`${service.url}?${query}`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} while fetching ${service.label}`);
    }

    const payload = await response.json();
    if (payload.error) {
      throw new Error(`${service.label}: ${payload.error.message}`);
    }

    features.push(...(payload.features ?? []));
  }

  return features;
}

function normalizeGasoducto(feature) {
  const a = feature.attributes;
  return {
    id: a.OBJECTID,
    gasoducto: a.Gasoducto,
    tramo: a.Tramo,
    tipoTramo: a.TdTrm,
    licenciataria: a.Licenciataria,
    diametroMm: a.Diametro,
    longitudKm: a.Long,
    presionDiseno: a.PrsDsn,
    mapo: a.Mapo,
    pkInicio: a.PkiTrm,
    pkFin: a.PkfTrm,
    fuente: a.Fuente,
    observaciones: a.Obs,
    geometry: feature.geometry
  };
}

function normalizePlanta(feature) {
  const a = feature.attributes;
  return {
    id: a["sig_enargas.SDE.PCO_GT.OBJECTID"],
    nombre: a["sig_enargas.SDE.PCO_GT.Nombre"],
    gasoducto: a["sig_enargas.SDE.PCO_GT.Gasoducto"],
    tramo: a["sig_enargas.SDE.PCO_GT.Tramo"],
    licenciataria: a["sig_enargas.SDE.PCO_GT.Licenciataria"],
    estado: a["sig_enargas.SDE.PCO_GT.Estado"],
    caudalDisponible: a["sig_enargas.SDE.PCO_GT.Caudal_Dis"],
    consumo: a["sig_enargas.SDE.PCO_GT.Consumo"],
    potencia: a["sig_enargas.SDE.PCO_GT.Potencia"],
    compresoresFuncionando: a["sig_enargas.SDE.PCO_GT.Comp_Fun"],
    compresoresTotales: a["sig_enargas.SDE.PCO_GT.Comp_Tot"],
    latitud: a["sig_enargas.SDE.PCO_GT.Latitud"],
    longitud: a["sig_enargas.SDE.PCO_GT.Longitud"],
    observaciones: a["sig_enargas.SDE.PCO_GT.Obs"],
    geometry: feature.geometry
  };
}

function buildSnapshot(rawData) {
  const gasoductos = rawData.gasoductos.features.map(normalizeGasoducto);
  const plantasCompresoras = rawData["plantas-compresoras"].features.map(normalizePlanta);

  const networkStats = {
    gasoductos: gasoductos.length,
    plantasCompresoras: plantasCompresoras.length,
    gasoductosConPresion: gasoductos.filter((item) => item.presionDiseno != null).length,
    plantasConCaudalDisponible: plantasCompresoras.filter((item) => item.caudalDisponible != null).length
  };

  return {
    generatedAt: new Date().toISOString(),
    source: "ENARGAS ArcGIS public services",
    services: Object.values(rawData).map((entry) => ({
      key: entry.key,
      label: entry.label,
      count: entry.features.length,
      sourceUrl: entry.sourceUrl
    })),
    stats: networkStats,
    gasoductos,
    plantasCompresoras
  };
}

function countBy(items, key) {
  return Object.entries(
    items.reduce((acc, item) => {
      const value = item[key] ?? "Sin dato";
      acc[value] = (acc[value] ?? 0) + 1;
      return acc;
    }, {})
  )
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));
}

function buildSummary(snapshot) {
  return {
    generatedAt: snapshot.generatedAt,
    source: snapshot.source,
    stats: snapshot.stats,
    topLicenciatarias: countBy(snapshot.gasoductos, "licenciataria").slice(0, 10),
    topGasoductos: countBy(snapshot.gasoductos, "gasoducto").slice(0, 15),
    plantasPorEstado: countBy(snapshot.plantasCompresoras, "estado"),
    plantasConMayorCaudalDisponible: snapshot.plantasCompresoras
      .filter((item) => item.caudalDisponible != null)
      .sort((a, b) => (b.caudalDisponible ?? 0) - (a.caudalDisponible ?? 0))
      .slice(0, 10)
      .map((item) => ({
        nombre: item.nombre,
        gasoducto: item.gasoducto,
        tramo: item.tramo,
        licenciataria: item.licenciataria,
        caudalDisponible: item.caudalDisponible
      }))
  };
}

async function main() {
  await mkdir(RAW_DIR, { recursive: true });
  await mkdir(PROCESSED_DIR, { recursive: true });

  const rawData = {};

  for (const service of SERVICES) {
    console.log(`Fetching ${service.label}...`);
    const features = await fetchAllFeatures(service);
    const rawPayload = {
      key: service.key,
      label: service.label,
      sourceUrl: service.url,
      fetchedAt: new Date().toISOString(),
      featureCount: features.length,
      features
    };

    rawData[service.key] = rawPayload;

    await writeFile(
      join(RAW_DIR, `${service.key}.json`),
      JSON.stringify(rawPayload, null, 2),
      "utf8"
    );
  }

  const snapshot = buildSnapshot(rawData);
  await writeFile(
    join(PROCESSED_DIR, "network-snapshot.json"),
    JSON.stringify(snapshot, null, 2),
    "utf8"
  );

  await writeFile(
    join(PROCESSED_DIR, "network-summary.json"),
    JSON.stringify(buildSummary(snapshot), null, 2),
    "utf8"
  );

  console.log("Done.");
  console.log(`Gasoductos: ${snapshot.stats.gasoductos}`);
  console.log(`Plantas compresoras: ${snapshot.stats.plantasCompresoras}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
