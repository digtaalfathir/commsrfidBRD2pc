const net = require("net");
const axios = require("axios");
const keySender = require("node-key-sender");

const HOST = "192.168.1.201";
const PORT = 9090;

const READER_ID = "C-001";
const FIXED_ANTENNA = "1";
const POST_URL = "http://product.suite.stechoq-j.com/api/v1/warehouse-management/counting-log-rfid";

const client = new net.Socket();
let isConnected = false;

// === Data Buffering ===
let tagBuffer = new Set();
let debounceTimer = null;

// === Fungsi untuk mengirim teks sebagai keyboard ===
function typeAsKeyboard(text) {
  // Mengirim karakter satu per satu seperti keyboard
  keySender.sendText(text).then(() => keySender.sendKey("enter"));
}

// === Fungsi Parsing Tag ===
function parseTagData(hexString) {
  const HEADER = "ea001700a3000c";
  if (!hexString.startsWith(HEADER)) return null;

  const payload = hexString.slice(HEADER.length);
  const epc = payload.slice(0, 24); // EPC = 12 byte = 24 hex
  const remaining = payload.slice(24);

  const match = remaining.match(/3[0-9a-fA-F]00([0-9a-fA-F]{2})/);
  if (!match) return null;

  const antennaHex = match[1];
  const antenna = parseInt(antennaHex, 16);

  return {
    epc: epc.toLowerCase(), // API pakai lowercase
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

function getCurrentTimestampUTC7() {
  const now = new Date();

  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta", // UTC+7
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
    hour12: false,
  });

  // Format terpisah
  const parts = formatter.formatToParts(now).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});

  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}.${parts.fractionalSecond}+0700`;
}

// === Kirim ke API ===
async function postToAPI() {
  if (tagBuffer.size === 0) return;

  const idHex = Array.from(tagBuffer);
  const payload = {
    reader_id: READER_ID,
    antenna: FIXED_ANTENNA,
    idHex: idHex,
    timestamp: getCurrentTimestampUTC7(),
  };

  try {
    // console.log(`[↑] Sending ${idHex.length} tag(s) to server...`);
    console.log(`[↑] Payload: ${JSON.stringify(payload)}`);
    const res = await axios.post(POST_URL, payload);
    console.log(`[↑] Sent ${idHex.length} tag(s) to server. Status: ${res.status}`);
  } catch (err) {
    console.error(`[x] Failed to send data: ${err.message}`);
  } finally {
    tagBuffer.clear();
  }
}

// === Handle Data Masuk ===
client.on("data", (data) => {
  const hex = data.toString("hex");

  const packets = hex.split("ea00").filter((p) => p.length > 0);
  for (const pkt of packets) {
    const fullPkt = "ea00" + pkt;

    if (fullPkt === "ea0004005700bb") {
      console.log("[✓] Reader confirmed scan start/stop (ea0004005700bb)");
      continue;
    }

    const parsed = parseTagData(fullPkt);
    if (parsed) {
      const { epc } = parsed;

      if (!tagBuffer.has(epc)) {
        console.log(`Tag detected: EPC=${epc}, Antenna=${parsed.antenna}`);
        tagBuffer.add(epc);

        // --- KETIKKAN TAG ke layar seperti keyboard ---
        typeAsKeyboard(epc);
      }

      // Reset timeout jika ada tag baru
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        postToAPI();
      }, 3000);
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
      postToAPI().then(() => {
        client.destroy();
        process.exit(0);
      });
    }, 300);
  } else {
    process.exit(0);
  }
});
