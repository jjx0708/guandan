// cards.js - 牌型判断和比较逻辑

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];

// 牌的值（用于比较大小）
const RANK_VALUES = {
    '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
    '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14, '2': 15,
    '小王': 16, '大王': 17
};

// 花色值（用于同花顺判断）
const SUIT_VALUES = {
    '♠': 4, '♥': 3, '♦': 2, '♣': 1
};

class Card {
    constructor(suit, rank) {
        this.suit = suit;
        this.rank = rank;
        this.isJoker = (rank === '小王' || rank === '大王');
        this.isRed = (suit === '♥' || suit === '♦');
    }

    get value() {
        return RANK_VALUES[this.rank] || 0;
    }

    get suitValue() {
        return SUIT_VALUES[this.suit] || 0;
    }

    // 获取用于排序和比较的唯一值
    get sortValue() {
        if (this.rank === '大王') return 100;
        if (this.rank === '小王') return 99;
        return this.value * 4 + this.suitValue;
    }

    toString() {
        return `${this.suit}${this.rank}`;
    }

    // 复制卡片
    clone() {
        return new Card(this.suit, this.rank);
    }

    // 检查是否是指定花色的指定rank（用于逢人配）
    matches(suit, rank) {
        return this.suit === suit && this.rank === rank;
    }
}

// 创建一副牌
function createDeck() {
    const deck = [];
    
    // 普通牌
    for (const suit of SUITS) {
        for (const rank of RANKS) {
            deck.push(new Card(suit, rank));
        }
    }
    
    // 大小王
    deck.push(new Card('🃏', '小王'));
    deck.push(new Card('🃏', '大王'));
    
    return deck;
}

// 洗牌
function shuffleDeck(deck) {
    const shuffled = [...deck];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

// 发牌
function dealCards(deck, numPlayers = 4) {
    const hands = [[], [], [], []];
    let playerIndex = 0;
    
    for (const card of deck) {
        hands[playerIndex].push(card);
        playerIndex = (playerIndex + 1) % numPlayers;
    }
    
    // 排序每手牌
    for (const hand of hands) {
        sortHand(hand);
    }
    
    return hands;
}

// 排序手牌
function sortHand(hand) {
    hand.sort((a, b) => b.sortValue - a.sortValue);
}

// 判断牌型
function getCardType(cards, level = 'A', fengRenPei = null) {
    if (!cards || cards.length === 0) return null;
    
    const count = cards.length;
    
    // 大王
    if (count === 1 && cards[0].rank === '大王') {
        return { type: 'joker-red', power: 170 };
    }
    
    // 小王
    if (count === 1 && cards[0].rank === '小王') {
        return { type: 'joker-black', power: 160 };
    }
    
    // 单张
    if (count === 1) {
        let power = cards[0].value * 10;
        // 如果是级牌
        if (cards[0].rank === level || (fengRenPei && cards[0].matches(fengRenPei.suit, fengRenPei.rank))) {
            power += 5;
        }
        return { type: 'single', power, cards: [cards[0]] };
    }
    
    // 分析牌组
    const rankGroups = {};
    for (const card of cards) {
        if (!rankGroups[card.rank]) {
            rankGroups[card.rank] = [];
        }
        rankGroups[card.rank].push(card);
    }
    
    const groups = Object.values(rankGroups).sort((a, b) => b.length - a.length);
    
    // 炸弹（4张及以上相同）
    if (groups[0].length >= 4) {
        let power = 100 + groups[0].length * 10 + groups[0][0].value;
        // 天王炸（4王）
        if (groups[0].length === 4 && groups[0][0].isJoker) {
            power = 200;
        }
        return { type: 'bomb', power, cards: cards };
    }
    
    // 钢板（三张+三张）
    if (count === 6 && groups.length === 2 && groups[0].length === 3 && groups[1].length === 3) {
        const power = 80 + Math.max(groups[0][0].value, groups[1][0].value);
        return { type: 'steel', power, cards };
    }
    
    // 同花顺（5张及以上，花色相同）
    if (count >= 5) {
        const sameSuitCards = cards.filter(c => !c.isJoker);
        if (sameSuitCards.length >= 5) {
            // 检查是否是顺子
            const sorted = [...sameSuitCards].sort((a, b) => a.value - b.value);
            let isStraight = true;
            for (let i = 1; i < sorted.length; i++) {
                if (sorted[i].value !== sorted[i-1].value + 1) {
                    isStraight = false;
                    break;
                }
            }
            if (isStraight) {
                const power = 90 + sorted[sorted.length - 1].value;
                return { type: 'straight-flush', power, cards };
            }
        }
    }
    
    // 顺子（5张及以上）
    if (count >= 5) {
        const nonJokers = cards.filter(c => !c.isJoker);
        if (nonJokers.length >= 5) {
            const values = [...new Set(nonJokers.map(c => c.value))].sort((a, b) => a - b);
            // 检查是否是连续的值
            let isSequential = true;
            for (let i = 1; i < values.length; i++) {
                if (values[i] !== values[i-1] + 1) {
                    isSequential = false;
                    break;
                }
            }
            if (isSequential) {
                const power = 50 + Math.max(...nonJokers.map(c => c.value));
                return { type: 'straight', power, cards };
            }
        }
    }
    
    // 对子（2张）
    if (count === 2 && groups[0].length === 2) {
        const power = 20 + groups[0][0].value * 2;
        return { type: 'pair', power, cards };
    }
    
    // 三张
    if (count === 3 && groups[0].length === 3) {
        const power = 30 + groups[0][0].value * 3;
        return { type: 'triple', power, cards };
    }
    
    // 杂牌（按单张处理）
    const maxCard = cards.reduce((max, c) => c.value > max.value ? c : max, cards[0]);
    return { type: 'mixed', power: maxCard.value * 10, cards };
}

// 比较两组牌的大小
function compareCards(cards1, cards2, level = 'A', fengRenPei = null) {
    const type1 = getCardType(cards1, level, fengRenPei);
    const type2 = getCardType(cards2, level, fengRenPei);
    
    if (!type1 || !type2) return false;
    
    // 炸弹可以管任何非炸弹
    if (type1.type === 'bomb' && type2.type !== 'bomb') return true;
    if (type1.type !== 'bomb' && type2.type === 'bomb') return false;
    
    // 同类型比较
    if (type1.type === type2.type) {
        // 炸弹：数量多的赢；数量相同则比最大牌
        if (type1.type === 'bomb') {
            const count1 = cards1.length;
            const count2 = cards2.length;
            if (count1 !== count2) return count1 > count2;
            // 数量相同，比最大牌
            return type1.power > type2.power;
        }
        return type1.power > type2.power;
    }
    
    // 不同类型按预设优先级
    const typeOrder = {
        'joker-red': 10,
        'joker-black': 9,
        'bomb': 8,
        'steel': 7,
        'straight-flush': 6,
        'straight': 5,
        'triple': 4,
        'pair': 3,
        'single': 2,
        'mixed': 1
    };
    
    return (typeOrder[type1.type] || 0) > (typeOrder[type2.type] || 0);
}

// 获取需要贡的最大牌
function getMaxCards(hand) {
    sortHand(hand);
    return [hand[0]];
}

// 检查是否需要贡牌（头游给四游，二游给三游）
function needsToTribute(position, rank) {
    // rank: 0=头游, 1=二游, 2=三游, 3=四游
    return (rank === 0 && position === 3) || (rank === 1 && position === 2);
}

// 检查是否需要还牌
function needsToReturn(position, rank) {
    return (rank === 3 && position === 0) || (rank === 2 && position === 1);
}

// 检查牌是否<=10（用于还牌）
function isSmallCard(card) {
    return card.value <= 10;
}

// 检查是否是有效的贡牌
function isValidTribute(hand, selectedCards, level, fengRenPei) {
    if (selectedCards.length !== 1) return false;
    
    const card = selectedCards[0];
    const maxCard = getMaxCards(hand)[0];
    
    // 必须是最大的牌
    if (card.sortValue !== maxCard.sortValue) return false;
    
    // 检查级牌规则
    if (card.rank === level) {
        // 如果有逢人配，可以供一张级牌
        if (fengRenPei) {
            return true;
        }
        return false;
    }
    
    return true;
}

// 检查是否是有效的还牌
function isValidReturn(selectedCards) {
    if (selectedCards.length !== 1) return false;
    return isSmallCard(selectedCards[0]);
}

// 检查选中的牌是否可以出
function canPlayCards(selectedCards, tableCards, level, fengRenPei, isFirstPlay = false) {
    if (selectedCards.length === 0) return false;
    
    const selectedType = getCardType(selectedCards, level, fengRenPei);
    if (!selectedType) return false;
    
    // 首次出牌没有限制
    if (isFirstPlay) return true;
    
    // 检查牌数是否匹配
    if (tableCards.length > 0) {
        const tableType = getCardType(tableCards, level, fengRenPei);
        if (tableType && selectedType.type !== tableType.type) {
            // 炸弹可以管任何牌
            if (selectedType.type !== 'bomb') return false;
        }
        
        // 牌数必须相同
        if (selectedCards.length !== tableCards.length) {
            // 但炸弹可以管更少的牌
            if (selectedType.type !== 'bomb' || selectedCards.length > tableCards.length) {
                return false;
            }
        }
        
        // 比较大小
        return compareCards(selectedCards, tableCards, level, fengRenPei);
    }
    
    return true;
}

// 将Card对象转换为可序列化的对象
function cardToObj(card) {
    return { suit: card.suit, rank: card.rank };
}

// 从对象创建Card
function objToCard(obj) {
    return new Card(obj.suit, obj.rank);
}

// 导出
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        Card, createDeck, shuffleDeck, dealCards, sortHand,
        getCardType, compareCards, getMaxCards, needsToTribute,
        needsToReturn, isSmallCard, isValidTribute, isValidReturn,
        canPlayCards, cardToObj, objToCard
    };
}
