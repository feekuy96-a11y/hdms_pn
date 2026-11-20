/** Static Pattani administrative geometry loaded from the exported public asset. */

export interface SubdistrictDataEntry {
  code?: string;
  tambon: string;
  village?: string;
  amphoe: string;
  bounds: [number, number, number, number];
  center?: [number, number];
  polygon?: [number, number][];
}

export interface PattaniDistrictFeature {
  type: "Feature";
  properties: { name: string };
  geometry: {
    type: "Polygon" | "MultiPolygon";
    coordinates: number[][][] | number[][][][];
  };
}

export interface BaseHighwayNetwork {
  subdistricts: SubdistrictDataEntry[];
  districtsGeojson: {
    type: "FeatureCollection";
    features: PattaniDistrictFeature[];
  };
}

const BASE_HIGHWAY_NETWORK_URL = "/data/highway-base-network.json";
let baseHighwayNetworkPromise: Promise<BaseHighwayNetwork> | null = null;

function isBaseHighwayNetwork(value: unknown): value is BaseHighwayNetwork {
  if (!value || typeof value !== "object") return false;
  const network = value as Partial<BaseHighwayNetwork>;
  return Array.isArray(network.subdistricts) && Array.isArray(network.districtsGeojson?.features);
}

/** Loads the static network once per browser session and shares concurrent requests. */
export function loadBaseHighwayNetwork(): Promise<BaseHighwayNetwork> {
  if (!baseHighwayNetworkPromise) {
    baseHighwayNetworkPromise = fetch(BASE_HIGHWAY_NETWORK_URL)
      .then(async (response) => {
        if (!response.ok) throw new Error(`Unable to load base highway network (${response.status})`);
        const payload: unknown = await response.json();
        if (!isBaseHighwayNetwork(payload)) throw new Error("Invalid base highway network payload");
        return payload;
      })
      .catch((error) => {
        baseHighwayNetworkPromise = null;
        throw error;
      });
  }
  return baseHighwayNetworkPromise;
}

/** Clears the cached payload for isolated tests. */
export function resetBaseHighwayNetworkCache() {
  baseHighwayNetworkPromise = null;
}
