const net = require("net");

const HOST = "192.168.1.201";
const PORT = 9090;

const client = new net.Socket();
let isConnected = false;

// === Fungsi Parsing Tag ===
function parseTagData(hexString) {
  const HEADER = "ea001700a3000c";
  if (!hexString.startsWith(HEADER)) return null;

  const payload = hexString.slice(HEADER.length);

  const epc = payload.slice(0, 24); // 12 byte EPC (24 hex)
  const remaining = payload.slice(24);

  // Cari pola seperti "3000", "3100", "3200", ..., "3900", "3400", dll
  const match = remaining.match(/3[0-9a-fA-F]00([0-9a-fA-F]{2})/);
  if (!match) return null;

  const antennaHex = match[1]; // Ambil 2 hex setelah "3X00", contoh: "02"
  const antenna = parseInt(antennaHex, 16);

  if (isNaN(antenna)) return null;

  return {
    epc: epc.toUpperCase(),
    antenna,
  };
}

// === Kirim Scan Command ===
function sendScanCommand(socket) {
  const cmd = Buffer.from("ea0004015701b9", "hex");
  socket.write(cmd);
  console.log("[→] Sent scan command: ea0004015701b9");
}

// === Kirim Stop Command ===
function sendStopCommand(socket) {
  const cmd = Buffer.from("ea0004015700ba", "hex");
  socket.write(cmd, () => {
    console.log("[→] Sent stop command: ea0004015700ba");
  });
}

// === Handle Data Masuk ===
client.on("data", (data) => {
  const hex = data.toString("hex");

  // Pisah jika ada beberapa paket dalam satu frame
  const packets = hex.split("ea00").filter((p) => p.length > 0);
  for (const pkt of packets) {
    const fullPkt = "ea00" + pkt;

    // Cek apakah ini konfirmasi start/stop
    if (fullPkt === "ea0004005700bb") {
      console.log("[✓] Reader confirmed scan start/stop (ea0004005700bb)");
      continue;
    }

    // Cek apakah ini data tag
    const parsed = parseTagData(fullPkt);
    if (parsed) {
      console.log(`Tag detected: EPC=${parsed.epc}, Antenna=${parsed.antenna}`);
    } else {
      console.log(`[!] Unparsed data: ${fullPkt}`);
    }
  }
});

// === Koneksi ke Reader ===
client.connect(PORT, HOST, () => {
  isConnected = true;
  console.log(`[✓] Connected to RFID reader at ${HOST}:${PORT}`);
  sendScanCommand(client);
});

// === Error Handler ===
client.on("error", (err) => {
  console.error(`[x] Error: ${err.message}`);
});

// === Close Handler ===
client.on("close", () => {
  console.log("[i] Connection closed");
  isConnected = false;
});

// === Handle Ctrl+C ===
process.on("SIGINT", () => {
  console.log("\n[i] Caught Ctrl+C. Stopping scan...");
  if (isConnected) {
    sendStopCommand(client);
    setTimeout(() => {
      client.destroy();
      process.exit(0);
    }, 300);
  } else {
    process.exit(0);
  }
});
