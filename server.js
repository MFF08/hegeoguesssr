import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

/**
 * Erweiterte Spot-Liste (Helmstedt, ungefähre Koordinaten)
 * Tipp: Ergänze weitere markante Orte für mehr Abwechslung.
 */
const HELMSTEDT_SPOTS = [
  { name: "Juleum", lat: 52.22999, lng: 11.01074, hint: "Ehem. Universität – markantes Gebäude" },
  { name: "Marktplatz", lat: 52.22845, lng: 11.01002, hint: "Zentrum, nah am Rathaus" },
  { name: "St. Stephani", lat: 52.23062, lng: 11.00615, hint: "Kirche westlich der Innenstadt" },
  { name: "Brunnentheater", lat: 52.24524, lng: 10.99667, hint: "Kulturstätte nördlich" },
  { name: "Trinitatiskirche", lat: 52.22802, lng: 11.01276, hint: "Kirche östlich des Zentrums" },
  { name: "Pferdeteich", lat: 52.22922, lng: 11.00323, hint: "Wasser, westlich der City" },
  { name: "Pagenberg Park", lat: 52.23601, lng: 11.01579, hint: "Grünfläche nordöstlich" },
  { name: "Rathaus Helmstedt", lat: 52.22888, lng: 11.00949, hint: "Historisches Rathaus" },
  { name: "Bibliothek Helmstedt", lat: 52.23041, lng: 11.01335, hint: "Lesesaal nähe Zentrum" },
  { name: "Lappwaldsee Aussicht", lat: 52.263, lng: 11.022, hint: "Nordöstlich, Gewässer in der Umgebung" }
];

function getRandomSpot() {
  const idx = Math.floor(Math.random() * HELMSTEDT_SPOTS.length);
  return HELMSTEDT_SPOTS[idx];
}

// Eine Runde liefert einen zufälligen Spot.
app.get("/api/random-spot", (req, res) => {
  res.json(getRandomSpot());
});

// Mapillary-Integration: optional
app.get("/api/mapillary-nearby", async (req, res) => {
  const { lat, lng } = req.query;
  const token = process.env.MAPILLARY_TOKEN;
  if (!token) {
    return res.status(200).json({ image: null, note: "MAPILLARY_TOKEN fehlt" });
    // Hinweis: Ohne Token läuft das Spiel trotzdem, nur ohne Foto.
  }

  try {
    const radius = 200; // Meter
    const limit = 1;
    const url = `https://graph.mapillary.com/images?fields=id,thumb_2048_url,thumb_1024_url,geometry&access_token=${encodeURIComponent(
      token
    )}&limit=${limit}&closeto=${lng},${lat}&distance=${radius}`;

    const r = await fetch(url);
    if (!r.ok) {
      return res.status(r.status).json({ error: `Mapillary API Fehler: ${r.statusText}` });
    }
    const data = await r.json();
    if (!data?.data?.length) {
      return res.json({ image: null });
    }
    const img = data.data[0];
    res.json({
      image: {
        id: img.id,
        thumbUrl: img.thumb_2048_url || img.thumb_1024_url,
        lng: img.geometry?.coordinates?.[0],
        lat: img.geometry?.coordinates?.[1]
      }
    });
  } catch (e) {
    console.error("Mapillary error:", e);
    res.status(500).json({ error: "Fehler bei Mapillary" });
  }
});

// Fallback: index.html
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Helmstedt GeoGuessr läuft: http://localhost:${PORT}`);
});
