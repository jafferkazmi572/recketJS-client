# 🎯 RecketJS Client

**RecketJS Client** is a WebSocket-based communication library that provides an HTTP-like request-response mechanism and event-based communication, just like Socket.IO — but with a lightweight and modular design.

> Event-driven WebSockets with built-in request-response and no compromise

> ⚡ Use it in both **Node.js** and **Browser** environments.

---

### 📢 **Notice: Beta Release**

> This package is currently in **active development** and is released under a **beta version**.  
> While it's functional, some APIs may change and issues may arise.  
> Please use it, test it, and report any bugs or suggestions on the [GitHub Issues page](https://github.com/jafferkazmi572/recketJS-client/issues).  
>  
> Contributions are welcome in the form of feedback or issue reports — **code-level contributions are currently restricted** while the core API is being finalized.

---

## 📦 Installation

### NPM
```bash
npm install recketjs
```

### Yarn
```bash
yarn add recketjs
```


## 📄 License

This project is licensed under the [Apache License 2.0](./LICENSE) © 2025 [jafferkazmi572](https://github.com/jafferkazmi572).

## 🧪 Getting Started

```javascript
import RecketClient from "recketjs-client";

const client = new RecketClient("ws://localhost:3000/chat", "/recket", { token: "xyz" });

client.on("connect", () => {
  console.log("✅ Connected to server");
});

client.on("disconnect", () => {
  console.log("❌ Disconnected from server");
});

// Emit custom event
client.emit("say_hello", { name: "Ali" });

// Listen to a custom event
client.on("server_greet", (data) => {
  console.log("Server says:", data);
});
```

### 🔁 Request-Response Example

```javascript
client.request("get_user", { userId: 123 })
  .then(response => {
    console.log("User data:", response);
  })
  .catch(error => {
    console.error("❌ Request failed:", error);
  });
```

### 📩 Handling Server-Initiated Requests
 - First, enable it (only on secure or localhost):

```javascript
client.enableServerRequests();
```
 - Then, register a handler:

```javascript
client.onRequest("ping", (data, respond) => {
  respond({ message: "pong" });
});
```
 - 🛑 To disable:

```javascript
client.disableServerRequests();
```

## 🔌 Reconnection Support

RecketJS handles reconnection automatically — with full control:

### Default Behavior:

 - Auto-reconnect with exponential backoff

 - Pending requests are cleared on disconnect (like HTTP)

 - Queued events are stored during disconnection and sent automatically after reconnection

 - Reconnection events keep you in control

### Options (during construction):

```javascript
const client = new RecketClient(url, path, query, {
  reconnect: true,          // default
  reconnectAttempts: 5,     // default: Infinity
  reconnectDelay: 1000,     // base delay in ms
  maxReconnectDelay: 10000, // max backoff delay
});
```

### Manual Disconnect

```javascript
client.disconnect();
// Prevents auto-reconnect & clears pending queues
```

### Resume Connection

```javascript
client.reconnectResume();
// Manually resume after a disconnect
```

### 📥 Event Queuing:

- If you emit events while disconnected, they are automatically queued and sent after reconnection:
```javascript
client.emit("my_event", { foo: "bar" }); // safely queued if disconnected
```
- You don’t need to check connection state — RecketJS handles it.

### 📡 Reconnection Events:

```javascript
client.on("reconnect", (attempt) => {
  console.log("🔄 Reconnected after", attempt, "attempt(s)");
});

client.on("reconnect_failed", () => {
  console.log("❌ Could not reconnect to the server");
});
```

## 🧠 API Reference

### constructor(url, socketPath?, query?, options?)
 - url – WebSocket URL with namespace (e.g., ws://localhost:3000/chat)
 - socketPath – Optional, defaults to "/recket"
 - query – Optional object { key: value } appended to query string
 - options: optional reconnection config (see above)

### on(event, handler)
- Attach event listeners:
```javascript
client.on("event_name", (data) => {});
```

### emit(event, data?)
- Send events to server:

```javascript
client.emit("event_name", { ... });
```

### request(endpoint, data, timeout?)
- Send request to server with response expected:

```javascript
client.request("endpoint", { ... }).then().catch();
```
- timeout default: 300000ms (5 minutes)

### onRequest(endpoint, handler)
- Handle incoming server requests:

```javascript
client.onRequest("endpoint", (data, respond) => {});
```


### enableServerRequests()
- Enable server-initiated requests (only on secure/ws://localhost)

### disableServerRequests()
- Disable server-initiated requests

### disconnect()
- Manually close connection and disable auto-reconnect

### reconnectResume()
- Resume connection after manual disconnect

### close()
- Close WebSocket connection

## 🌐 Namespace & Path Handling
- You can structure connections like:

```javascript
new RecketClient("ws://localhost:3000/admin", "/recket")
```
 - "/admin" is treated as namespace
 - "/recket" is the base socket path

- Final connection:

```ws://localhost:3000/recket/admin```

## 🛡️ Error Handling
- Common errors are handled automatically:

 - Connection closed

 - Unexpected disconnection

 - Timeout

 - Unregistered handlers

 - Invalid JSON or request failures

 - You can catch them via .catch() or listen for "disconnect".

 ---

 ## 🧪 Environments

- ✅ Node.js
- ✅ Browser

 - Node uses ws internally
 - Browser uses native WebSocket


## 🧑‍💻 Author
Made with ❤️ by a developer who believes in simple yet powerful communication tools.