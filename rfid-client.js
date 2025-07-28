const net = require("net");

const HOST = "192.168.1.201";
const PORT = 9090;

const client = new net.Socket();
let isConnected = false;

// Fungsi parsing EPC & Antena
function parseTagData(hexString) {
  const HEADER = "ea001700a3000c";
  if (!hexString.startsWith(HEADER)) return null;

  const payload = hexString.slice(HEADER.length);
  const antennaIndex = payload.indexOf("34000");
  if (antennaIndex === -1 || antennaIndex + 5 >= payload.length) return null;

  const epc = payload.slice(0, antennaIndex);
  const antennaChar = payload.charAt(antennaIndex + 5);
  const antenna = parseInt(antennaChar, 10);
  if (isNaN(antenna)) return null;

  return {
    epc: epc.toUpperCase(),
    antenna,
  };
}

// Kirim perintah mulai scan
function sendScanCommand(socket) {
  const scanCommand = Buffer.from("ea0004015701b9", "hex");
  socket.write(scanCommand);
  console.log("[→] Sent scan command: ea0004015701b9");
}

// Kirim perintah berhenti scan
function sendStopCommand(socket) {
  const stopCommand = Buffer.from("ea0004015700ba", "hex");
  socket.write(stopCommand, () => {
    console.log("[→] Sent stop command: ea0004015700ba");
  });
}

// Koneksi ke RFID reader
client.connect(PORT, HOST, () => {
  isConnected = true;
  console.log(`[✓] Connected to RFID reader at ${HOST}:${PORT}`);
  sendScanCommand(client);
});

// Terima data dari reader
client.on("data", (data) => {
  const hex = data.toString("hex");
  const packets = hex.split("ea00").filter((p) => p.length > 0);
  for (const pkt of packets) {
    const fullPkt = "ea00" + pkt;
    const parsed = parseTagData(fullPkt);
    if (parsed) {
      console.log(`[←] Tag detected: EPC=${parsed.epc}, Antenna=${parsed.antenna}`);
    } else {
      console.log(`[!] Unparsed data: ${fullPkt}`);
    }
  }
});

// Handle error
client.on("error", (err) => {
  console.error(`[x] Error: ${err.message}`);
});

// Handle close
client.on("close", () => {
  console.log("[i] Connection closed");
  isConnected = false;
});

// Tangani Ctrl+C → kirim stop command sebelum keluar
process.on("SIGINT", () => {
  console.log("\n[i] Caught Ctrl+C. Stopping scan...");
  if (isConnected) {
    sendStopCommand(client);
    setTimeout(() => {
      client.destroy();
      process.exit(0);
    }, 300); // Tunggu 300ms agar command terkirim
  } else {
    process.exit(0);
  }
});
