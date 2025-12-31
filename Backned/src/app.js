import express from "express";
import cors from "cors";
import axios from "axios";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();

app.use(cors());
app.use(express.json());

const publicPath = path.join(__dirname, "..", "public");
app.use(express.static(publicPath));

const M3U_SOURCES = ["https://iptv-org.github.io/iptv/languages/hin.m3u"];

const parseM3U = (data) => {
  const lines = data.split("\n");
  const channels = [];
  let currentChannel = {};

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("#EXTINF:")) {
      const logoMatch = trimmed.match(/tvg-logo="([^"]+)"/);
      currentChannel.logo = logoMatch ? logoMatch[1] : "";

      const groupMatch = trimmed.match(/group-title="([^"]+)"/i);
      currentChannel.group = groupMatch ? groupMatch[1] : "Entertainment";

      const infoPart = trimmed.split(",").pop().trim();
      currentChannel.name = infoPart;
    } else if (trimmed && !trimmed.startsWith("#")) {
      currentChannel.url = trimmed;
      channels.push({ ...currentChannel });
      currentChannel = {};
    }
  });
  return channels;
};

app.get("/api/channels", async (req, res) => {
  try {
    let combinedM3U = "";

    const responses = await Promise.all(
      M3U_SOURCES.map((url) => axios.get(url, { timeout: 5000 }))
    );
    responses.forEach((r) => (combinedM3U += r.data + "\n"));

    const allChannels = parseM3U(combinedM3U);

    const processed = allChannels.map((ch) => {
      const name = ch.name.toLowerCase();
      const group = ch.group.toLowerCase();

      let category = "Entertainment";
      if (name.includes("news") || group.includes("news")) category = "News";
      else if (
        name.includes("movie") ||
        name.includes("cinema") ||
        name.includes("action")
      )
        category = "Movies";
      else if (name.includes("music") || name.includes("hits"))
        category = "Music";
      else if (
        name.includes("sport") ||
        name.includes("ten") ||
        name.includes("six")
      )
        category = "Sports";

      const isHindi =
        name.includes("hindi") ||
        group.includes("hindi") ||
        ["zee", "sony", "star", "colors", "abp", "aaj tak"].some((k) =>
          name.includes(k)
        );

      return { ...ch, category, priority: isHindi ? 1 : 2 };
    });

    processed.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      if (a.category !== b.category)
        return a.category.localeCompare(b.category);
      return a.name.localeCompare(b.name);
    });

    const uniqueChannels = Array.from(
      new Map(processed.map((item) => [item.url, item])).values()
    );

    res.json(uniqueChannels);
  } catch (error) {
    console.error("Fetch Error:", error.message);
    res.status(500).json({ error: "Failed to fetch live streams" });
  }
});

app.get("/proxy", async (req, res) => {
  const streamUrl = req.query.url;
  if (!streamUrl) return res.status(400).send("No URL provided");
  try {
    const response = await axios.get(streamUrl, {
      responseType: "text",
      timeout: 8000,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        Referer: new URL(streamUrl).origin,
      },
    });

    let m3u8Content = response.data;
    const urlObj = new URL(streamUrl);
    const baseUrl =
      urlObj.origin +
      urlObj.pathname.substring(0, urlObj.pathname.lastIndexOf("/") + 1);

    const rewrittenContent = m3u8Content
      .split("\n")
      .map((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) return line;
        const absoluteUrl = trimmed.startsWith("http")
          ? trimmed
          : baseUrl + trimmed;
        if (absoluteUrl.includes(".m3u8"))
          return `/proxy?url=${encodeURIComponent(absoluteUrl)}`;
        return absoluteUrl;
      })
      .join("\n");

    res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.send(rewrittenContent);
  } catch (e) {
    res.status(502).send("Source unreachable");
  }
});

app.get("/", (req, res) => {
  res.sendFile(path.join(publicPath, "index.html"));
});

export default app;
