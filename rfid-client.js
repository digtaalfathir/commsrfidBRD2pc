const net = require("net");

const HOST = "192.168.1.201";
const PORT = 9090;

function parseTagData(hexString) {
  const HEADER = "ea001700a3000";
  if (!hexString.startsWith(HEADER)) return null;

  const controlByte = 2; // misal "ce"
  const headerLen = HEADER.length + controlByte; // 13 + 2 = 15 char
  const epcLen = 24; // 12 byte = 24 char hex

  const epcStart = headerLen;
  const epc = hexString.slice(epcStart, epcStart + epcLen);

  const antennaField = hexString.slice(epcStart + epcLen, epcStart + epcLen + 6);
  if (!antennaField.startsWith("34000")) return null;

  const antennaChar = antennaField[5];
  const antenna = parseInt(antennaChar, 10);
  if (isNaN(antenna)) return null;

  return {
    epc: epc.toUpperCase(),
    antenna,
  };
}

function sendScanCommand(socket) {
  const scanCommand = Buffer.from("ff059cc6000000", "hex");
  socket.write(scanCommand);
  console.log("[→] Sent scan command: ff059cc6000000");
}

const client = new net.Socket();

client.connect(PORT, HOST, () => {
  console.log(`[✓] Connected to RFID reader at ${HOST}:${PORT}`);
  sendScanCommand(client);
});

client.on("data", (data) => {
  const hex = data.toString("hex");

  // Cek apakah data mengandung lebih dari satu paket
  const packets = hex.split("ea00").filter((p) => p.length > 0);
  for (const pkt of packets) {
    const fullPkt = "ea00" + pkt;
    console.log(`[←] Received packet: ${fullPkt}`);
    const parsed = parseTagData(fullPkt);
    if (parsed) {
      console.log(`[←] Tag detected: EPC=${parsed.epc}, Antenna=${parsed.antenna}`);
    } else {
      console.log(`[!] Unparsed data: ${fullPkt}`);
    }
  }
});

client.on("error", (err) => {
  console.error(`[x] Error: ${err.message}`);
});

client.on("close", () => {
  console.log("[i] Connection closed");
});
