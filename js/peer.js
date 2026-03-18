// peer.js - PeerJS 连接管理

class GuandanPeer {
    constructor() {
        this.peer = null;
        this.connections = new Map(); // playerId -> PeerJS connection
        this.hostId = null;           // 房主ID
        this.playerId = null;        // 自己ID
        this.playerName = null;      // 自己名字
        this.isHost = false;
        this.onMessage = null;       // 消息回调
        this.onConnect = null;       // 连接回调
        this.onDisconnect = null;    // 断开回调
    }

    // 初始化 Peer
    init(playerName, onMessage, onConnect, onDisconnect) {
        this.playerName = playerName;
        this.onMessage = onMessage;
        this.onConnect = onConnect;
        this.onDisconnect = onDisconnect;
        
        // 生成随机ID
        this.playerId = this.generateId();
        
        return new Promise((resolve, reject) => {
            this.peer = new Peer(this.playerId, {
                debug: 1
            });
            
            this.peer.on('open', (id) => {
                console.log('My peer ID is:', id);
                resolve(id);
            });
            
            this.peer.on('connection', (conn) => {
                this.handleIncomingConnection(conn);
            });
            
            this.peer.on('error', (err) => {
                console.error('Peer error:', err);
                reject(err);
            });
        });
    }

    // 生成随机ID
    generateId() {
        return 'gd-' + Math.random().toString(36).substr(2, 6).toUpperCase();
    }

    // 生成房间号
    generateRoomId() {
        return Math.random().toString(36).substr(2, 6).toUpperCase();
    }

    // 创建房间（作为主机）
    createRoom() {
        this.isHost = true;
        this.hostId = this.playerId;
        const roomId = this.generateRoomId();
        
        // 主机连接到自己的另一个peer作为房间标识
        return new Promise((resolve, reject) => {
            const conn = this.peer.connect(roomId, { reliable: true });
            
            conn.on('open', () => {
                this.connections.set('room', conn);
                resolve(roomId);
            });
            
            conn.on('data', (data) => {
                this.handleMessage(data, conn);
            });
            
            conn.on('close', () => {
                this.connections.delete('room');
            });
        });
    }

    // 加入房间
    joinRoom(roomId, hostId) {
        this.isHost = false;
        this.hostId = hostId || roomId;
        
        return new Promise((resolve, reject) => {
            const conn = this.peer.connect(roomId, { reliable: true });
            
            conn.on('open', () => {
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
                this.connections.delete('host');
                if (this.onDisconnect) {
                    this.onDisconnect();
                }
            });
            
            conn.on('error', (err) => {
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
            const playerId = this.getPlayerIdFromConn(conn);
            if (playerId && this.onDisconnect) {
                this.onDisconnect(playerId);
            }
        });
    }

    // 从连接获取玩家ID
    getPlayerIdFromConn(conn) {
        for (const [id, c] of this.connections) {
            if (c === conn) return id;
        }
        return null;
    }

    // 处理消息
    handleMessage(data, conn) {
        console.log('Received:', data);
        
        switch (data.type) {
            case 'join':
                // 新玩家加入
                this.connections.set(data.playerId, conn);
                if (this.onConnect) {
                    this.onConnect(data.playerId, data.playerName);
                }
                break;
                
            case 'broadcast':
                // 广播消息（主机发给自己，再由主机转发给其他玩家）
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
        return false;
    }

    // 广播消息（仅主机使用）
    broadcast(message, excludeId = null) {
        if (!this.isHost) {
            // 非主机发送给主机，由主机转发
            return this.sendToHost({
                type: 'broadcast',
                message,
                from: this.playerId
            });
        }
        
        // 主机广播给所有玩家
        for (const [id, conn] of this.connections) {
            if (id !== 'room' && id !== excludeId && conn.open) {
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
