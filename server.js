const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.STEAM_API_KEY;

app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

const STEAM = "https://api.steampowered.com";
const COMMUNITY = "https://steamcommunity.com";

async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Steam returned HTTP ${response.status}`);
  return response.json();
}

async function resolveSteamId(input) {
  const value = String(input || "").trim();
  if (!value) throw new Error("Enter a Steam ID, profile URL, or custom URL.");
  const direct = value.match(/^\d{17}$/);
  if (direct) return value;

  const profileMatch = value.match(/steamcommunity\.com\/profiles\/(\d{17})/i);
  if (profileMatch) return profileMatch[1];

  let vanity = value;
  const vanityMatch = value.match(/steamcommunity\.com\/id\/([^/?#]+)/i);
  if (vanityMatch) vanity = vanityMatch[1];
  vanity = vanity.replace(/^\/+|\/+$/g, "");
  if (vanity.includes("/") || vanity.includes(" ")) {
    throw new Error("That doesn't look like a valid Steam ID or profile URL.");
  }
  if (!API_KEY) throw new Error("The server is missing STEAM_API_KEY. Add it to your environment or .env setup.");

  const data = await getJson(`${STEAM}/ISteamUser/ResolveVanityURL/v1/?key=${encodeURIComponent(API_KEY)}&vanityurl=${encodeURIComponent(vanity)}`);
  if (data.response?.success !== 1) throw new Error("Couldn't resolve that custom Steam URL. Try your 17-digit SteamID64.");
  return data.response.steamid;
}

function pointsFor(rarity) {
  if (rarity >= 50) return 5;
  if (rarity >= 40) return 10;
  if (rarity >= 30) return 15;
  if (rarity >= 15) return 20;
  if (rarity >= 10) return 25;
  if (rarity >= 5) return 30;
  if (rarity >= 1) return 35;
  return 50;
}

app.get("/api/score/:steamid", async (req, res) => {
  try {
    if (!API_KEY) return res.status(500).json({ error: "Steam API key isn't configured. Add STEAM_API_KEY to your environment." });
    const steamid = await resolveSteamId(req.params.steamid);
    const [playerData, gamesData] = await Promise.all([
      getJson(`${STEAM}/ISteamUser/GetPlayerSummaries/v2/?key=${encodeURIComponent(API_KEY)}&steamids=${steamid}`),
      getJson(`${STEAM}/IPlayerService/GetOwnedGames/v1/?key=${encodeURIComponent(API_KEY)}&steamid=${steamid}&include_appinfo=true&include_played_free_games=true&include_free_sub=true`)
    ]);

    const player = playerData.response?.players?.[0];
    if (!player) return res.status(404).json({ error: "Steam profile wasn't found." });
    if (!gamesData.response || !Array.isArray(gamesData.response.games)) {
      return res.status(403).json({ error: "Couldn't read owned games. Make sure your Steam game details are public." });
    }

    const games = gamesData.response.games;
    const results = await Promise.all(games.map(async (game) => {
      try {
        const achievementData = await getJson(`${STEAM}/ISteamUserStats/GetPlayerAchievements/v1/?key=${encodeURIComponent(API_KEY)}&steamid=${steamid}&appid=${game.appid}`);
        const playerAchievements = achievementData.playerstats?.achievements;
        if (!Array.isArray(playerAchievements) || !playerAchievements.length) return null;

        let globalMap = {};
        try {
          const globalData = await getJson(`${STEAM}/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/?gameid=${game.appid}`);
          for (const item of globalData.achievementpercentages?.achievements || []) {
            globalMap[item.name] = Number(item.percent);
          }
        } catch (_) {}

        const achievements = playerAchievements.map((a) => {
          const rarity = globalMap[a.apiname];
          const knownRarity = Number.isFinite(rarity);
          const percent = knownRarity ? rarity : null;
          const points = knownRarity ? pointsFor(percent) : 0;
          return {
            name: a.apiname,
            achieved: Boolean(a.achieved),
            unlockTime: a.unlocktime || 0,
            rarity: percent,
            points,
            rarityKnown: knownRarity
          };
        });
        const unlocked = achievements.filter(a => a.achieved);
        const total = achievements.length;
        const complete = total > 0 && unlocked.length === total;
        const achievementPoints = unlocked.reduce((sum, a) => sum + a.points, 0);
        return {
          appid: game.appid,
          name: game.name || `App ${game.appid}`,
          playtimeForever: game.playtime_forever || 0,
          icon: game.img_icon_url ? `https://media.steampowered.com/steamcommunity/public/images/apps/${game.appid}/${game.img_icon_url}.jpg` : null,
          totalAchievements: total,
          unlockedAchievements: unlocked.length,
          completion: total ? Math.round(unlocked.length / total * 100) : 0,
          complete,
          achievementPoints,
          completionBonus: complete ? 100 : 0,
          score: achievementPoints + (complete ? 100 : 0),
          achievements
        };
      } catch (_) {
        return null;
      }
    }));

    const availableGames = results.filter(Boolean);
    const totalAchievements = availableGames.reduce((s, g) => s + g.totalAchievements, 0);
    const unlockedAchievements = availableGames.reduce((s, g) => s + g.unlockedAchievements, 0);
    const totalScore = availableGames.reduce((s, g) => s + g.score, 0);
    const knownRarityCount = availableGames.reduce((s, g) => s + g.achievements.filter(a => a.rarityKnown).length, 0);
    res.json({
      profile: {
        steamid,
        name: player.personaname,
        avatar: player.avatarfull,
        profileUrl: player.profileurl,
        visibility: player.communityvisibilitystate
      },
      summary: {
        gamesScanned: availableGames.length,
        gamesOwned: games.length,
        totalAchievements,
        unlockedAchievements,
        completion: totalAchievements ? Math.round(unlockedAchievements / totalAchievements * 100) : 0,
        totalScore,
        perfectGames: availableGames.filter(g => g.complete).length,
        rarityCoverage: totalAchievements ? Math.round(knownRarityCount / totalAchievements * 100) : 0
      },
      games: availableGames.sort((a, b) => b.score - a.score)
    });
  } catch (error) {
    res.status(400).json({ error: error.message || "Something went wrong while contacting Steam." });
  }
});

app.listen(PORT, () => console.log(`Steam Score is running at http://localhost:${PORT}`));
