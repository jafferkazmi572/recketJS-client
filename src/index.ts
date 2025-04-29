/**
 * @license
 * Apache-2.0
 * Copyright (c) 2025 jafferkazmi572
 */

type EventHandler = (data?: any) => void;

class RecketClient {
    private socket: WebSocket;
    private events: Map<string, EventHandler> = new Map();
    private requestHandlers: Map<string, (data: any, respond: (data: any, error?:  { code: number; message: string }) => void) => void> = new Map();
    private pendingRequests: Map<string, { resolve: Function; reject: Function; timeout: NodeJS.Timeout }> = new Map();
    private allowServerRequests = false;
    private namespace: string = '/';  // Default namespace (to be handled later)
    private query: Record<string, string>; 

    constructor(url: string , socketPath:string, query: Record<string, string> = {}) {
        // **Select WebSocket implementation based on environment**
        const WebSocketImpl = (typeof window !== "undefined" && window.WebSocket)
            ? window.WebSocket  // Browser WebSocket
            : require("ws");    // Node.js WebSocket (ws package)

        this.query = query;
        const parsedUrl = new URL(url);
        const path = socketPath || "/recket";
        const namespace = parsedUrl.pathname && parsedUrl?.pathname !== '/' ? parsedUrl?.pathname : "";
        const connectionUrl = `${parsedUrl.protocol}//${parsedUrl.hostname}:${parsedUrl.port}${path}${namespace}`;
        Object.entries(query).forEach(([key, value]) => {
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

        // **Handle connection open**
        this.socket.onopen = () => {
          //  this.events.get("connect")?.(); // Fire "connect" event
        };

        // **Handle connection close**
        this.socket.onclose = () => {
            this.events.get("disconnect")?.(); // Fire "disconnect" event
            this.pendingRequests.forEach(({ reject,timeout }) => {
                clearTimeout(timeout);
                reject({ code: 503, message: "WebSocket connection closed" });
            });
            this.pendingRequests.clear();
            
        };

        // **Handle errors**
        this.socket.onerror = (error) => {
            console.error("WebSocket error:", error);
        };
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
    
    request(endpoint: string, data: any, timeoutDuration: number =300000): Promise<any> {
        return new Promise((resolve, reject) => {

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
    
}

export default RecketClient;
