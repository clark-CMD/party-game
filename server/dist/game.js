// 通用 AI 调用函数
async function callAI(baseUrl, apiKey, model, prompt, maxTokens) {
    // 检测 provider 类型
    const isNvidia = baseUrl.includes('nvidia') || baseUrl.includes('integrate.api.nvidia');
    const isMinimax = baseUrl.includes('minimax');
    const isAnthropic = baseUrl.includes('anthropic');
    let url;
    let headers;
    let body;
    if (isNvidia) {
        // NVIDIA Chat Completions API
        url = baseUrl.includes('/v1/chat/completions')
            ? baseUrl
            : `${baseUrl}/chat/completions`;
        headers = {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        };
        body = {
            model,
            messages: [{ role: 'user', content: prompt }],
            max_tokens: maxTokens,
            temperature: 0.7,
            top_p: 0.9,
            response_format: { type: 'json_object' }
        };
    }
    else if (isMinimax) {
        // MiniMax API
        url = `${baseUrl}/text/chatcompletion_v2`;
        headers = {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        };
        body = {
            model,
            messages: [{ role: 'user', content: prompt }],
            max_output_tokens: maxTokens,
            temperature: 0.7
        };
    }
    else if (isAnthropic) {
        // Anthropic API
        url = `${baseUrl}/messages`;
        headers = {
            'x-api-key': apiKey,
            'Content-Type': 'application/json',
            'anthropic-version': '2023-06-01'
        };
        body = {
            model,
            max_tokens: maxTokens,
            messages: [{ role: 'user', content: prompt }]
        };
    }
    else {
        // 默认当作 OpenAI 兼容格式
        url = `${baseUrl}/chat/completions`;
        headers = {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        };
        body = {
            model,
            messages: [{ role: 'user', content: prompt }],
            max_tokens: maxTokens,
            temperature: 0.7
        };
    }
    const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
    });
    if (!response.ok) {
        const error = await response.text();
        throw new Error(`AI API error: ${response.status} ${error}`);
    }
    const data = await response.json();
    // 解析不同格式的响应
    if (isNvidia || !isMinimax && !isAnthropic) {
        return { text: data.choices?.[0]?.message?.content || '' };
    }
    else if (isMinimax) {
        return { text: data.choices?.[0]?.message?.content || '' };
    }
    else {
        return { text: data.content?.[0]?.text || '' };
    }
}
// ========== 游戏提示词模板（JSON格式） ==========
const GAME_RULES = {
    undercover: `游戏规则：
- 每轮每个玩家看到一个词语
- 卧底的词语与其他人不同
- 玩家轮流描述自己的词语（不能直接说）
- 所有人描述完毕后投票淘汰怀疑是卧底的玩家
- 卧底存活到最后则卧底胜利，平民找出卧底则平民胜利`,
    challenge: (playerNames, lives) => `游戏规则：
- 参与玩家：${playerNames.join('、')}
- 每个玩家有一个禁忌动作
- 玩家互相诱导对方做禁忌动作
- 被诱导做禁忌动作者淘汰
- 每人有 ${lives} 条命
- 最后存活的玩家获胜`,
    headguess: (playerNames) => `游戏规则：
- 参与玩家：${playerNames.join('、')}
- 每个玩家头顶贴一个词语（自己看不到）
- 玩家轮流提问其他人来猜自己的词
- 其他人只能回答"是"或"否"
- 猜对自己词最多的玩家获胜`
};
// ========== JSON 输出提示词 ==========
const PROMPTS = {
    undercover: (playerCount, theme) => `请直接返回JSON格式，不要有任何思考过程或解释。

请为"谁是卧底"游戏生成词语。

参与玩家数量：${playerCount}人

${GAME_RULES.undercover}

${theme ? `主题要求：${theme}` : '主题：随机选择（可以选动物、水果、食物、日常用品、职业等）'}

要求：
1. 生成2个词语，属于同一类别，有一定相似性但能区分
2. 词语要常见、易于描述
3. 只返回JSON，不要其他内容：
{"theme":"词语类别","normal_word":"普通玩家的词语","undercover_word":"卧底的词语"}`,
    challenge: (playerNames, lives, theme) => `请为"不要做挑战"游戏生成禁忌动作。

参与玩家：${playerNames.join('、')}
每人生命数：${lives}条

游戏规则：每个玩家有${lives}条命，做一次禁忌动作扣一条命，扣完被淘汰。

${theme ? `动作类型：${theme}` : '动作类型：日常小动作（摸鼻子、挠头、说特定词语、抖腿等）'}

要求：
1. 为每个玩家生成${lives}个不同的禁忌动作，共${playerNames.length * lives}个动作
2. 每个玩家的${lives}个动作要完全不同
3. 所有玩家的动作必须完全不同，不能有重复
4. 动作要简单、常见但容易被诱导做出
5. 只返回JSON，不要任何解释：
{"actions":["动作1","动作2","动作3"...]}

示例（2个玩家每人2条命）：
{"actions":["摸鼻子","摸耳朵","挠头","说'真的吗'"]}`,
    headguess: (playerCount, theme) => `请直接返回JSON格式，不要有任何思考过程或解释。

请为"头顶猜词"游戏生成词语。

参与玩家数量：${playerCount}人

${GAME_RULES.headguess(Array(playerCount).fill('玩家'))}

${theme ? `主题要求：${theme}` : '主题：随机选择常见类别'}

要求：
1. 生成${playerCount}个同一类别的词语
2. 词语要常见、容易联想
3. 只返回JSON，不要其他内容：
{"theme":"词语类别","words":["词1","词2","词3"]}`
};
// ========== JSON 解析工具 ==========
function parseJSON(text, fallback) {
    try {
        // 尝试直接解析
        return JSON.parse(text);
    }
    catch {
        // 移除 Markdown 代码块
        let cleanText = text
            .replace(/```json?/gi, '')
            .replace(/```/gi, '')
            .trim();
        // 移除思考过程标记
        cleanText = cleanText
            .replace(/<thought>[\s\S]*?<\/thought>/gi, '')
            .replace(/\(reasoning\)[\s\S]*/gi, '')
            .replace(/\*\*Thinking\*\*[\s\S]*?\*\*\/Thinking\*\*/gi, '')
            .replace(/首先[，,]/g, '')
            .replace(/首先让我[\s\S]*?\{/, '{')
            .replace(/Let me[\s\S]*?\{/, '{')
            .replace(/Okay,?[\s\S]*?\{/, '{')
            .replace(/好的[,，]/g, '')
            .replace(/以下[\s\S]*?：$/gm, '')
            .replace(/[\s\S]*?：$/gm, '');
        // 移除思考内容开头的常见词汇
        cleanText = cleanText
            .replace(/^[\s\n\r]*(?:首先|让我|Okay|好的|Here is|The following)[\s\S]*?(?:：|:)\s*/gim, '')
            .replace(/^[\s\n\r]*[\u4e00-\u9fa5]*[\s\S]*?\{/, '{');
        // 尝试提取 JSON 部分
        const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            try {
                return JSON.parse(jsonMatch[0]);
            }
            catch {
                // 尝试修复常见的 JSON 格式问题
                try {
                    const fixed = jsonMatch[0]
                        .replace(/'/g, '"')
                        .replace(/(\w+):/g, '"$1":');
                    return JSON.parse(fixed);
                }
                catch {
                    return fallback;
                }
            }
        }
        return fallback;
    }
}
// ========== 游戏房间类 ==========
export class GameRoom {
    code;
    players;
    game = null;
    // AI 配置（房主可修改）
    aiConfig;
    constructor(code, defaultConfig) {
        this.code = code;
        this.players = new Map();
        // 默认配置（OpenAI 兼容格式，通过 NVIDIA 集成）
        this.aiConfig = defaultConfig || {
            baseUrl: 'https://integrate.api.nvidia.com/v1',
            apiKey: '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',
            model: 'qwen/qwen3-next-80b-a3b-instruct'
        };
    }
    updateAIConfig(config) {
        this.aiConfig = { ...this.aiConfig, ...config };
        console.log(`[GameRoom ${this.code}] AI配置更新:`, this.aiConfig);
    }
    getAIConfig() {
        return { ...this.aiConfig };
    }
    addPlayer(socketId, name, isCaptain) {
        this.players.set(socketId, {
            id: socketId,
            name,
            isCaptain,
            isReady: false
        });
    }
    removePlayer(socketId) {
        this.players.delete(socketId);
        if (!Array.from(this.players.values()).some(p => p.isCaptain)) {
            const firstPlayer = this.players.values().next().value;
            if (firstPlayer) {
                firstPlayer.isCaptain = true;
            }
        }
    }
    setPlayerReady(socketId) {
        const player = this.players.get(socketId);
        if (player) {
            player.isReady = !player.isReady;
        }
    }
    getPlayers() {
        return Array.from(this.players.values());
    }
    getGameState() {
        if (!this.game)
            return null;
        return {
            type: this.game.type,
            phase: this.game.phase,
            round: this.game.round,
            totalRounds: this.game.totalRounds,
            winner: this.game.winner,
            challengeLives: this.game.challengeLives
        };
    }
    getGameStateForPlayer(playerId) {
        if (!this.game)
            return null;
        const playerWord = this.game.words.find(w => w.playerId === playerId);
        const isEliminated = this.game.eliminated.has(playerId);
        return {
            type: this.game.type,
            phase: this.game.phase,
            round: this.game.round,
            totalRounds: this.game.totalRounds,
            myWord: playerWord?.word,
            descriptions: this.game.descriptions,
            votes: this.game.votes,
            winner: this.game.winner,
            challengeLives: this.game.challengeLives,
            isEliminated: isEliminated // 标记当前玩家是否被淘汰
        };
    }
    async startGame(type, params, theme) {
        const playerIds = Array.from(this.players.keys());
        const playerNames = Array.from(this.players.values()).map(p => p.name);
        const playerCount = playerIds.length;
        let words = [];
        const challengeLives = params?.challengeLives || 3;
        try {
            console.log(`[GameRoom ${this.code}] 调用AI生成${type}游戏内容...`);
            console.log(`[GameRoom ${this.code}] AI配置:`, this.aiConfig);
            if (type === 'undercover') {
                words = await this.generateUndercoverWords(playerIds, theme);
            }
            else if (type === 'challenge') {
                words = await this.generateChallengeTasks(playerIds, playerNames, challengeLives, theme);
            }
            else if (type === 'headguess') {
                words = await this.generateHeadGuessWords(playerIds, theme);
            }
        }
        catch (error) {
            console.error(`[GameRoom ${this.code}] AI生成失败:`, error);
            words = this.getFallbackWords(type, playerIds);
        }
        // 不要做挑战设置生命数
        if (type === 'challenge') {
            words.forEach(word => {
                word.lives = challengeLives;
            });
        }
        this.game = {
            type,
            phase: 'countdown',
            round: 1,
            totalRounds: type === 'undercover' ? 3 : 2,
            words,
            descriptions: [],
            votes: [],
            eliminated: new Set(),
            challengeLives,
            theme
        };
    }
    async generateUndercoverWords(playerIds, theme) {
        const prompt = PROMPTS.undercover(playerIds.length, theme);
        const response = await callAI(this.aiConfig.baseUrl, this.aiConfig.apiKey, this.aiConfig.model, prompt, 200);
        const result = parseJSON(response.text, { theme: '未指定', normal_word: '可乐', undercover_word: '雪碧' });
        console.log(`[GameRoom ${this.code}] AI返回:`, result);
        const normalWord = result.normal_word || '可乐';
        const undercoverWord = result.undercover_word || '雪碧';
        const undercoverIndex = Math.floor(Math.random() * playerIds.length);
        return playerIds.map((id, index) => ({
            playerId: id,
            word: index === undercoverIndex ? undercoverWord : normalWord
        }));
    }
    async generateChallengeTasks(playerIds, playerNames, lives, theme) {
        const prompt = PROMPTS.challenge(playerNames, lives, theme);
        const response = await callAI(this.aiConfig.baseUrl, this.aiConfig.apiKey, this.aiConfig.model, prompt, 500);
        console.log(`[GameRoom ${this.code}] AI原始返回:`, response.text);
        // 解析新格式：actions 数组
        const result = parseJSON(response.text, { actions: [] });
        console.log(`[GameRoom ${this.code}] AI解析结果:`, result);
        const allActions = result.actions || [];
        const totalActions = playerIds.length * lives;
        // 如果动作数量不够，生成备用
        if (allActions.length < totalActions) {
            console.log(`[GameRoom ${this.code}] 动作数量不足，生成备用`);
            const fallback = ['摸鼻子', '挠头', '抖腿', '说' + '"真的吗"', '托眼镜', '摸耳朵', '咬嘴唇', '点头'];
            while (allActions.length < totalActions) {
                allActions.push(...fallback);
            }
        }
        // 为每个玩家分配 lives 个动作
        return playerIds.map((id, playerIndex) => {
            const playerActions = [];
            for (let j = 0; j < lives; j++) {
                const actionIndex = playerIndex * lives + j;
                playerActions.push(allActions[actionIndex] || '不要笑');
            }
            return {
                playerId: id,
                word: playerActions[0],
                lives: lives,
                allWords: playerActions,
                currentWordIndex: 0
            };
        });
    }
    async generateHeadGuessWords(playerIds, theme) {
        const prompt = PROMPTS.headguess(playerIds.length, theme);
        const response = await callAI(this.aiConfig.baseUrl, this.aiConfig.apiKey, this.aiConfig.model, prompt, 200);
        const result = parseJSON(response.text, { theme: '未指定', words: ['苹果', '香蕉', '橙子', '葡萄'] });
        console.log(`[GameRoom ${this.code}] AI返回:`, result);
        const words = result.words || ['苹果', '香蕉'];
        return playerIds.map((id, index) => ({
            playerId: id,
            word: words[index % words.length]
        }));
    }
    getFallbackWords(type, playerIds) {
        const fallback = {
            undercover: ['可乐', '雪碧'],
            challenge: ['不要笑', '不要说话'],
            headguess: ['苹果', '香蕉', '橙子', '葡萄']
        };
        const words = fallback[type] || fallback.headguess;
        const undercoverIndex = Math.floor(Math.random() * playerIds.length);
        if (type === 'undercover') {
            return playerIds.map((id, index) => ({
                playerId: id,
                word: index === undercoverIndex ? words[1] : words[0]
            }));
        }
        return playerIds.map((id, index) => ({
            playerId: id,
            word: words[index % words.length]
        }));
    }
    beginGame() {
        if (this.game && this.game.phase === 'countdown') {
            this.game.phase = 'playing';
        }
    }
    // 不要做挑战：切换到下一个词条
    nextChallengeWord(playerId) {
        if (!this.game || this.game.type !== 'challenge')
            return;
        const wordIndex = this.game.words.findIndex(w => w.playerId === playerId);
        if (wordIndex === -1)
            return;
        const word = this.game.words[wordIndex];
        if (word.allWords && word.currentWordIndex !== undefined) {
            const nextIndex = word.currentWordIndex + 1;
            if (nextIndex < word.allWords.length) {
                word.currentWordIndex = nextIndex;
                word.word = word.allWords[nextIndex];
            }
            else {
                // 最后一条命用完了，淘汰该玩家
                this.game.eliminated.add(playerId);
                // 检查是否只剩一个玩家
                this.checkChallengeWinner();
            }
        }
    }
    checkChallengeWinner() {
        if (!this.game || this.game.type !== 'challenge')
            return;
        const alivePlayers = Array.from(this.players.keys()).filter(id => !this.game.eliminated.has(id));
        if (alivePlayers.length === 1) {
            const winner = this.players.get(alivePlayers[0]);
            this.game.winner = winner?.name || '未知';
            this.game.phase = 'result';
        }
        else if (alivePlayers.length === 0) {
            // 所有人同时被淘汰
            this.game.winner = '平局';
            this.game.phase = 'result';
        }
    }
    // 头顶猜词：标记猜到了
    markGuessed(playerId) {
        if (!this.game || this.game.type !== 'headguess')
            return;
        const wordIndex = this.game.words.findIndex(w => w.playerId === playerId);
        if (wordIndex === -1)
            return;
        const word = this.game.words[wordIndex];
        if (word.guessedOrder === undefined) {
            // 记录猜到的顺序
            const guessedCount = this.game.words.filter(w => w.guessedOrder !== undefined).length;
            word.guessedOrder = guessedCount + 1;
            // 检查是否只剩1人未猜到
            const notGuessed = this.game.words.filter(w => w.guessedOrder === undefined);
            if (notGuessed.length === 1) {
                // 最后一个人失败
                const loserId = notGuessed[0].playerId;
                this.game.eliminated.add(loserId);
                const loserName = this.players.get(loserId)?.name || '未知';
                this.game.winner = loserName;
                this.game.phase = 'result';
            }
            else if (notGuessed.length === 0) {
                // 所有人同时猜到
                this.game.winner = '平局';
                this.game.phase = 'result';
            }
        }
    }
    // 获取头顶猜词的排名
    getHeadguessRanking() {
        if (!this.game || this.game.type !== 'headguess')
            return [];
        const sorted = this.game.words
            .filter(w => w.guessedOrder !== undefined)
            .sort((a, b) => a.guessedOrder - b.guessedOrder);
        return sorted.map(w => ({
            playerId: w.playerId,
            name: this.players.get(w.playerId)?.name || '未知',
            order: w.guessedOrder
        }));
    }
    submitDescription(playerId) {
        if (!this.game)
            return;
        // 被淘汰的玩家不需要描述
        if (this.game.eliminated.has(playerId)) {
            return;
        }
        const existingDesc = this.game.descriptions.find(d => d.playerId === playerId);
        if (!existingDesc) {
            this.game.descriptions.push({ playerId, text: '' });
        }
        // 只统计存活玩家的描述
        const alivePlayers = Array.from(this.players.keys()).filter(id => !this.game.eliminated.has(id));
        if (this.game.descriptions.length >= alivePlayers.length) {
            if (this.game.type === 'undercover') {
                this.game.phase = 'voting';
            }
            else {
                this.game.phase = 'result';
                this.determineWinner();
            }
        }
    }
    submitVote(voterId, targetId) {
        if (!this.game)
            return;
        const existingVote = this.game.votes.find(v => v.voterId === voterId);
        if (existingVote) {
            existingVote.targetId = targetId;
        }
        else {
            this.game.votes.push({ voterId, targetId });
        }
        // 等待所有存活玩家投票
        const alivePlayers = Array.from(this.players.keys()).filter(id => !this.game.eliminated.has(id));
        if (this.game.votes.length >= alivePlayers.length) {
            this.processVotes();
        }
    }
    processVotes() {
        if (!this.game)
            return;
        // 过滤掉被淘汰玩家的投票
        const validVotes = this.game.votes.filter(v => !this.game.eliminated.has(v.voterId));
        // 调试日志
        console.log(`[GameRoom ${this.code}] 投票统计: ${validVotes.length} votes`);
        validVotes.forEach((v, i) => {
            const voter = this.players.get(v.voterId);
            const target = this.players.get(v.targetId);
            console.log(`  Vote ${i + 1}: ${voter?.name} -> ${target?.name}`);
        });
        const voteCount = new Map();
        validVotes.forEach(vote => {
            voteCount.set(vote.targetId, (voteCount.get(vote.targetId) || 0) + 1);
        });
        // 调试日志
        console.log(`[GameRoom ${this.code}] 票数统计:`);
        voteCount.forEach((count, playerId) => {
            console.log(`  ${this.players.get(playerId)?.name}: ${count}票`);
        });
        // 找出最高票数
        let maxVotes = 0;
        voteCount.forEach((count) => {
            if (count > maxVotes) {
                maxVotes = count;
            }
        });
        // 找出所有获得最高票数的玩家
        const topCandidates = [];
        voteCount.forEach((count, playerId) => {
            if (count === maxVotes) {
                topCandidates.push(playerId);
            }
        });
        // 如果平票，没有人被淘汰，继续下一轮
        if (topCandidates.length > 1) {
            console.log(`[GameRoom ${this.code}] 投票平局:`, topCandidates.map(id => this.players.get(id)?.name));
            this.game.phase = 'playing';
            this.game.descriptions = [];
            this.game.votes = [];
            return;
        }
        const eliminatedPlayer = topCandidates[0];
        if (!eliminatedPlayer)
            return;
        this.game.eliminated.add(eliminatedPlayer);
        console.log(`[GameRoom ${this.code}] 淘汰玩家:`, this.players.get(eliminatedPlayer)?.name);
        if (this.game.type === 'undercover') {
            // 找出普通玩家的词语（出现次数最多的词）
            const wordCount = new Map();
            this.game.words.forEach(w => {
                wordCount.set(w.word, (wordCount.get(w.word) || 0) + 1);
            });
            let maxWordCount = 0;
            let normalWord = '';
            wordCount.forEach((count, word) => {
                if (count > maxWordCount) {
                    maxWordCount = count;
                    normalWord = word;
                }
            });
            const eliminatedWord = this.game.words.find(w => w.playerId === eliminatedPlayer)?.word;
            const isUndercover = eliminatedWord !== normalWord;
            console.log(`[GameRoom ${this.code}] 淘汰玩家词语: ${eliminatedWord}, 普通词语: ${normalWord}, 是卧底: ${isUndercover}`);
            if (isUndercover) {
                // 卧底被淘汰，平民胜利
                this.game.eliminated.add(eliminatedPlayer);
                this.game.winner = '平民胜利！';
                this.game.phase = 'result';
            }
            else {
                // 平民被淘汰
                this.game.eliminated.add(eliminatedPlayer);
                // 检查剩余存活玩家
                const aliveCount = this.game.words.filter(w => !this.game.eliminated.has(w.playerId)).length;
                // 3人局：投出1人后剩2人
                if (aliveCount === 2) {
                    // 剩2人时，无论卧底投谁都会平票，游戏无法继续
                    // 卧底存活则卧底胜利
                    const aliveUndercovers = this.game.words.filter(w => !this.game.eliminated.has(w.playerId) && w.word !== normalWord);
                    if (aliveUndercovers.length === 1) {
                        this.game.winner = '卧底胜利！';
                        this.game.phase = 'result';
                    }
                    else {
                        // 2个平民剩下，平局
                        this.game.winner = '平局';
                        this.game.phase = 'result';
                    }
                }
                else if (aliveCount > 2) {
                    // 多人局继续
                    console.log(`[GameRoom ${this.code}] 存活玩家: ${aliveCount}，游戏继续`);
                    this.game.phase = 'playing';
                    this.game.descriptions = [];
                    this.game.votes = [];
                }
                else {
                    // 只剩1人
                    this.game.winner = '平局';
                    this.game.phase = 'result';
                }
            }
        }
    }
    determineWinner() {
        if (!this.game)
            return;
        // challenge 模式由 checkChallengeWinner 实时判断，不需要这里处理
        if (this.game.type === 'headguess') {
            const winnerId = Array.from(this.players.keys())[Math.floor(Math.random() * this.players.size)];
            this.game.winner = this.players.get(winnerId)?.name;
        }
    }
    nextRound() {
        if (!this.game)
            return;
        if (this.game.phase === 'result') {
            this.game = null;
            // 不重置准备状态，让玩家保持在已准备状态
            return;
        }
        // challenge 模式没有轮数限制，由 checkChallengeWinner 实时判断
        if (this.game.type !== 'challenge') {
            this.game.round++;
            if (this.game.round > this.game.totalRounds) {
                this.game.phase = 'result';
                this.determineWinner();
            }
            else {
                this.game.phase = 'playing';
                this.game.descriptions = [];
                this.game.votes = [];
            }
        }
    }
}
