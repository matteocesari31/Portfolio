const TOKEN_URL = "https://accounts.spotify.com/api/token";
const NOW_URL = "https://api.spotify.com/v1/me/player/currently-playing";
const RECENT_URL =
  "https://api.spotify.com/v1/me/player/recently-played?limit=1";

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=60");
  res.end(JSON.stringify(body));
}

async function getAccessToken() {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  const refreshToken = process.env.SPOTIFY_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    const error = new Error("Missing Spotify environment variables");
    error.code = "CONFIG";
    throw error;
  }

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!response.ok) {
    const error = new Error("Failed to refresh Spotify token");
    error.code = "TOKEN";
    error.status = response.status;
    throw error;
  }

  const data = await response.json();
  return data.access_token;
}

function mapTrack(track, { isPlaying = false, playedAt = null } = {}) {
  if (!track) return null;

  const artists = (track.artists || [])
    .map((artist) => artist.name)
    .filter(Boolean)
    .join(", ");

  const images = track.album?.images || [];
  const image =
    images.find((item) => item.width >= 64 && item.width <= 300)?.url ||
    images[images.length - 1]?.url ||
    null;

  return {
    id: track.id || null,
    isPlaying,
    playedAt,
    title: track.name || "",
    artist: artists,
    album: track.album?.name || "",
    url: track.external_urls?.spotify || null,
    image,
  };
}

async function fetchNowPlaying(accessToken) {
  const response = await fetch(NOW_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (response.status === 204) return null;
  if (!response.ok) {
    const error = new Error("Failed to fetch currently playing");
    error.code = "NOW";
    error.status = response.status;
    throw error;
  }

  const data = await response.json();
  if (!data?.item) return null;
  return mapTrack(data.item, { isPlaying: Boolean(data.is_playing) });
}

async function fetchRecentlyPlayed(accessToken) {
  const response = await fetch(RECENT_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const error = new Error("Failed to fetch recently played");
    error.code = "RECENT";
    error.status = response.status;
    throw error;
  }

  const data = await response.json();
  const item = data?.items?.[0];
  if (!item?.track) return null;
  return mapTrack(item.track, {
    isPlaying: false,
    playedAt: item.played_at || null,
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    json(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const accessToken = await getAccessToken();
    const now = await fetchNowPlaying(accessToken);
    const track = now || (await fetchRecentlyPlayed(accessToken));

    if (!track) {
      json(res, 200, { track: null });
      return;
    }

    json(res, 200, { track });
  } catch (error) {
    const status = error.code === "CONFIG" ? 503 : 502;
    json(res, status, {
      error: error.message || "Spotify unavailable",
      code: error.code || "UNKNOWN",
    });
  }
};
