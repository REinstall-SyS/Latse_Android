import L from "leaflet";
export type MapLayer = "outdoor" | "topo" | "satellite";
export const MAP_LAYERS: Array<{ id: MapLayer; label: string }> = [
  { id: "outdoor", label: "Clean Outdoor" },
  { id: "topo", label: "Terrain Topo" },
  { id: "satellite", label: "Satellite" },
];
export function attachMapLayer(
  map: L.Map,
  kind: MapLayer,
  onError: () => void = () => {},
) {
  const layers = L.layerGroup().addTo(map);
  const outdoor = () =>
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      className: "outdoor-tiles",
    })
      .on("tileerror", onError)
      .addTo(layers);
  if (kind === "outdoor") outdoor();
  else if (kind === "satellite")
    L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      {
        maxZoom: 19,
        attribution:
          "Imagery © Esri, Vantor, Earthstar Geographics and the GIS User Community",
      },
    )
      .on("tileerror", onError)
      .addTo(layers);
  else {
    let fallback = false;
    const topo = L.tileLayer(
      "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
      {
        maxZoom: 17,
        attribution: "Map © OpenTopoMap (CC-BY-SA), © OpenStreetMap, SRTM",
      },
    ).addTo(layers);
    topo.on("tileerror", () => {
      if (!fallback) {
        fallback = true;
        layers.removeLayer(topo);
        outdoor();
      }
    });
  }
  return () => {
    layers.remove();
  };
}
