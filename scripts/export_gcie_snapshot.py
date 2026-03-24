from __future__ import annotations

import json
import math
from pathlib import Path
from datetime import UTC, datetime

import duckdb


ROOT = Path(__file__).resolve().parents[1]
GCIE_ROOT = Path("/var/home/matias/Projects/GCIE")
DUCKDB_PATH = GCIE_ROOT / "gas-intel-datalake" / "duckdb" / "gas_intel.duckdb"
OUTLINE_PATH = GCIE_ROOT / "gas-intel-meta" / "assets" / "argentina-outline-3857.json"
OUTPUT_PATH = ROOT / "data" / "processed" / "gcie-network-snapshot.json"


def _to_record_list(df):
    records = df.to_dict("records")
    for record in records:
        for key, value in list(record.items()):
            if hasattr(value, "isoformat"):
                record[key] = value.isoformat()
            elif isinstance(value, float) and not math.isfinite(value):
                record[key] = None
    return records


def main() -> None:
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    outline = json.loads(OUTLINE_PATH.read_text(encoding="utf-8"))

    con = duckdb.connect(str(DUCKDB_PATH), read_only=True)
    try:
        routes_df = con.execute(
            """
            SELECT
              e.edge_id,
              e.ruta,
              e.origen,
              e.destino,
              e.gasoducto,
              src.node_id AS source_node_id,
              dst.node_id AS target_node_id,
              src.latitud AS latitud_origen,
              src.longitud AS longitud_origen,
              dst.latitud AS latitud_destino,
              dst.longitud AS longitud_destino,
              src.x_mercator AS x_origen,
              src.y_mercator AS y_origen,
              dst.x_mercator AS x_destino,
              dst.y_mercator AS y_destino,
              e.source_confidence,
              e.topology_status,
              p.effective_capacity_mm3_dia,
              p.active_loop_count
            FROM red_tramos_canonica e
            LEFT JOIN red_tramos_parametros_canonica p USING(edge_id)
            INNER JOIN red_nodos_canonica src ON src.node_id = e.source_node_id
            INNER JOIN red_nodos_canonica dst ON dst.node_id = e.target_node_id
            WHERE e.is_active
            ORDER BY e.gasoducto, e.ruta
            """
        ).df()
        nodes_df = con.execute(
            """
            SELECT
              n.node_id,
              n.nombre,
              n.latitud,
              n.longitud,
              n.x_mercator,
              n.y_mercator,
              n.source_confidence,
              n.topology_status,
              COALESCE(r.role_proxy, 'unknown') AS role_proxy,
              EXISTS (
                SELECT 1 FROM red_compresoras_canonica c WHERE c.node_id = n.node_id
              ) AS has_compressor
            FROM red_nodos_canonica n
            LEFT JOIN red_nodo_roles_proxy r USING(node_id)
            WHERE n.is_active
            ORDER BY n.nombre
            """
        ).df()
        snapshots_df = con.execute(
            """
            SELECT
              m.fecha,
              e.edge_id,
              m.caudal_mm3_dia AS caudal,
              m.capacidad_mm3_dia AS capacidad,
              m.utilization_ratio AS utilization
            FROM red_tramo_metricas_mensuales m
            INNER JOIN red_tramos_canonica e USING(edge_id)
            WHERE e.is_active
            ORDER BY m.fecha, e.ruta
            """
        ).df()
        node_metrics_df = con.execute(
            """
            SELECT
              fecha,
              node_id,
              nombre,
              role_proxy,
              observed_inflow_mm3_dia,
              observed_outflow_mm3_dia,
              observed_throughput_mm3_dia,
              supply_mm3_dia_proxy,
              supply_conventional_mm3_dia_proxy,
              supply_non_conventional_mm3_dia_proxy,
              supply_import_bolivia_mm3_dia_proxy,
              supply_lng_mm3_dia_proxy,
              withdrawal_mm3_dia_proxy,
              exogenous_net_mm3_dia_proxy,
              supply_method
            FROM red_nodo_exogenos_mensuales
            ORDER BY fecha, nombre
            """
        ).df()
    finally:
        con.close()

    available_dates = sorted({row["fecha"][:10] for row in _to_record_list(snapshots_df)})
    route_metrics_by_date: dict[str, list[dict[str, object]]] = {date: [] for date in available_dates}
    node_metrics_by_date: dict[str, list[dict[str, object]]] = {date: [] for date in available_dates}

    for row in _to_record_list(snapshots_df):
        date = row["fecha"][:10]
        route_metrics_by_date.setdefault(date, []).append(
            {
                "edgeId": row["edge_id"],
                "caudal": row["caudal"],
                "capacidad": row["capacidad"],
                "utilization": row["utilization"],
            }
        )

    for row in _to_record_list(node_metrics_df):
        date = row["fecha"][:10]
        node_metrics_by_date.setdefault(date, []).append(
            {
                "nodeId": row["node_id"],
                "nombre": row["nombre"],
                "roleProxy": row["role_proxy"],
                "observedInflow": row["observed_inflow_mm3_dia"],
                "observedOutflow": row["observed_outflow_mm3_dia"],
                "observedThroughput": row["observed_throughput_mm3_dia"],
                "sourceProxy": row["supply_mm3_dia_proxy"],
                "convSource": row["supply_conventional_mm3_dia_proxy"],
                "ncSource": row["supply_non_conventional_mm3_dia_proxy"],
                "boliviaSource": row["supply_import_bolivia_mm3_dia_proxy"],
                "lngSource": row["supply_lng_mm3_dia_proxy"],
                "sinkProxy": row["withdrawal_mm3_dia_proxy"],
                "netProxy": row["exogenous_net_mm3_dia_proxy"],
                "supplyMethod": row["supply_method"],
            }
        )

    snapshots = []
    for date in available_dates:
        route_metrics = route_metrics_by_date.get(date, [])
        node_metrics = node_metrics_by_date.get(date, [])
        snapshots.append(
            {
                "date": date,
                "stats": {
                    "routes": len(routes_df),
                    "routesWithFlow": sum(1 for item in route_metrics if item["caudal"] is not None),
                    "routesWithCapacity": sum(1 for item in route_metrics if item["capacidad"] is not None),
                    "totalFlow": sum(float(item["caudal"] or 0.0) for item in route_metrics),
                    "totalCapacity": sum(float(item["capacidad"] or 0.0) for item in route_metrics),
                    "totalSourceProxy": sum(float(item["sourceProxy"] or 0.0) for item in node_metrics),
                    "totalSinkProxy": sum(float(item["sinkProxy"] or 0.0) for item in node_metrics),
                    "totalConvSource": sum(float(item["convSource"] or 0.0) for item in node_metrics),
                    "totalNcSource": sum(float(item["ncSource"] or 0.0) for item in node_metrics),
                    "totalBoliviaSource": sum(float(item["boliviaSource"] or 0.0) for item in node_metrics),
                    "totalLngSource": sum(float(item["lngSource"] or 0.0) for item in node_metrics),
                },
                "metrics": route_metrics,
                "nodeMetrics": node_metrics,
            }
        )

    payload = {
        "generatedAt": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "source": "GCIE canonical network snapshot",
        "projection": "EPSG:3857",
        "latestDate": available_dates[-1],
        "availableDates": available_dates,
        "routes": [
            {
                "edgeId": row["edge_id"],
                "ruta": row["ruta"],
                "origen": row["origen"],
                "destino": row["destino"],
                "gasoducto": row["gasoducto"],
                "sourceNodeId": row["source_node_id"],
                "targetNodeId": row["target_node_id"],
                "latitudOrigen": row["latitud_origen"],
                "longitudOrigen": row["longitud_origen"],
                "latitudDestino": row["latitud_destino"],
                "longitudDestino": row["longitud_destino"],
                "xOrigen": row["x_origen"],
                "yOrigen": row["y_origen"],
                "xDestino": row["x_destino"],
                "yDestino": row["y_destino"],
                "sourceConfidence": row["source_confidence"],
                "topologyStatus": row["topology_status"],
                "effectiveCapacity": row["effective_capacity_mm3_dia"],
                "activeLoopCount": row["active_loop_count"],
            }
            for row in _to_record_list(routes_df)
        ],
        "nodes": [
            {
                "nodeId": row["node_id"],
                "nombre": row["nombre"],
                "latitud": row["latitud"],
                "longitud": row["longitud"],
                "x": row["x_mercator"],
                "y": row["y_mercator"],
                "sourceConfidence": row["source_confidence"],
                "topologyStatus": row["topology_status"],
                "roleProxy": row["role_proxy"],
                "hasCompressor": bool(row["has_compressor"]),
            }
            for row in _to_record_list(nodes_df)
        ],
        "snapshots": snapshots,
        "outline": outline,
    }
    OUTPUT_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(OUTPUT_PATH)


if __name__ == "__main__":
    main()
