import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { GameRoom } from './game.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});
const rooms = new Map();
function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}
function getPlayerRoom(socketId) {
    for (const room of rooms.values()) {
        if (room.players.has(socketId)) {
            return room;
        }
    }
    return null;
}
// 默认 AI 配置（OpenAI 兼容格式，通过 NVIDIA 集成使用 Qwen）
const defaultAIConfig = {
    baseUrl: process.env.AI_BASE_URL || 'https://integrate.api.nvidia.com/v1',
    apiKey: process.env.AI_API_KEY || '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',
    model: process.env.AI_MODEL || 'qwen/qwen3-next-80b-a3b-instruct'
};
app.use(express.static(path.join(__dirname, '../../client/dist')));
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../../client/dist/index.html'));
});
io.on('connection', (socket) => {
    console.log(`Player connected: ${socket.id}`);
    // 创建房间
    socket.on('createRoom', ({ playerName }) => {
        let roomCode = generateRoomCode();
        while (rooms.has(roomCode)) {
            roomCode = generateRoomCode();
        }
        const room = new GameRoom(roomCode, defaultAIConfig);
        room.addPlayer(socket.id, playerName, true);
        rooms.set(roomCode, room);
        socket.join(roomCode);
        socket.emit('roomJoined', {
            roomCode,
            players: room.getPlayers(),
            aiConfig: room.getAIConfig()
        });
        console.log(`Room created: ${roomCode} by ${playerName}`);
    });
    // 加入房间
    socket.on('joinRoom', ({ roomCode, playerName }) => {
        const room = rooms.get(roomCode.toUpperCase());
        if (!room) {
            socket.emit('message', '房间不存在');
            return;
        }
        if (room.players.size >= 8) {
            socket.emit('message', '房间已满');
            return;
        }
        room.addPlayer(socket.id, playerName, false);
        socket.join(roomCode.toUpperCase());
        socket.emit('roomJoined', {
            roomCode: roomCode.toUpperCase(),
            players: room.getPlayers(),
            aiConfig: room.getAIConfig()
        });
        io.to(roomCode.toUpperCase()).emit('playersUpdate', room.getPlayers());
        console.log(`${playerName} joined room ${roomCode}`);
    });
    // 离开房间
    socket.on('leaveRoom', () => {
        const room = getPlayerRoom(socket.id);
        if (room) {
            const roomCode = room.code;
            room.removePlayer(socket.id);
            socket.leave(roomCode);
            io.to(roomCode).emit('playersUpdate', room.getPlayers());
            if (room.players.size === 0) {
                rooms.delete(roomCode);
                console.log(`Room ${roomCode} deleted`);
            }
        }
    });
    // 准备
    socket.on('ready', () => {
        const room = getPlayerRoom(socket.id);
        if (room) {
            room.setPlayerReady(socket.id);
            io.to(room.code).emit('playersUpdate', room.getPlayers());
        }
    });
    // 更新 AI 配置（仅队长）
    socket.on('updateAIConfig', (config) => {
        const room = getPlayerRoom(socket.id);
        if (!room)
            return;
        const player = room.players.get(socket.id);
        if (!player?.isCaptain) {
            socket.emit('message', '只有队长可以修改AI配置');
            return;
        }
        room.updateAIConfig(config);
        io.to(room.code).emit('aiConfigUpdate', room.getAIConfig());
        socket.emit('message', 'AI配置已更新');
    });
    // 开始游戏
    socket.on('startGame', async ({ type, params, theme }) => {
        const room = getPlayerRoom(socket.id);
        if (!room)
            return;
        const player = room.players.get(socket.id);
        if (!player?.isCaptain) {
            socket.emit('message', '只有队长可以开始游戏');
            return;
        }
        const allReady = room.players.size >= 2 && Array.from(room.players.values()).every(p => p.isReady);
        if (!allReady) {
            socket.emit('message', '需要所有玩家准备且至少 2 人');
            return;
        }
        socket.emit('message', '正在生成游戏内容...');
        console.log(`[Room ${room.code}] 开始游戏: type=${type}, theme=${theme}`);
        await room.startGame(type, params, theme);
        // 给每个玩家发送包含其个人词条的状态
        room.getPlayers().forEach(player => {
            io.to(player.id).emit('gameStarted', room.getGameStateForPlayer(player.id));
        });
        // 5秒倒计时后开始游戏
        setTimeout(() => {
            room.beginGame();
            room.getPlayers().forEach(player => {
                io.to(player.id).emit('gameUpdate', room.getGameStateForPlayer(player.id));
            });
        }, 5000);
    });
    // 提交描述（用于统计）
    socket.on('submitDescription', () => {
        const room = getPlayerRoom(socket.id);
        if (room && room.game) {
            room.submitDescription(socket.id);
            room.getPlayers().forEach(player => {
                io.to(player.id).emit('gameUpdate', room.getGameStateForPlayer(player.id));
            });
        }
    });
    // 不要做挑战：切换到下一个词条
    socket.on('nextChallengeWord', () => {
        const room = getPlayerRoom(socket.id);
        if (room && room.game && room.game.type === 'challenge') {
            room.nextChallengeWord(socket.id);
            room.getPlayers().forEach(player => {
                io.to(player.id).emit('gameUpdate', room.getGameStateForPlayer(player.id));
            });
        }
    });
    // 头顶猜词：我猜到了
    socket.on('markGuessed', () => {
        const room = getPlayerRoom(socket.id);
        if (room && room.game && room.game.type === 'headguess') {
            room.markGuessed(socket.id);
            room.getPlayers().forEach(player => {
                io.to(player.id).emit('gameUpdate', room.getGameStateForPlayer(player.id));
            });
        }
    });
    // 投票
    socket.on('vote', ({ targetId }) => {
        const room = getPlayerRoom(socket.id);
        if (!room || !room.game)
            return;
        // 检查投票玩家是否被投出
        if (room.game.eliminated.has(socket.id)) {
            socket.emit('message', '你已被投出，不能投票');
            return;
        }
        // 检查目标玩家是否被投出
        if (room.game.eliminated.has(targetId)) {
            socket.emit('message', '该玩家已被投出，不能投票');
            return;
        }
        room.submitVote(socket.id, targetId);
        room.getPlayers().forEach(player => {
            io.to(player.id).emit('gameUpdate', room.getGameStateForPlayer(player.id));
        });
    });
    // 下一轮
    socket.on('nextRound', () => {
        const room = getPlayerRoom(socket.id);
        if (room && room.game) {
            room.nextRound();
            // 如果游戏已结束，重置到房间页面
            if (!room.game) {
                io.to(room.code).emit('gameEnded');
            }
            else {
                room.getPlayers().forEach(player => {
                    io.to(player.id).emit('gameUpdate', room.getGameStateForPlayer(player.id));
                });
            }
        }
    });
    // 断开连接
    socket.on('disconnect', () => {
        console.log(`Player disconnected: ${socket.id}`);
        const room = getPlayerRoom(socket.id);
        if (room) {
            const roomCode = room.code;
            room.removePlayer(socket.id);
            io.to(roomCode).emit('playersUpdate', room.getPlayers());
            if (room.players.size === 0) {
                rooms.delete(roomCode);
            }
        }
    });
});
const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`默认 AI 配置:`, defaultAIConfig);
});
