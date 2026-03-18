// peer.js - PeerJS 连接管理

class GuandanPeer {
    constructor() {
        this.peer = null;
        this.connections = new Map(); // playerId -> PeerJS connection
        this.hostId = null;           // 房主ID
        this.playerId = null;        // 自己ID
        this.playerName = null;      // 自己名字
        this.isHost = false;
        this.onMessage = null;       
        this.onConnect = null;       
        this.onDisconnect = null;    
        this.initialized = false;    
    }

    // 初始化 Peer
    init(playerName, onMessage, onConnect, onDisconnect) {
        this.playerName = playerName;
        this.onMessage = onMessage;
        this.onConnect = onConnect;
        this.onDisconnect = onDisconnect;
        
        // 生成随机ID
        this.playerId = this.generateId();
        console.log('Generated player ID:', this.playerId);
        
        return new Promise((resolve, reject) => {
            try {
                this.peer = new Peer(this.playerId, {
                    debug: 1
                });
                
                this.peer.on('open', (id) => {
                    console.log('PeerJS opened with ID:', id);
                    this.initialized = true;
                    resolve(id);
                });
                
                this.peer.on('connection', (conn) => {
                    console.log('Incoming connection from:', conn.peer);
                    this.handleIncomingConnection(conn);
                });
                
                this.peer.on('error', (err) => {
                    console.error('PeerJS error:', err);
                    reject(err);
                });
                
            } catch (err) {
                console.error('Failed to create Peer:', err);
                reject(err);
            }
        });
    }

    // 生成随机ID
    generateId() {
        return 'gd-' + Math.random().toString(36).substr(2, 6).toUpperCase();
    }

    // 创建房间（作为主机）
    // 房主用自己的 playerId 作为房间地址
    createRoom() {
        this.isHost = true;
        this.hostId = this.playerId;
        
        console.log('Host creating room, hostId:', this.hostId);
        
        // 房间号就是房主的 peerId
        return Promise.resolve(this.hostId);
    }

    // 加入房间 - 房间号就是房主的 peerId
    joinRoom(roomId, hostId) {
        this.isHost = false;
        this.hostId = roomId; // 房间号就是房主的 ID
        
        console.log('Joining room:', roomId);
        
        return new Promise((resolve, reject) => {
            // 直接连接到房主
            const conn = this.peer.connect(roomId, { reliable: true });
            
            const timeout = setTimeout(() => {
                if (!conn.open) {
                    reject(new Error('连接超时，请确认房主在线'));
                }
            }, 10000);
            
            conn.on('open', () => {
                clearTimeout(timeout);
                console.log('Connected to host:', roomId);
                this.connections.set('host', conn);
                
                // 告诉主机自己的信息
                this.sendToHost({
                    type: 'join',
                    playerId: this.playerId,
                    playerName: this.playerName
                });
                resolve();
            });
            
            conn.on('data', (data) => {
                this.handleMessage(data, conn);
            });
            
            conn.on('close', () => {
                console.log('Connection to host closed');
                this.connections.delete('host');
            });
            
            conn.on('error', (err) => {
                clearTimeout(timeout);
                console.error('Connection error:', err);
                reject(err);
            });
        });
    }

    // 处理传入的连接
    handleIncomingConnection(conn) {
        conn.on('open', () => {
            console.log('Connected from:', conn.peer);
        });
        
        conn.on('data', (data) => {
            this.handleMessage(data, conn);
        });
        
        conn.on('close', () => {
            console.log('Connection closed:', conn.peer);
        });
    }

    // 处理消息
    handleMessage(data, conn) {
        console.log('Received:', data);
        
        switch (data.type) {
            case 'join':
                // 新玩家加入 - 记住连接
                this.connections.set(data.playerId, conn);
                if (this.onConnect) {
                    this.onConnect(data.playerId, data.playerName);
                }
                break;
                
            case 'broadcast':
                // 广播消息（主机转发）
                if (this.isHost && this.onMessage) {
                    this.onMessage(data.message, data.from);
                }
                break;
                
            default:
                if (this.onMessage) {
                    this.onMessage(data, conn.peer);
                }
        }
    }

    // 发送消息给主机
    sendToHost(message) {
        const conn = this.connections.get('host');
        if (conn && conn.open) {
            conn.send(message);
            return true;
        }
        console.warn('No connection to host');
        return false;
    }

    // 广播消息（仅主机使用）
    broadcast(message, excludeId = null) {
        if (!this.isHost) {
            return this.sendToHost({
                type: 'broadcast',
                message,
                from: this.playerId
            });
        }
        
        // 主机广播给所有玩家
        for (const [id, conn] of this.connections) {
            if (id !== excludeId && conn.open) {
                conn.send(message);
            }
        }
    }

    // 发送消息给指定玩家
    sendToPlayer(playerId, message) {
        const conn = this.connections.get(playerId);
        if (conn && conn.open) {
            conn.send(message);
            return true;
        }
        return false;
    }

    // 踢人
    kickPlayer(playerId) {
        const conn = this.connections.get(playerId);
        if (conn) {
            conn.send({ type: 'kick' });
            conn.close();
            this.connections.delete(playerId);
        }
    }

    // 断开连接
    disconnect() {
        for (const [id, conn] of this.connections) {
            conn.close();
        }
        this.connections.clear();
        
        if (this.peer) {
            this.peer.destroy();
            this.peer = null;
        }
    }

    // 获取连接状态
    isConnected() {
        return this.peer && this.peer.open;
    }
}

// 导出
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { GuandanPeer };
}
