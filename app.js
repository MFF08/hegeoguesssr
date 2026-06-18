// Leaflet-Map, Spiel-Logik, Timer, Highscore, Mapillary-Integration

let map, guessMarker, trueMarker, roundSpot = null;
let score = 0;
let roundActive = false;
let currentRound = 0;
const TOTAL_ROUNDS = 5;

let distLine = null;
let timerInterval = null;
let remainingSeconds = 0;

const MAX_POINTS = 5000; // 0..5000 pro Runde
const ROUND_SECONDS = 90; // pro Runde

// Helmstedt Kartenausschnitt
const HELMSTEDT_BOUNDS = [
  [52.20, 10.95], // SW
  [52.27, 11.06]  // NE
];
const HELMSTEDT_CENTER = [52.2295, 11.0100];

function initMap() {
  map = L.map('map', {
    minZoom: 12,
    maxZoom: 19,
    zoomControl: true
  }).setView(HELMSTEDT_CENTER, 14);

  // Tile-Layer
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap-Mitwirkende'
  }).addTo(map);

  // Begrenzung optional
  map.setMaxBounds(HELMSTEDT_BOUNDS);

  map.on('click', (e) => {
    if (!roundActive) return;
    setGuess(e.latlng.lat, e.latlng.lng);
  });
}

function setGuess(lat, lng) {
  if (guessMarker) {
    guessMarker.setLatLng([lat, lng]).setPopupContent("Dein Tipp");
  } else {
    guessMarker = L.marker([lat, lng], { draggable: false })
      .addTo(map)
      .bindPopup("Dein Tipp");
  }
  guessMarker.openPopup();
  byId('btn-submit').disabled = false;
}

function setTrueLocation(lat, lng, label = "Ziel") {
  if (trueMarker) {
    trueMarker.setLatLng([lat, lng]).setPopupContent(label);
  } else {
    trueMarker = L.marker([lat, lng], { draggable: false })
      .addTo(map)
      .bindPopup(label);
  }
}

function drawDistanceLine(fromLatLng, toLatLng) {
  if (distLine) {
    map.removeLayer(distLine);
    distLine = null;
  }
  distLine = L.polyline([fromLatLng, toLatLng], { color: '#22c55e', weight: 3, opacity: 0.8 }).addTo(map);
}

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Meter
  const toRad = (x) => x * Math.PI / 180;
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δφ = toRad(lat2 - lat1);
  const Δλ = toRad(lon2 - lon1);

  const a = Math.sin(Δφ/2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const d = R * c; // Meter
  return d;
}

// Punktekurve: 0 m -> 5000, >= 5 km -> ~0 (quadratisch fallend)
function scoreFromDistance(dMeters) {
  const dKm = dMeters / 1000;
  const MAX_KM = 5;
  const s = Math.max(0, 1 - dKm / MAX_KM);
  return Math.round(MAX_POINTS * Math.pow(s, 2.0));
}

function byId(id) { return document.getElementById(id); }

function resetRoundState() {
  roundActive = false;
  roundSpot = null;
  if (guessMarker) { map.removeLayer(guessMarker); guessMarker = null; }
  if (trueMarker) { map.removeLayer(trueMarker); trueMarker = null; }
  if (distLine) { map.removeLayer(distLine); distLine = null; }
  byId('result-text').textContent = "";
  byId('btn-submit').disabled = true;
  byId('btn-reveal').disabled = true;
  stopTimer();
}

async function newGame() {
  score = 0;
  currentRound = 0;
  byId('score-status').textContent = "0";
  byId('round-counter').textContent = `0 / ${TOTAL_ROUNDS}`;
  byId('result-text').textContent = "";
  resetRoundState();
  await newRound();
}

async function newRound() {
  resetRoundState();
  currentRound += 1;
  byId('round-counter').textContent = `${currentRound} / ${TOTAL_ROUNDS}`;

  // Lade Zielpunkt
  const r = await fetch('/api/random-spot');
  const spot = await r.json();
  roundSpot = spot;

  // Hinweis/Hint anzeigen
  byId('hint-status').textContent = spot.hint || "—";

  // Mapillary (optional)
  await loadMapillaryImage(spot.lat, spot.lng);

  roundActive = true;
  byId('btn-reveal').disabled = false;
  byId('btn-submit').disabled = true;

  // Map zurücksetzen
  map.setView(HELMSTEDT_CENTER, 14);

  // Timer starten
  startTimer(ROUND_SECONDS);
}

async function loadMapillaryImage(lat, lng) {
  const img = byId('viewer-img');
  const placeholder = document.querySelector('#viewer .placeholder');

  try {
    const r = await fetch(`/api/mapillary-nearby?lat=${lat}&lng=${lng}`);
    const data = await r.json();

    if (data?.image?.thumbUrl) {
      img.src = data.image.thumbUrl;
      img.style.display = "block";
      if (placeholder) placeholder.style.display = "none";
    } else {
      img.removeAttribute('src');
      img.style.display = "none";
      if (placeholder) {
        placeholder.style.display = "grid";
        placeholder.innerHTML = `
          <p>Kein Mapillary-Bild gefunden oder kein Token gesetzt.</p>
          <p class="hint">Trage deinen MAPILLARY_TOKEN in .env ein und starte den Server neu.</p>
        `;
      }
    }
  } catch (e) {
    console.error(e);
    img.removeAttribute('src');
    img.style.display = "none";
    if (placeholder) {
      placeholder.style.display = "grid";
      placeholder.innerHTML = `
        <p>Fehler bei der Bildabfrage.</p>
        <p class="hint">Prüfe Internetverbindung oder MAPILLARY_TOKEN.</p>
      `;
    }
  }
}

function reveal() {
  if (!roundSpot) return;
  setTrueLocation(roundSpot.lat, roundSpot.lng, roundSpot.name || "Ziel");
  if (trueMarker) trueMarker.openPopup();

  // Falls es bereits einen Tipp gibt, Distanzlinie zeichnen
  if (guessMarker) {
    drawDistanceLine(guessMarker.getLatLng(), [roundSpot.lat, roundSpot.lng]);
  }
}

function submitGuess() {
  if (!roundActive || !roundSpot || !guessMarker) return;

  const g = guessMarker.getLatLng();
  const d = haversineDistance(g.lat, g.lng, roundSpot.lat, roundSpot.lng);
  const pts = scoreFromDistance(d);
  score += pts;

  const meters = Math.round(d);
  const result = `Entfernung: ${meters} m — Punkte diese Runde: ${pts}`;
  byId('result-text').textContent = result;
  byId('score-status').textContent = `${score}`;

  // Distanzlinie + wahres Ziel anzeigen
  reveal();

  roundActive = false;
  stopTimer();

  // Nächste Runde oder Spielende
  if (currentRound < TOTAL_ROUNDS) {
    byId('btn-new-round').disabled = false;
  } else {
    endGame();
  }
}

function endGame() {
  const title = byId('overlay-title');
  const body = byId('overlay-body');
  title.textContent = "Spielende";
  body.textContent = `Gesamtpunkte: ${score} von ${TOTAL_ROUNDS * MAX_POINTS}`;
  showOverlay(true);

  // Highscore speichern
  saveHighscore(score);
  renderHighscore();
}

function showOverlay(visible) {
  const overlay = byId('overlay');
  overlay.classList.toggle('hidden', !visible);
}

function startTimer(seconds) {
  stopTimer();
  remainingSeconds = seconds;
  updateTimerLabel();

  timerInterval = setInterval(() => {
    remainingSeconds -= 1;
    updateTimerLabel();
    if (remainingSeconds <= 0) {
      // Zeit abgelaufen: automatisch werten (0 Punkte, wenn kein Tipp?)
      clearInterval(timerInterval);
      timerInterval = null;
      if (roundActive) {
        autoScoreOnTimeout();
      }
    }
  }, 1000);
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  byId('timer-status').textContent = "—";
}

function updateTimerLabel() {
  byId('timer-status').textContent = `${remainingSeconds}s`;
}

function autoScoreOnTimeout() {
  // Wenn kein Tipp gesetzt: minimaler Score (0)
  let pts = 0;
  if (guessMarker) {
    const g = guessMarker.getLatLng();
    const d = haversineDistance(g.lat, g.lng, roundSpot.lat, roundSpot.lng);
    pts = scoreFromDistance(d);
    drawDistanceLine([g.lat, g.lng], [roundSpot.lat, roundSpot.lng]);
  }
  score += pts;
  byId('score-status').textContent = `${score}`;
  byId('result-text').textContent = `Zeit abgelaufen — Punkte diese Runde: ${pts}`;
  reveal();
  roundActive = false;

  if (currentRound < TOTAL_ROUNDS) {
    byId('btn-new-round').disabled = false;
  } else {
    endGame();
  }
}

// Highscore (localStorage)
function loadHighscore() {
  try {
    const raw = localStorage.getItem("hs_helmstedt_geoguessr");
    if (!raw) return [];
    return JSON.parse(raw);
  } catch { return []; }
}
function saveHighscore(finalScore) {
  const hs = loadHighscore();
  hs.push({ ts: Date.now(), score: finalScore });
  hs.sort((a, b) => b.score - a.score);
  const top10 = hs.slice(0, 10);
  localStorage.setItem("hs_helmstedt_geoguessr", JSON.stringify(top10));
}
function clearHighscore() {
  localStorage.removeItem("hs_helmstedt_geoguessr");
}
function renderHighscore() {
  const list = byId('highscore-list');
  const hs = loadHighscore();
  list.innerHTML = "";
  if (!hs.length) {
    const li = document.createElement('li');
    li.textContent = "Noch keine Einträge";
    list.appendChild(li);
    return;
  }
  hs.forEach((e, i) => {
    const li = document.createElement('li');
    const date = new Date(e.ts).toLocaleString();
    li.textContent = `${i + 1}. ${e.score} Punkte — ${date}`;
    list.appendChild(li);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initMap();
  renderHighscore();

  byId('btn-new-game').addEventListener('click', newGame);
  byId('btn-new-round').addEventListener('click', async () => {
    byId('btn-new-round').disabled = true;
    await newRound();
  });
  byId('btn-reveal').addEventListener('click', reveal);
  byId('btn-submit').addEventListener('click', submitGuess);

  byId('btn-overlay-close').addEventListener('click', () => showOverlay(false));
  byId('btn-clear-highscore').addEventListener('click', () => {
    clearHighscore();
    renderHighscore();
  });
});
