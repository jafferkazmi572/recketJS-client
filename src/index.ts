/**
 * @license
 * Apache-2.0
 * Copyright (c) 2025 jafferkazmi572
 */

type EventHandler = (data?: any) => void;

class RecketClient {
    private socket!: WebSocket;
    private events: Map<string, EventHandler> = new Map();
    private requestHandlers: Map<string, (data: any, respond: (data: any, error?:  { code: number; message: string }) => void) => void> = new Map();
    private pendingRequests: Map<string, { resolve: Function; reject: Function; timeout: NodeJS.Timeout }> = new Map();
    private allowServerRequests = false;
    private reconnectionAttempts = 5;
    private reconnectionDelay = 1000; // milliseconds
    private shouldReconnect = true;
    private currentAttempt = 0;
    private isManuallyDisconnected = false;
    private eventQueue: Array<{ event: string; data?: any }> = [];
    private namespace: string = '/';  // Default namespace (to be handled later)
    private query!: Record<string, string>;
    private baseUrl!: string;
    private socketPath!: string;

    constructor(url: string , socketPath:string, query: Record<string, string> = {}, options: {
        reconnectionAttempts?: number;
        reconnectionDelay?: number;
        shouldReconnect?: boolean;
      } = {} ) {
        // **Select WebSocket implementation based on environment**
        this.baseUrl = url;
        this.socketPath =  socketPath;
        this.query = query;
        this.reconnectionAttempts = options.reconnectionAttempts ?? 5;
        this.reconnectionDelay = options.reconnectionDelay ?? 1000;
        this.shouldReconnect = options.shouldReconnect ?? true;
        this.initializeSocket()
    }

    enableServerRequests() {
        const url = this.socket.url;

        try {
            const parsedUrl = new URL(url);

            if (parsedUrl.protocol === "wss:" || parsedUrl.hostname === "localhost") {
                this.allowServerRequests = true;
                console.log("✅ Server-to-client requests enabled.");
            } else {
                console.warn(`❌ Cannot enable server requests on an insecure WebSocket connection: ${url}`);
            }
        } catch (error) {
            console.error("❌ Invalid WebSocket URL", error);
        }
    }

    disableServerRequests() {
        this.allowServerRequests = false;
        console.log("❌ Server-to-client requests disabled.");
    }

    // **Register event listeners**
    on(event: string, handler: EventHandler) {
        this.events.set(event, handler);
    }

    // **Emit events to server**
    emit(event: string, data?: any) {
        if (this.socket.readyState !== WebSocket.OPEN) {
            if (!this.isManuallyDisconnected) {
                this.eventQueue.push({ event, data });
            }
            return;
        }
        const payload = JSON.stringify({ event, data });
        this.socket.send(payload);
    }

    // **Close connection**
    close() {
        this.socket.close();
    }

    onRequest(endpoint: string, handler: (data: any, respond: (data: any, error?:  { code: number; message: string }) => void) => void) {
        if (this.requestHandlers.has(endpoint)) {
            throw new Error(`Endpoint "${endpoint}" is already registered.`);
        }
        this.requestHandlers.set(endpoint, handler);
    }
    
    private handleIncomingRequest(request: { id: string; endpoint: string; data: any }) {
        const { id, endpoint, data } = request;
        const handler = this.requestHandlers.get(endpoint);
        if (!handler) {
            console.warn(`No handler registered for endpoint: ${endpoint}`);
            this.sendResponse(id, null,{code:404, message:`No handler registered for endpoint: ${endpoint}`});
            return;
        }
    
        try {
            // User will handle response manually
           handler(data, (responseData, error) => {
                this.sendResponse(id, responseData, error);
            });
        } catch (error: any) {
            this.sendResponse(id, null, { code:500, message: error.message || "Unknown error"});
        }
    }
    
    private sendResponse(id: string, data: any, error?: { code: number; message: string }) {
        this.socket.send(JSON.stringify({response:{ id, data, error }}));
    }
    
    private handleIncomingResponse(response: { id: string; data: any; error?: { code: number; message: string } }) {
        const { id, data, error } = response;
    
        if (this.pendingRequests.has(id)) {
            const { resolve, reject, timeout } = this.pendingRequests.get(id)!;
            clearTimeout(timeout)
            this.pendingRequests.delete(id);
    
            if (error) {
                const err = new Error(error.message || "Unknown Error");
                (err as any).code = error.code || 500; 
                reject(err);
            } else {
                resolve(data);
            }
        }
    }

    private tryReconnect() {
        if (this.currentAttempt >= this.reconnectionAttempts) {
            console.warn("❌ Reconnection failed: Max attempts reached");
            this.events.get("reconnect_failed")?.();
            return;
        }
    
        setTimeout(() => {
            this.currentAttempt++;
            console.log(`🔁 Reconnecting... attempt ${this.currentAttempt}`);
            this.reconnectResume();
            this.reconnectionDelay = Math.min(30000, this.reconnectionDelay * 2);
        }, this.reconnectionDelay);
    }

    private flushEventQueue() {
        this.eventQueue.forEach(({ event, data }) => this.emit(event, data));
        this.eventQueue = [];
    }

    private clearPendingRequests() {
        this.pendingRequests.forEach(({ reject, timeout }) => {
            clearTimeout(timeout);
            reject({ code: 503, message: "WebSocket connection closed" });
        });
        this.pendingRequests.clear();
    }

    private initializeSocket() {
                // **Select WebSocket implementation based on environment**
                const WebSocketImpl = (typeof window !== "undefined" && window.WebSocket)
                ? window.WebSocket  // Browser WebSocket
                : require("ws");    // Node.js WebSocket (ws package)
    
            const parsedUrl = new URL(this.baseUrl);
            const path = this.socketPath || "/recket";
            const namespace = parsedUrl.pathname && parsedUrl?.pathname !== '/' ? parsedUrl?.pathname : "";
            const connectionUrl = `${parsedUrl.protocol}//${parsedUrl.hostname}:${parsedUrl.port}${path}${namespace}`;
            Object.entries(this.query).forEach(([key, value]) => {
                parsedUrl.searchParams.append(key, value);
            });   
            
            const fullConnectionUrl = `${connectionUrl}?${new URLSearchParams(parsedUrl.searchParams).toString()}`;
    
            // **Initialize WebSocket connection**
            this.socket = new WebSocketImpl(fullConnectionUrl);
    
            // **Handle incoming messages**
            this.socket.onmessage = (message) => {
                try {
                    const { event, data, request, response } = JSON.parse(message.data);
                    if(request?.id && request?.endpoint){
                        if(!this.allowServerRequests){
                            return;
                        }
                        this.handleIncomingRequest({id: request?.id,endpoint:request?.endpoint,data:request?.data})
                    }
                    else if (response?.id && (response?.data || response?.error))
                        this.handleIncomingResponse({id:response?.id,data:response?.data,error:response?.error})
                    else if(event === '__system_handshake_ack')
                        this.events.get("connect")?.(); // Fire "connect" event
                    else
                        this.events.get(event)?.(data); 
                } catch (error) {
                    console.error("Error parsing message:", error);
                }
            };
    
            // **Handle connection close**
            this.socket.onclose = () => {
                this.events.get("disconnect")?.();
                this.clearPendingRequests();
            
                if (!this.isManuallyDisconnected && this.shouldReconnect) {
                    this.tryReconnect();
                }
            }
    
            // **Handle errors**
            this.socket.onerror = (error) => {
                console.error("WebSocket error:", error);
            };
    
            this.socket.onopen = () => {
                if (this.currentAttempt > 0) {
                    this.events.get("reconnect")?.();
                }
                this.currentAttempt = 0;
                this.shouldReconnect = true
                this.isManuallyDisconnected = false;
                this.reconnectionDelay = 1000;
                this.flushEventQueue();
            }; 
    }
    
    reconnectResume() {
        if (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING) return;
        this.initializeSocket();
    }
    
    disconnect() {
        if (this.socket.readyState !== WebSocket.OPEN && this.socket.readyState !== WebSocket.CONNECTING) return;
        this.isManuallyDisconnected = true;
        this.shouldReconnect = false;
        this.eventQueue = [];
        this.socket.close();
    }
    
    request(endpoint: string, data: any, timeoutDuration: number =300000): Promise<any> {
        return new Promise((resolve, reject) => {
            if (this.isManuallyDisconnected) {
                reject({ code: 400, message: "Connection manually disconnected" });
                return;
            }            

            if (this.socket.readyState !== WebSocket.OPEN) {
                reject({ code: 503, message: "WebSocket is not connected" });
                return;
            }

            const requestId =  Date.now() + Math.random().toString(36).substring(2, 10);

            const timeout = setTimeout(() => {
                this.pendingRequests.delete(requestId);
                clearTimeout(timeout)
                reject({ code: 408, message: "Request timed out" });
            }, timeoutDuration);

            this.pendingRequests.set(requestId, { resolve, reject, timeout });

            try {
                this.socket.send(JSON.stringify({ request: { id: requestId, endpoint, data } }));
            } catch (err) {
                reject({ code: 500, message: "Failed to send request" });
            }
        });
    }

    get isConnected(): boolean {
        return this.socket.readyState === WebSocket.OPEN;
    }    
    
}

export default RecketClient;
