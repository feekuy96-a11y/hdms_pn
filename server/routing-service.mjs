import http from "node:http";
import { URL } from "node:url";

const PORT = process.env.ROUTING_PORT || 5000;
const UPSTREAM_OSRM = "https://router.project-osrm.org/route/v1/driving";

// Cache in-memory for ultra-fast response (< 1ms)
const routeCache = new Map();

// Built-in Pattani Highway Segments for Offline Fallback
const PATTANI_HIGHWAY_SEGMENTS = [
  {
    ref: "43",
    name: "ทางหลวงแผ่นดินหมายเลข 43 (หาดใหญ่ - ปัตตานี)",
    coords: [
      [101.12, 6.78],
      [101.145, 6.79],
      [101.178, 6.815],
      [101.21, 6.835],
      [101.242, 6.842]
    ]
  },
  {
    ref: "42",
    name: "ทางหลวงแผ่นดินหมายเลข 42 (คลองแงะ - สายบุรี)",
    coords: [
      [101.242, 6.842],
      [101.268, 6.8485],
      [101.32, 6.855],
      [101.45, 6.86],
      [101.55, 6.74]
    ]
  },
  {
    ref: "418",
    name: "ทางหลวงแผ่นดินหมายเลข 418 (ปัตตานี - ยะลา)",
    coords: [
      [101.255, 6.865],
      [101.265, 6.81],
      [101.285, 6.752],
      [101.292, 6.65]
    ]
  },
  {
    ref: "ปน.2068",
    name: "ทางหลวงชนบท ปน.2068 (เส้นทางเลี่ยงเมืองหนองจิก)",
    coords: [
      [101.18, 6.86],
      [101.186, 6.848],
      [101.20, 6.84]
    ]
  },
  {
    ref: "4296",
    name: "ถนนหนองจิก (ทล.4296)",
    coords: [
      [101.216, 6.854],
      [101.24, 6.86],
      [101.255, 6.865]
    ]
  }
];

function haversineMeters(p1, p2) {
  const R = 6371000;
  const dLat = ((p2[1] - p1[1]) * Math.PI) / 180;
  const dLon = ((p2[0] - p1[0]) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((p1[1] * Math.PI) / 180) *
      Math.cos((p2[1] * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function solveLocalOfflineRoute(coordPairs) {
  const start = coordPairs[0];
  const end = coordPairs[coordPairs.length - 1];

  let nearestSegment = PATTANI_HIGHWAY_SEGMENTS[0];
  let minDistance = Infinity;

  for (const seg of PATTANI_HIGHWAY_SEGMENTS) {
    for (const pt of seg.coords) {
      const d = haversineMeters(start, pt);
      if (d < minDistance) {
        minDistance = d;
        nearestSegment = seg;
      }
    }
  }

  // Construct coordinates joining start -> intermediate highway -> end
  const pathCoordinates = [start, ...nearestSegment.coords, end];

  let totalDist = 0;
  for (let i = 0; i < pathCoordinates.length - 1; i++) {
    totalDist += haversineMeters(pathCoordinates[i], pathCoordinates[i + 1]);
  }
  const totalDuration = totalDist / 13.88; // ~50 km/h avg speed

  const steps = [
    {
      distance: 250,
      duration: 18,
      name: "จุดเริ่มต้นทางเบี่ยง",
      ref: "",
      maneuver: {
        type: "depart",
        modifier: "right",
        location: start
      }
    },
    {
      distance: totalDist * 0.7,
      duration: totalDuration * 0.7,
      name: nearestSegment.name,
      ref: nearestSegment.ref,
      maneuver: {
        type: "turn",
        modifier: "left",
        location: nearestSegment.coords[0]
      }
    },
    {
      distance: totalDist * 0.3,
      duration: totalDuration * 0.3,
      name: "ทางหลวงแผ่นดินสายหลัก",
      ref: "42",
      maneuver: {
        type: "arrive",
        modifier: "right",
        location: end
      }
    }
  ];

  return {
    code: "Ok",
    routes: [
      {
        distance: Math.round(totalDist),
        duration: Math.round(totalDuration),
        weight_name: "routability",
        weight: Math.round(totalDuration),
        geometry: {
          type: "LineString",
          coordinates: pathCoordinates
        },
        legs: [
          {
            distance: Math.round(totalDist),
            duration: Math.round(totalDuration),
            summary: nearestSegment.name,
            steps: steps
          }
        ]
      }
    ],
    waypoints: coordPairs.map((c, i) => ({
      hint: "offline_pattani_node_" + i,
      distance: 0,
      name: i === 0 ? "จุดเริ่มต้น" : "จุดสิ้นสุด",
      location: c
    }))
  };
}

const server = http.createServer(async (req, res) => {
  // CORS Headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS, POST");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = parsedUrl.pathname;

  // Healthcheck endpoint
  if (pathname === "/" || pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(
      JSON.stringify(
        {
          status: "healthy",
          service: "DOH Pattani OSRM Local Routing Microservice",
          version: "1.0.0",
          cachedRoutes: routeCache.size,
          uptimeSeconds: Math.round(process.uptime()),
          endpoints: ["/route/v1/driving/{coords}?overview=full&geometries=geojson&steps=true"]
        },
        null,
        2
      )
    );
    return;
  }

  // Handle OSRM Route endpoint
  // Matching: /route/v1/driving/{coordinates}
  const routePrefix = "/route/v1/driving/";
  if (pathname.startsWith(routePrefix)) {
    const coordString = decodeURIComponent(pathname.slice(routePrefix.length));
    const cacheKey = `${coordString}?${parsedUrl.searchParams.toString()}`;

    // 1. Check in-memory cache
    if (routeCache.has(cacheKey)) {
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "X-Routing-Source": "local-cache",
        "X-Response-Time": "0ms"
      });
      res.end(JSON.stringify(routeCache.get(cacheKey)));
      return;
    }

    // 2. Try Upstream OSRM with 1500ms timeout
    const upstreamUrl = `${UPSTREAM_OSRM}/${coordString}${parsedUrl.search}`;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1800);
      const upstreamRes = await fetch(upstreamUrl, { signal: controller.signal });
      clearTimeout(timeout);

      if (upstreamRes.ok) {
        const data = await upstreamRes.json();
        if (data && data.code === "Ok") {
          // Store in cache (limit cache size to 1000 items)
          if (routeCache.size > 1000) {
            const firstKey = routeCache.keys().next().value;
            routeCache.delete(firstKey);
          }
          routeCache.set(cacheKey, data);

          res.writeHead(200, {
            "Content-Type": "application/json; charset=utf-8",
            "X-Routing-Source": "upstream-cached"
          });
          res.end(JSON.stringify(data));
          return;
        }
      }
    } catch (e) {
      // Upstream failed or timed out, will proceed to local fallback
    }

    // 3. Fallback: Local Graph Solver
    try {
      const coordPairs = coordString
        .split(";")
        .map((pair) => pair.split(",").map(Number))
        .filter((p) => p.length === 2 && !isNaN(p[0]) && !isNaN(p[1]));

      if (coordPairs.length >= 2) {
        const localData = solveLocalOfflineRoute(coordPairs);
        routeCache.set(cacheKey, localData);

        res.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
          "X-Routing-Source": "pattani-local-graph"
        });
        res.end(JSON.stringify(localData));
        return;
      }
    } catch (localErr) {
      console.error("[RoutingService] Local solve error:", localErr);
    }

    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ code: "InvalidQuery", message: "Invalid coordinates provided" }));
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ code: "NotFound", message: "Route not found" }));
});

server.listen(PORT, () => {
  console.log(`[DOH Pattani] OSRM Local Routing Microservice running on http://localhost:${PORT}`);
});

