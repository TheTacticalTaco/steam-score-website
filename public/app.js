const form = document.getElementById("lookup-form");
const input = document.getElementById("steamid");
const button = document.getElementById("scan-button");
const statusEl = document.getElementById("status");
const results = document.getElementById("results");
const gamesList = document.getElementById("games-list");
const searchInput = document.getElementById("game-search");
const sortSelect = document.getElementById("sort-games");
let report = null;
const fmt = n => Number(n || 0).toLocaleString();
const escapeHtml = s => String(s ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

form.addEventListener("submit", async event => {
  event.preventDefault();
  const value = input.value.trim();
  if (!value) return;
  button.disabled = true;
  button.innerHTML = 'SCANNING LIBRARY <span>…</span>';
  statusEl.className = "status";
  statusEl.textContent = "Connecting to Steam and checking achievement data… This can take a little while for large libraries.";
  results.classList.add("hidden");
  try {
    const response = await fetch(`/api/score/${encodeURIComponent(value)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Unable to scan this profile.");
    report = data;
    renderReport();
    statusEl.textContent = `Scan complete. ${fmt(data.summary.gamesScanned)} games had readable achievement data.`;
    results.classList.remove("hidden");
    results.scrollIntoView({behavior:"smooth", block:"start"});
  } catch (err) {
    statusEl.className = "status error";
    statusEl.textContent = err.message + (err.message.includes("STEAM_API_KEY") ? " See README.md for setup steps." : "");
  } finally {
    button.disabled = false;
    button.innerHTML = 'CALCULATE SCORE <span>↗</span>';
  }
});

function renderReport() {
  const {profile, summary} = report;
  document.getElementById("avatar").src = profile.avatar || "";
  document.getElementById("player-name").textContent = profile.name;
  const profileLink = document.getElementById("profile-link");
  profileLink.href = profile.profileUrl || "#";
  document.getElementById("total-score").textContent = fmt(summary.totalScore);
  document.getElementById("games-scanned").textContent = fmt(summary.gamesScanned);
  document.getElementById("unlocked").textContent = fmt(summary.unlockedAchievements);
  document.getElementById("total-achievements").textContent = fmt(summary.totalAchievements);
  document.getElementById("completion").textContent = `${summary.completion}%`;
  document.getElementById("completion-bar").style.width = `${summary.completion}%`;
  document.getElementById("perfect-games").textContent = fmt(summary.perfectGames);
  document.getElementById("rarity-note").textContent = `Rarity data was available for ${summary.rarityCoverage}% of achievements scanned. Achievements without a published global rarity percentage aren't scored. Steam may not expose achievement stats for every game.`;
  renderGames();
}

function renderGames() {
  const term = searchInput.value.trim().toLowerCase();
  const sort = sortSelect.value;
  let games = report.games.filter(g => g.name.toLowerCase().includes(term));
  games.sort((a,b) => {
    if (sort === "completion") return b.completion - a.completion || b.score - a.score;
    if (sort === "name") return a.name.localeCompare(b.name);
    if (sort === "playtime") return b.playtimeForever - a.playtimeForever;
    return b.score - a.score;
  });
  gamesList.innerHTML = "";
  if (!games.length) {
    gamesList.innerHTML = '<div class="stat-card">No games match that search.</div>';
    return;
  }
  const template = document.getElementById("game-template");
  games.forEach(game => {
    const fragment = template.content.cloneNode(true);
    const card = fragment.querySelector(".game-card");
    const icon = fragment.querySelector(".game-icon");
    if (game.icon) {
      const img = document.createElement("img");
      img.src = game.icon; img.alt = ""; img.loading = "lazy";
      img.onerror = () => { img.remove(); icon.textContent = game.name.slice(0,2).toUpperCase(); };
      icon.appendChild(img);
    } else icon.textContent = game.name.slice(0,2).toUpperCase();
    fragment.querySelector("h3").textContent = game.name;
    if (game.complete) fragment.querySelector(".perfect-badge").classList.remove("hidden");
    const mins = game.playtimeForever;
    const playtime = mins >= 60 ? `${Math.floor(mins/60)}h played` : `${mins}m played`;
    fragment.querySelector(".game-meta").textContent = `${game.unlockedAchievements}/${game.totalAchievements} achievements · ${game.completion}% complete · ${playtime}${game.complete ? " · +100 perfect-game bonus" : ""}`;
    fragment.querySelector(".game-progress span").style.width = `${game.completion}%`;
    fragment.querySelector(".game-score strong").textContent = fmt(game.score);
    const details = fragment.querySelector(".achievement-details");
    const toggle = fragment.querySelector(".details-toggle");
    toggle.addEventListener("click", () => {
      const opening = details.classList.contains("hidden");
      if (opening && !details.dataset.built) {
        const sorted = [...game.achievements].sort((a,b) => Number(b.achieved)-Number(a.achieved) || (a.rarity ?? 101)-(b.rarity ?? 101));
        details.innerHTML = sorted.map(a => `<div class="achievement-row ${a.achieved ? "unlocked" : "locked"}"><span class="ach-name">${a.achieved ? "✓" : "○"} ${escapeHtml(prettyName(a.name))}</span><span class="ach-meta">${a.rarityKnown ? `${a.rarity.toFixed(2)}% · ${a.points} pts` : "rarity unavailable"}${a.achieved ? "" : " · locked"}</span></div>`).join("");
        details.dataset.built = "1";
      }
      details.classList.toggle("hidden", !opening);
      toggle.textContent = opening ? "DETAILS −" : "DETAILS +";
    });
    gamesList.appendChild(fragment);
  });
}
function prettyName(name) {
  return String(name || "Achievement").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}
searchInput.addEventListener("input", () => { if (report) renderGames(); });
sortSelect.addEventListener("change", () => { if (report) renderGames(); });
