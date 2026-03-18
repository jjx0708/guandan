// game.js - 游戏主逻辑

class GuandanGame {
    constructor() {
        this.peer = new GuandanPeer();
        
        // 游戏状态
        this.gameState = 'login'; // login, waiting, playing, tribute, return
        this.isHost = false;
        this.myPosition = -1;     // 0-3: 南、西、北、东
        this.playerNames = ['', '', '', ''];
        this.playerIds = ['', '', '', ''];
        this.roomId = '';
        
        // 牌
        this.myHand = [];
        this.lastPlayCards = null;       // 上一次出牌
        this.lastPlayer = -1;            // 上一次出牌的人
        this.playedThisRound = [];       // 这一轮各玩家出的牌
        
        // 游戏进度
        this.currentLevel = 'A';         // 当前打的级别
        this.currentPlayer = 0;          // 当前出牌玩家
        this.fengRenPei = null;          // 逢人配
        
        // 记分
        this.ourScore = 0;               // 我方得分
        this.theirScore = 0;             // 对家得分
        this.totalScore = 0;             // 累计分
        this.roundScores = [];           // 每局得分历史
        
        // 贡牌阶段
        this.tributeState = null;        // 'tribute' | 'return' | null
        this.tributeCards = [];           // 贡的牌
        this.returnCards = [];            // 还的牌
        
        // UI
        this.selectedCards = [];
        this.passCount = 0;              // 这轮过牌的数量
        
        this.bindEvents();
    }

    // 绑定事件
    bindEvents() {
        // 登录
        document.getElementById('create-room-btn').addEventListener('click', () => this.createRoom());
        document.getElementById('join-room-btn').addEventListener('click', () => this.showJoinForm());
        document.getElementById('confirm-join-btn').addEventListener('click', () => this.joinRoom());
        
        // 等待房间
        document.getElementById('copy-room-id-btn').addEventListener('click', () => this.copyRoomId());
        document.getElementById('start-game-btn').addEventListener('click', () => this.startGame());
        document.getElementById('kick-player-btn').addEventListener('click', () => this.onKickButtonClick());
        
        // 游戏
        document.getElementById('play-cards-btn').addEventListener('click', () => this.playCards());
        document.getElementById('pass-btn').addEventListener('click', () => this.pass());
        
        // 弹窗
        document.getElementById('tribute-confirm-btn').addEventListener('click', () => this.confirmTribute());
        document.getElementById('continue-btn').addEventListener('click', () => this.continueGame());
        document.getElementById('restart-btn').addEventListener('click', () => this.restartGame());
    }

    // 创建房间
    async createRoom() {
        const name = document.getElementById('player-name').value.trim();
        console.log('创建房间 clicked, name:', name);
        
        if (!name) {
            alert('请输入名字');
            return;
        }
        
        try {
            console.log('初始化 PeerJS...');
            await this.peer.init(name, 
                (msg, from) => this.handleMessage(msg, from),
                (playerId, playerName) => this.handlePlayerJoin(playerId, playerName),
                (playerId) => this.handlePlayerLeave(playerId)
            );
            
            console.log('创建房间...');
            this.roomId = await this.peer.createRoom();
            console.log('房间号:', this.roomId);
            
            this.isHost = true;
            this.myPosition = 0;
            this.playerNames[0] = name;
            this.playerIds[0] = this.peer.playerId;
            
            this.showWaitingRoom();
        } catch (err) {
            console.error('创建房间失败:', err);
            alert('创建房间失败: ' + err.message);
        }
    }

    // 显示加入表单
    showJoinForm() {
        document.getElementById('join-form').classList.remove('hidden');
    }

    // 加入房间
    async joinRoom() {
        const name = document.getElementById('player-name').value.trim();
        const roomId = document.getElementById('room-id-input').value.trim().toUpperCase();
        
        if (!name || !roomId) {
            alert('请输入名字和房间号');
            return;
        }
        
        try {
            await this.peer.init(name,
                (msg, from) => this.handleMessage(msg, from),
                (playerId, playerName) => this.handlePlayerJoin(playerId, playerName),
                (playerId) => this.handlePlayerLeave(playerId)
            );
            
            await this.peer.joinRoom(roomId);
            this.roomId = roomId;
            this.isHost = false;
            
            this.showWaitingRoom();
        } catch (err) {
            console.error('加入房间失败:', err);
            alert('加入房间失败: ' + err.message);
        }
    }

    // 显示等待房间
    showWaitingRoom() {
        this.gameState = 'waiting';
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('waiting-room-screen').classList.remove('hidden');
        document.getElementById('display-room-id').textContent = this.roomId;
        
        if (this.isHost) {
            document.getElementById('host-controls').classList.remove('hidden');
        }
        
        this.updatePlayersList();
    }

    // 更新玩家列表
    updatePlayersList() {
        const positions = ['南家(庄家)', '西家', '北家', '东家'];
        
        for (let i = 0; i < 4; i++) {
            const slot = document.getElementById(`player-${i}`);
            const nameEl = slot.querySelector('.player-name');
            const statusEl = slot.querySelector('.player-status');
            
            if (this.playerNames[i]) {
                nameEl.textContent = this.playerNames[i];
                statusEl.textContent = i === this.myPosition ? '(我)' : '已准备';
                slot.classList.add('ready');
            } else {
                nameEl.textContent = '等待中...';
                statusEl.textContent = '';
                slot.classList.remove('ready');
            }
        }
        
        // 如果是房主，更新踢人选择框
        if (this.isHost) {
            this.updateKickSelect();
        }
    }

    // 复制房间号
    copyRoomId() {
        navigator.clipboard.writeText(this.roomId);
        alert('房间号已复制');
    }

    // 处理玩家加入
    handlePlayerJoin(playerId, playerName) {
        let position = -1;
        for (let i = 0; i < 4; i++) {
            if (!this.playerIds[i]) {
                position = i;
                break;
            }
        }
        
        if (position === -1) {
            this.peer.sendToPlayer(playerId, { type: 'room-full' });
            return;
        }
        
        this.playerIds[position] = playerId;
        this.playerNames[position] = playerName;
        
        this.peer.broadcast({
            type: 'player-update',
            players: this.playerNames,
            playerIds: this.playerIds
        });
        
        this.updatePlayersList();
    }

    // 处理玩家离开
    handlePlayerLeave(playerId) {
        const position = this.playerIds.indexOf(playerId);
        if (position !== -1) {
            this.playerIds[position] = '';
            this.playerNames[position] = '';
            
            this.peer.broadcast({
                type: 'player-update',
                players: this.playerNames,
                playerIds: this.playerIds
            });
            
            this.updatePlayersList();
        }
    }

    // 踢人按钮点击
    onKickButtonClick() {
        const select = document.getElementById('kick-player-select');
        
        if (select.classList.contains('hidden')) {
            select.classList.remove('hidden');
        } else {
            // 如果已显示，执行踢人
            const playerIndex = select.value;
            
            if (!playerIndex) {
                select.classList.add('hidden');
                return;
            }
            
            const idx = parseInt(playerIndex);
            if (this.playerIds[idx]) {
                this.peer.kickPlayer(this.playerIds[idx]);
                select.value = '';
            }
            select.classList.add('hidden');
        }
    }

    // 踢人（实际执行）
    kickPlayer() {
        const select = document.getElementById('kick-player-select');
        const playerIndex = select.value;
        
        if (!playerIndex) {
            alert('请选择要踢出的玩家');
            return;
        }
        
        const idx = parseInt(playerIndex);
        if (this.playerIds[idx]) {
            this.peer.kickPlayer(this.playerIds[idx]);
            select.value = '';
        }
    }

    // 更新踢人选择框
    updateKickSelect() {
        const select = document.getElementById('kick-player-select');
        select.innerHTML = '<option value="">选择玩家...</option>';
        
        for (let i = 1; i < 4; i++) {
            if (this.playerIds[i] && i !== this.myPosition) {
                const option = document.createElement('option');
                option.value = i;
                option.textContent = this.playerNames[i] || `玩家${i+1}`;
                select.appendChild(option);
            }
        }
    }

    // 开始游戏
    startGame() {
        const playerCount = this.playerIds.filter(id => id).length;
        if (playerCount < 4) {
            alert('需要4人才能开始游戏');
            return;
        }
        
        // 重置游戏状态
        this.resetRound();
        
        // 发牌
        const deck = shuffleDeck(createDeck());
        const hands = dealCards(deck, 4);
        
        // 确定我的位置
        const myIndex = this.playerIds.indexOf(this.peer.playerId);
        this.myPosition = myIndex;
        
        // 重新排列手牌
        const rotatedHands = [];
        for (let i = 0; i < 4; i++) {
            rotatedHands[i] = hands[(myIndex + i) % 4];
        }
        
        // 发给各玩家
        for (let i = 0; i < 4; i++) {
            if (i === 0) {
                this.myHand = rotatedHands[0];
            } else {
                this.peer.sendToPlayer(this.playerIds[(myIndex + i) % 4], {
                    type: 'deal-cards',
                    hand: rotatedHands[i].map(c => cardToObj(c))
                });
            }
        }
        
        // 生成逢人配
        this.generateFengRenPei();
        
        // 随机头游
        this.currentPlayer = Math.floor(Math.random() * 4);
        
        // 广播游戏开始
        this.peer.broadcast({
            type: 'game-start',
            hands: rotatedHands.slice(1).map(h => h.map(c => cardToObj(c))),
            currentPlayer: this.currentPlayer,
            fengRenPei: this.fengRenPei,
            level: this.currentLevel,
            positions: this.getPositionMapping()
        });
        
        // 进入游戏界面
        this.enterGame();
        
        // 检查是否需要贡牌（上局有上游）
        this.checkTribute();
    }

    // 重置回合
    resetRound() {
        this.myHand = [];
        this.lastPlayCards = null;
        this.lastPlayer = -1;
        this.playedThisRound = [null, null, null, null];
        this.selectedCards = [];
        this.passCount = 0;
        this.tributeState = null;
        this.tributeCards = [];
        this.returnCards = [];
    }

    // 获取位置映射
    getPositionMapping() {
        const myIndex = this.playerIds.indexOf(this.peer.playerId);
        const mapping = {};
        for (let i = 0; i < 4; i++) {
            mapping[(i - myIndex + 4) % 4] = i;
        }
        return mapping;
    }

    // 生成逢人配
    generateFengRenPei() {
        // 固定红桃级牌是逢人配
        const heartLevelCard = this.myHand.find(c => c.suit === '♥' && c.rank === this.currentLevel);
        if (heartLevelCard) {
            this.fengRenPei = cardToObj(heartLevelCard);
            return;
        }
        
        // 随机选一张非大小王的牌
        const nonJokers = this.myHand.filter(c => !c.isJoker);
        if (nonJokers.length > 0) {
            const randomCard = nonJokers[Math.floor(Math.random() * nonJokers.length)];
            this.fengRenPei = cardToObj(randomCard);
        }
    }

    // 进入游戏界面
    enterGame() {
        this.gameState = 'playing';
        document.getElementById('waiting-room-screen').classList.add('hidden');
        document.getElementById('game-screen').classList.remove('hidden');
        
        // 隐藏所有弹窗
        document.getElementById('tribute-modal').classList.add('hidden');
        document.getElementById('game-over-modal').classList.add('hidden');
        document.getElementById('waiting-tribute').classList.add('hidden');
        
        this.updateUI();
    }

    // 检查是否需要贡牌
    // 注意：第一局不打贡牌，从第二局开始根据上局结果贡牌
    checkTribute() {
        // 第一局不打贡牌
        if (this.roundScores.length === 0) {
            return;
        }
        
        const lastRound = this.roundScores[this.roundScores.length - 1];
        if (!lastRound) return;
        
        if (lastRound.isDoubleWin) {
            // 双下，两个输家都要贡牌
            this.startTributePhase([2, 3]);
        } else if (lastRound.winners && lastRound.winners[0] !== -1) {
            // 头游给四游，二游给三游
            const winner2 = lastRound.winners[1];
            if (winner2 !== undefined) {
                this.startTributePhase([winner2 === 0 ? 3 : (winner2 === 1 ? 2 : winner2)]);
            }
        }
    }

    // 开始贡牌阶段
    startTributePhase(loserPositions) {
        this.tributeState = 'tribute';
        this.tributeCards = [];
        
        const msg = {
            type: 'tribute-phase',
            losers: loserPositions
        };
        
        if (this.isHost) {
            // 主机广播贡牌阶段
            this.peer.broadcast(msg);
        }
        
        // 检查自己是否需要贡牌
        if (loserPositions.includes(this.myPosition)) {
            this.showTributeModal(false);
        } else {
            document.getElementById('waiting-tribute').classList.remove('hidden');
        }
    }

    // 处理消息
    handleMessage(msg, from) {
        console.log('Game message:', msg);
        
        switch (msg.type) {
            case 'player-update':
                this.playerNames = msg.players;
                this.playerIds = msg.playerIds;
                this.updatePlayersList();
                break;
                
            case 'game-start':
                this.handleGameStart(msg);
                break;
                
            case 'deal-cards':
                this.myHand = msg.hand.map(c => objToCard(c));
                sortHand(this.myHand);
                break;
                
            case 'tribute-phase':
                this.handleTributePhase(msg);
                break;
                
            case 'tribute-card':
                this.handleTributeCard(msg);
                break;
                
            case 'return-card':
                this.handleReturnCard(msg);
                break;
                
            case 'tribute-complete':
                this.handleTributeComplete(msg);
                break;
                
            case 'play-cards':
                this.handlePlayCards(msg);
                break;
                
            case 'pass':
                this.handlePass(msg);
                break;
                
            case 'round-end':
                this.handleRoundEnd(msg);
                break;
                
            case 'game-over':
                this.handleGameOver(msg);
                break;
                
            case 'kick':
                alert('你被踢出房间');
                location.reload();
                break;
                
            case 'room-full':
                alert('房间已满');
                location.reload();
                break;
        }
    }

    // 处理游戏开始
    handleGameStart(msg) {
        this.myHand = msg.hand.map(c => objToCard(c));
        sortHand(this.myHand);
        
        this.currentPlayer = msg.currentPlayer;
        this.fengRenPei = msg.fengRenPei;
        this.currentLevel = msg.level;
        
        for (let i = 0; i < 4; i++) {
            if (msg.positions[i] === 0) {
                this.myPosition = i;
                break;
            }
        }
        
        this.enterGame();
        this.checkTribute();
    }

    // 处理贡牌阶段
    handleTributePhase(msg) {
        this.tributeState = 'tribute';
        this.tributeCards = [];
        
        if (msg.losers.includes(this.myPosition)) {
            this.showTributeModal(false);
        } else {
            document.getElementById('waiting-tribute').classList.remove('hidden');
        }
    }

    // 处理贡牌
    handleTributeCard(msg) {
        this.tributeCards.push({ player: msg.player, card: msg.card });
        
        // 检查是否所有人都贡完了
        if (this.tributeCards.length === (this.tributeState === 'tribute' ? 1 : 2)) {
            // 进入还牌阶段
            this.tributeState = 'return';
            
            // 确定还牌对象
            const returnTo = this.tributeCards[0].player;
            
            const returnMsg = {
                type: 'return-phase',
                returnTo: returnTo
            };
            
            this.peer.broadcast(returnMsg);
            
            if (this.myPosition === returnTo) {
                this.showTributeModal(true);
            }
        }
    }

    // 处理还牌
    handleReturnCard(msg) {
        this.returnCards.push(msg.card);
        
        // 贡牌完成
        const completeMsg = {
            type: 'tribute-complete',
            tributeCards: this.tributeCards,
            returnCards: this.returnCards
        };
        
        this.peer.broadcast(completeMsg);
        this.handleTributeComplete(completeMsg);
    }

    // 处理贡牌完成
    handleTributeComplete(msg) {
        document.getElementById('waiting-tribute').classList.add('hidden');
        document.getElementById('tribute-modal').classList.add('hidden');
        
        // 把贡的牌给赢家，还的牌给输家
        // 这里简化处理，收到牌后加入手牌
        
        this.tributeState = null;
        this.updateUI();
    }

    // 显示贡牌/还牌弹窗
    showTributeModal(isReturn) {
        document.getElementById('tribute-modal').classList.remove('hidden');
        document.getElementById('tribute-title').textContent = isReturn ? '请还牌' : '请贡牌';
        document.getElementById('tribute-desc').textContent = isReturn 
            ? '请选择一张≤10的牌还给下家' 
            : '请选择一张最大的牌贡给上家';
        
        this.renderHand('tribute-cards', isReturn ? c => isSmallCard(c) : null);
    }

    // 确认贡牌/还牌
    confirmTribute() {
        if (this.selectedCards.length !== 1) {
            alert('请选择一张牌');
            return;
        }
        
        const card = cardToObj(this.selectedCards[0]);
        
        // 从手牌中移除
        this.myHand = this.myHand.filter(c => !(c.suit === card.suit && c.rank === card.rank));
        this.selectedCards = [];
        
        const msg = {
            type: this.tributeState === 'tribute' ? 'tribute-card' : 'return-card',
            card: card,
            player: this.myPosition
        };
        
        this.peer.broadcast(msg);
        
        if (this.tributeState === 'return') {
            this.returnCards.push(card);
            // 贡牌完成
            this.peer.broadcast({
                type: 'tribute-complete',
                tributeCards: this.tributeCards,
                returnCards: this.returnCards
            });
            this.handleTributeComplete({
                tributeCards: this.tributeCards,
                returnCards: this.returnCards
            });
        }
        
        document.getElementById('tribute-modal').classList.add('hidden');
        this.updateUI();
    }

    // 处理出牌
    handlePlayCards(msg) {
        const cards = msg.cards.map(c => objToCard(c));
        this.playedThisRound[msg.player] = cards;
        this.lastPlayCards = cards;
        this.lastPlayer = msg.player;
        this.passCount = 0;
        this.currentPlayer = (msg.player + 1) % 4;
        
        // 检查是否有人赢了这一轮
        this.checkRoundEnd();
        
        this.updateUI();
    }

    // 处理过牌
    handlePass(msg) {
        this.passCount++;
        this.playedThisRound[msg.player] = [];
        this.currentPlayer = (msg.player + 1) % 4;
        
        // 检查是否所有人都过了
        if (this.passCount >= 3 && this.lastPlayCards) {
            // 最后出牌的人获胜
            this.currentPlayer = this.lastPlayer;
        }
        
        this.updateUI();
    }

    // 检查回合结束
    checkRoundEnd() {
        // 检查是否有人没牌了
        let winner = -1;
        
        // 我自己
        if (this.myHand.length === 0 && this.gameState === 'playing') {
            winner = this.myPosition;
        }
        
        // 广播检查
        if (this.isHost) {
            // 收集各玩家手牌数量
            const handSizes = [this.myHand.length];
            this.peer.broadcast({ type: 'check-hand-size' });
        }
    }

    // 出牌
    playCards() {
        if (this.selectedCards.length === 0) return;
        
        const tableCards = this.lastPlayCards ? this.lastPlayCards.map(c => cardToObj(c)) : [];
        const selected = this.selectedCards.map(c => cardToObj(c));
        
        if (!canPlayCards(selected, tableCards, this.currentLevel, this.fengRenPei, !this.lastPlayCards)) {
            alert('无效的出牌');
            return;
        }
        
        // 从手牌中移除
        const selectedForRemoval = this.selectedCards.map(c => c.clone());
        this.myHand = this.myHand.filter(c => {
            for (const s of selectedForRemoval) {
                if (c.suit === s.suit && c.rank === s.rank) {
                    return false;
                }
            }
            return true;
        });
        
        // 广播出牌
        this.peer.broadcast({
            type: 'play-cards',
            cards: selected,
            player: this.myPosition
        });
        
        this.lastPlayCards = selectedForRemoval;
        this.lastPlayer = this.myPosition;
        this.selectedCards = [];
        this.passCount = 0;
        
        // 检查是否赢了
        if (this.myHand.length === 0) {
            this.handlePlayerWin(this.myPosition);
        }
        
        this.currentPlayer = (this.myPosition + 1) % 4;
        this.updateUI();
    }

    // 处理玩家获胜
    handlePlayerWin(position) {
        // 计算本轮得分
        const roundResult = this.calculateRoundResult(position);
        
        // 广播回合结束
        this.peer.broadcast({
            type: 'round-end',
            ...roundResult
        });
        
        this.handleRoundEnd(roundResult);
    }

    // 计算回合结果
    calculateRoundResult(winner) {
        // 三一二制记分
        const scoreMap = { 0: 3, 1: 1, 2: -1, 3: -3 };
        
        // 检查双下
        const partner = (winner + 2) % 4;
        const isDoubleWin = true; // 简化：每次头游赢就算双下
        
        // 计算升级
        let levelChange = 1;
        if (isDoubleWin) {
            levelChange = 3;
        }
        
        const newLevel = this.getNextLevel(this.currentLevel, levelChange);
        
        const scoreChanges = [];
        for (let i = 0; i < 4; i++) {
            scoreChanges.push({
                name: this.playerNames[i] || `玩家${i+1}`,
                score: scoreMap[i],
                change: scoreMap[i]
            });
        }
        
        // 更新分数
        const winnerTeam = winner % 2; // 0或2是搭档
        const ourChange = winnerTeam === 0 ? scoreMap[0] + scoreMap[2] : scoreMap[1] + scoreMap[3];
        
        this.ourScore += ourChange;
        this.theirScore -= ourChange;
        this.totalScore += ourChange;
        
        return {
            winners: [winner, partner],
            isDoubleWin,
            scoreChanges,
            ourScoreChange: ourChange,
            newLevel: newLevel
        };
    }

    // 获取下一级
    getNextLevel(currentLevel, change = 1) {
        const levels = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
        const currentIndex = levels.indexOf(currentLevel);
        if (currentIndex === -1) return 'A';
        
        const newIndex = Math.min(levels.length - 1, currentIndex + change);
        return levels[newIndex];
    }

    // 过牌
    pass() {
        this.selectedCards = [];
        
        this.peer.broadcast({
            type: 'pass',
            player: this.myPosition
        });
        
        this.passCount++;
        
        // 如果3人都过了
        if (this.passCount >= 3 && this.lastPlayer !== -1) {
            this.currentPlayer = this.lastPlayer;
        } else {
            this.currentPlayer = (this.myPosition + 1) % 4;
        }
        
        this.updateUI();
    }

    // 处理回合结束
    handleRoundEnd(msg) {
        this.roundScores.push(msg);
        
        document.getElementById('game-over-modal').classList.remove('hidden');
        
        const isWinner = msg.winners.includes(this.myPosition);
        document.getElementById('round-result').textContent = isWinner ? '恭喜获胜！' : '再接再厉';
        
        // 更新级别
        if (msg.newLevel) {
            this.currentLevel = msg.newLevel;
        }
        
        let scoreHtml = '';
        msg.scoreChanges.forEach(change => {
            scoreHtml += `<div>${change.name}: ${change.change > 0 ? '+' : ''}${change.change}分</div>`;
        });
        scoreHtml += `<div style="margin-top:10px">当前级别: ${this.currentLevel}</div>`;
        document.getElementById('score-changes').innerHTML = scoreHtml;
        
        this.updateUI();
    }

    // 处理游戏结束
    handleGameOver(msg) {
        alert('游戏结束！最终比分: ' + JSON.stringify(msg.finalScores));
        location.reload();
    }

    // 继续游戏
    continueGame() {
        document.getElementById('game-over-modal').classList.add('hidden');
        
        // 重新发牌
        this.startGame();
    }

    // 重开
    restartGame() {
        if (!this.isHost) {
            alert('只有房主可以重开');
            return;
        }
        
        // 重置所有分数
        this.ourScore = 0;
        this.theirScore = 0;
        this.totalScore = 0;
        this.roundScores = [];
        this.currentLevel = 'A';
        
        this.peer.broadcast({ type: 'game-restart' });
        
        location.reload();
    }

    // 更新UI
    updateUI() {
        // 更新级别
        document.getElementById('current-level').textContent = this.currentLevel;
        
        // 更新分数
        document.getElementById('our-score').textContent = this.ourScore;
        document.getElementById('their-score').textContent = this.theirScore;
        document.getElementById('total-score').textContent = this.totalScore;
        
        // 渲染手牌
        this.renderHand('my-hand');
        
        // 更新按钮状态
        const playBtn = document.getElementById('play-cards-btn');
        const passBtn = document.getElementById('pass-btn');
        
        const canPlay = this.currentPlayer === this.myPosition && this.selectedCards.length > 0;
        const canPass = this.currentPlayer === this.myPosition && this.lastPlayCards !== null;
        
        playBtn.disabled = !canPlay;
        passBtn.disabled = !canPass;
        
        // 显示当前出牌玩家
        if (this.currentPlayer !== -1 && this.gameState === 'playing') {
            const positionNames = ['南家', '西家', '北家', '东家'];
            document.getElementById('last-play-info').textContent = 
                `等待 ${positionNames[this.currentPlayer]} 出牌...`;
        }
        
        // 显示桌上打出的牌
        this.updateTableCards();
    }

    // 更新桌上牌
    updateTableCards() {
        const positions = ['my-hand', 'opponent-left-play', 'opponent-top-play', 'opponent-right-play'];
        
        for (let i = 0; i < 4; i++) {
            const containerId = positions[i];
            const container = document.getElementById(containerId);
            if (!container) continue;
            
            const played = this.playedThisRound[i];
            
            // 对于不是自己的位置，显示背面朝上的牌
            if (i !== 0 && played && played.length > 0) {
                container.innerHTML = '';
                played.forEach(() => {
                    const cardEl = document.createElement('div');
                    cardEl.className = 'card card-back';
                    container.appendChild(cardEl);
                });
            }
        }
    }

    // 渲染手牌
    renderHand(containerId, filterFn = null) {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        container.innerHTML = '';
        
        let cardsToRender = this.myHand;
        if (filterFn) {
            cardsToRender = this.myHand.filter(filterFn);
        }
        
        cardsToRender.forEach(card => {
            const cardEl = this.createCardElement(card);
            cardEl.addEventListener('click', () => this.toggleCardSelection(card, cardEl));
            container.appendChild(cardEl);
        });
    }

    // 创建牌元素
    createCardElement(card) {
        const el = document.createElement('div');
        el.className = 'card';
        
        if (card.isJoker) {
            el.classList.add(card.rank === '大王' ? 'joker-red' : 'joker-black');
            el.textContent = card.rank;
        } else {
            el.classList.add(card.isRed ? 'red' : 'black');
            el.innerHTML = `<span class="rank">${card.rank}</span><span class="suit">${card.suit}</span>`;
        }
        
        // 标记逢人配
        if (this.fengRenPei && card.suit === this.fengRenPei.suit && card.rank === this.fengRenPei.rank) {
            el.classList.add('feng-ren-pei');
        }
        
        // 标记级牌
        if (card.rank === this.currentLevel) {
            el.classList.add('level-card');
        }
        
        return el;
    }

    // 切换选牌
    toggleCardSelection(card, el) {
        if (this.currentPlayer !== this.myPosition) return;
        
        const idx = this.selectedCards.findIndex(c => c.suit === card.suit && c.rank === card.rank);
        
        if (idx !== -1) {
            this.selectedCards.splice(idx, 1);
            el.classList.remove('selected');
        } else {
            this.selectedCards.push(card);
            el.classList.add('selected');
        }
        
        this.updateUI();
    }
}

// 初始化游戏
document.addEventListener('DOMContentLoaded', () => {
    window.game = new GuandanGame();
});
