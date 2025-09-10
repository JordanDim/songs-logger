import fs from "fs";
import admin from "firebase-admin";
import got from "got";

const serviceAccount = JSON.parse(process.env.FIREBASE_KEY);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://songs-logger-default-rtdb.europe-west1.firebasedatabase.app"
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
    console.log("✅ Logged new song:", song.artist, "-", song.title);
  } else {
    const existingData = snapshot.val();
    const times = existingData.times || [];

    if (!times.includes(song.time)) {
      times.push(song.time);
      await songRef.update({ times });
      console.log("⏭️ Added new time for:", song.artist, "-", song.title);
    } else {
      console.log("⏭️ Duplicate time skipped:", song.artist, "-", song.title);
    }
  }


  const historyKey = song.time.replace(/[:.+]/g, "-"); 
  await historyRef.child(historyKey).set({
    id: song.id,
    artist: song.artist,
    title: song.title,
    time: song.time,
    imageUrl: song.imageUrl
  });
  console.log("🕒 History logged:", song.artist, "-", song.title, "-", song.time);
}



async function fetchMetadata() {
  try {
    const response = await got(API_URL, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Referer": "https://www.radioenergy.bg/",
        "Origin": "https://www.radioenergy.bg",
      },
      https: { rejectUnauthorized: false },
      responseType: "text"
    });

    const clean = response.body.replace(/^\uFEFF/, ""); // strip BOM
    const data = JSON.parse(clean);

    const songs = data.nowplaying || [];
    for (const song of songs) {
    await logSong(song);
    }
  } catch (err) {
    console.error("Error fetching metadata:", err.message);
  }
}


fetchMetadata().then(() => {
  console.log("✅ Song logging completed");
  process.exit(0); 
}).catch((error) => {
  console.error("❌ Error:", error);
  process.exit(1); 
});

