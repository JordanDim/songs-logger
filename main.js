import got from "got";
import admin from "firebase-admin";

// Initialize Firebase from GitHub Secrets
admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n")
  }),
  databaseURL: `https://${process.env.song-logger}.firebaseio.com`
});

const db = admin.database();
const API_URL = "https://meta.metacast.eu/aim/?radio=radioenergy";

async function logSong(song) {
  const songRef = db.ref("songs").child(song.id);
  const historyRef = db.ref("history");

  const snapshot = await songRef.once("value");

  if (!snapshot.exists()) {
    await songRef.set({
      id: song.id,
      artist: song.artist,
      title: song.title,
      imageUrl: song.imageUrl,
      times: [song.time]
    });
  } else {
    const times = snapshot.val().times || [];
    if (!times.includes(song.time)) times.push(song.time);
    await songRef.update({ times });
  }

  const historyKey = song.time.replace(/[:.+]/g, "-");
  await historyRef.child(historyKey).set({
    id: song.id,
    artist: song.artist,
    title: song.title,
    time: song.time,
    imageUrl: song.imageUrl
  });

  console.log("✅ Logged:", song.artist, "-", song.title, "at", song.time);
}

async function fetchAndLog() {
  try {
    const response = await got(API_URL, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Referer": "https://www.radioenergy.bg/",
        "Origin": "https://www.radioenergy.bg"
      },
      https: { rejectUnauthorized: false },
      responseType: "text"
    });

    const clean = response.body.replace(/^\uFEFF/, "");
    const data = JSON.parse(clean);

    const songs = data.nowplaying || [];
    for (const song of songs) {
      if (song.status === "playing") {
        await logSong(song);
      }
    }
  } catch (err) {
    console.error("❌ Error fetching metadata:", err.message);
    process.exit(1);
  }
}

await fetchAndLog();
