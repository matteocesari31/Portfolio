/**
 * One-time helper to get a Spotify refresh token for this portfolio.
 *
 * Prerequisites:
 * 1. Create an app at https://developer.spotify.com/dashboard
 * 2. Add redirect URI exactly: http://127.0.0.1:3847/callback
 * 3. Run:
 *    SPOTIFY_CLIENT_ID=... SPOTIFY_CLIENT_SECRET=... node scripts/get-spotify-refresh-token.mjs
 */

import http from "node:http";
import { URL } from "node:url";

const clientId = process.env.SPOTIFY_CLIENT_ID;
const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
const redirectUri = "http://127.0.0.1:3847/callback";
const scopes = [
  "user-read-currently-playing",
  "user-read-recently-played",
].join(" ");

if (!clientId || !clientSecret) {
  console.error(
    "Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET before running this script."
  );
  process.exit(1);
}

const authUrl = new URL("https://accounts.spotify.com/authorize");
authUrl.searchParams.set("client_id", clientId);
authUrl.searchParams.set("response_type", "code");
authUrl.searchParams.set("redirect_uri", redirectUri);
authUrl.searchParams.set("scope", scopes);
authUrl.searchParams.set("show_dialog", "true");

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, redirectUri);
    if (url.pathname !== "/callback") {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    const code = url.searchParams.get("code");
    const error = url.searchParams.get("error");

    if (error || !code) {
      res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(`Auth failed: ${error || "missing code"}`);
      server.close();
      process.exit(1);
    }

    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    });

    const tokenResponse = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });

    const data = await tokenResponse.json();
    if (!tokenResponse.ok || !data.refresh_token) {
      res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(data, null, 2));
      server.close();
      process.exit(1);
    }

    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(
      "Success. Copy the refresh token from your terminal, then you can close this tab."
    );

    console.log("\nAdd this to Vercel env vars:\n");
    console.log(`SPOTIFY_CLIENT_ID=${clientId}`);
    console.log(`SPOTIFY_CLIENT_SECRET=${clientSecret}`);
    console.log(`SPOTIFY_REFRESH_TOKEN=${data.refresh_token}\n`);

    server.close();
    process.exit(0);
  } catch (err) {
    console.error(err);
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Server error");
    server.close();
    process.exit(1);
  }
});

server.listen(3847, "127.0.0.1", () => {
  console.log("Open this URL in your browser and approve access:\n");
  console.log(authUrl.toString());
  console.log("\nWaiting for Spotify callback on http://127.0.0.1:3847/callback …");
});
