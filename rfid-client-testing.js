const net = require("net");
const axios = require("axios");
const fs = require("fs");
const readline = require("readline");
const path = require("path");

const HOST = "192.168.1.201";
const PORT = 9090;

const READER_ID = "C-001";
const FIXED_ANTENNA = "1";
const POST_URL = "http://product.suite.stechoq-j.com/api/v1/warehouse-management/counting-log-rfid";

const MAPPING_FILE = path.join(__dirname, "mapping.json");

let mode = process.argv.includes("--mode") ? process.argv[process.argv.indexOf("--mode") + 1] : "map";
let isConnected = false;
let tagBuffer = new Set();
let debounceTimer = null;

// Load mapping
function loadMapping() {
  if (fs.existsSync(MAPPING_FILE)) {
    return JSON.parse(fs.readFileSync(MAPPING_FILE, "utf8"));
  }
  return {};
}

// Save mapping
function saveMapping(data) {
  fs.writeFileSync(MAPPING_FILE, JSON.stringify(data, null, 2), "utf8");
  console.log("[✓] Mapping saved.");
}

function getCurrentTimestampUTC7() {
  const now = new Date();
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
    hour12: false,
  }).format(now);
}

// Parse tag data
function parseTagData(hexString) {
  const HEADER = "ea001700a3000c";
  if (!hexString.startsWith(HEADER)) return null;

  const payload = hexString.slice(HEADER.length);
  const epc = payload.slice(0, 24);
  const remaining = payload.slice(24);

  const match = remaining.match(/3[0-9a-fA-F]00([0-9a-fA-F]{2})/);
  if (!match) return null;

  const antennaHex = match[1];
  const antenna = parseInt(antennaHex, 16);

  return { epc: epc.toLowerCase(), antenna };
}

// Commands
function sendScanCommand(socket) {
  socket.write(Buffer.from("ea0004015701b9", "hex"));
}
function sendStopCommand(socket) {
  socket.write(Buffer.from("ea0004015700ba", "hex"));
}

// Prompt helper
function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) =>
    rl.question(question, (ans) => {
      rl.close();
      resolve(ans.trim());
    })
  );
}

// Handle data
async function handleTag(epc) {
  if (mode === "map") {
    if (!tagBuffer.has(epc)) {
      console.log(`[MAP MODE] Tag detected: ${epc}`);
      const pos = await prompt("Masukkan posisi (contoh: A1-1): ");
      let mapping = loadMapping();
      mapping[pos] = epc;
      saveMapping(mapping);
      tagBuffer.add(epc);
    }
  } else if (mode === "check") {
    if (!tagBuffer.has(epc)) {
      tagBuffer.add(epc);
      console.log(`[+] Tag baru terdeteksi (${tagBuffer.size} unik): ${epc}`);
    } else {
      //   console.log(`[=] Tag sudah ada (${tagBuffer.size} unik): ${epc}`);
    }

    // Reset timer hasil akhir
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      checkMissingTags();
    }, 3000);
  }
}

// Check missing
function checkMissingTags() {
  const mapping = loadMapping();
  const detected = Array.from(tagBuffer);

  console.log("\n=== Hasil Pengecekan Gate ===");
  let missing = [];
  let unknown = [];

  for (const [pos, epc] of Object.entries(mapping)) {
    if (!detected.includes(epc)) {
      missing.push({ pos, epc });
    }
  }
  for (const epc of detected) {
    if (!Object.values(mapping).includes(epc)) {
      unknown.push(epc);
    }
  }

  console.log("Tag Hilang:", missing.length > 0 ? missing : "Tidak ada");
  console.log("Tag Tak Dikenal:", unknown.length > 0 ? unknown : "Tidak ada");

  // Simpan hasil
  fs.writeFileSync(`scan_result_${Date.now()}.json`, JSON.stringify({ missing, unknown, detected }, null, 2));
  console.log("[✓] Hasil disimpan ke file.");
}

// TCP connection
const client = new net.Socket();
client.on("data", (data) => {
  const hex = data.toString("hex");
  const packets = hex.split("ea00").filter((p) => p.length > 0);
  for (const pkt of packets) {
    const fullPkt = "ea00" + pkt;
    if (fullPkt === "ea0004005700bb") continue;
    const parsed = parseTagData(fullPkt);
    if (parsed) handleTag(parsed.epc);
  }
});
client.connect(PORT, HOST, () => {
  isConnected = true;
  console.log(`[✓] Connected. Mode: ${mode}`);
  sendScanCommand(client);
});
process.on("SIGINT", () => {
  console.log("\n[i] Stopping scan...");
  if (isConnected) {
    sendStopCommand(client);
    setTimeout(() => {
      if (mode === "check") checkMissingTags();
      client.destroy();
      process.exit(0);
    }, 300);
  }
});
