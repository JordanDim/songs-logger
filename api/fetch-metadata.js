import got from "got";
import admin from "firebase-admin";

// Use environment variables on Vercel instead of JSON file
admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n")
  }),
  databaseURL: `https://${process.env.songs-logger}.firebaseio.com`
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
}

export default async function handler(req, res) {
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
      if (song.status === "playing") await logSong(song);
    }

    res.status(200).send("Metadata logged ✅");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error logging metadata");
  }
}
