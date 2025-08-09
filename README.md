# commsrfidBRD2pc

`commsrfidBRD2pc` is a Node.js-based application for communicating with a Chinese RFID reader via TCP socket.  
It sends scan/stop commands to the reader, parses incoming RFID tag data, and forwards the collected tag information to a remote API endpoint.

## 🚀 Features

- **TCP Communication with RFID Reader**
  - Connects to RFID reader using IP and port.
  - Sends commands to start and stop scanning.

- **Tag Data Parsing**
  - Extracts EPC (Electronic Product Code) and antenna number from incoming packets.
  - Filters out duplicate tags during a scanning session.

- **Buffered Data Posting**
  - Stores scanned tags in a buffer.
  - Sends batch data to an API after a debounce delay.

- **Timestamp Handling**
  - Generates timestamps in UTC+7 (Asia/Jakarta) with millisecond precision.

## 🛠 Tech Stack

- **Language:** JavaScript (Node.js)
- **Libraries:**  
  - `net` (built-in) – TCP socket communication  
  - `axios` – HTTP POST requests to API  

## 📜 How It Works

1. Establishes a TCP connection to the RFID reader using defined `HOST` and `PORT`.
2. Sends the start scan command to the reader.
3. Listens for incoming data, parses valid tag information, and stores it in a buffer.
4. After 3 seconds of inactivity, sends the buffered tag list to the configured API endpoint.
5. On Ctrl+C, stops scanning, posts any remaining data, and closes the connection.

## ⚙️ Configuration

Edit the constants in the code to match your environment:

```javascript
const HOST = "192.168.1.201"; // Reader IP
const PORT = 9090;            // Reader Port

const READER_ID = "C-001";    // Reader identifier
const FIXED_ANTENNA = "1";    // Antenna number
const POST_URL = "http://example.com/api"; // API endpoint
```

## ▶️ Usage

1. Install dependencies:
   ```bash
   npm install axios
   ```

2. Run the script:
   ```bash
   node index.js
   ```

3. Press `Ctrl+C` to stop scanning and send any remaining data.

## 📡 RFID Protocol Notes

- **Start Scan Command:** `ea0004015701b9`
- **Stop Scan Command:** `ea0004015700ba`
- **Packet Header:** `ea001700a3000c`

The EPC is extracted from the payload (first 24 hex characters after the header).  
Antenna number is parsed from the following bytes.
