const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Раздаём статические файлы
app.use(express.static(path.join(__dirname, 'public')));

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Игровое состояние
const players = new Map(); // { id: { ws, name, x, z, rot } }
const zombies = new Map(); // { id: { x, z, type, health } }
const buildings = new Map(); // { id: { type, x, z, health } }

wss.on('connection', (ws) => {
    const playerId = Math.random().toString(36).substring(7);
    console.log('Новый игрок:', playerId);
    
    // Отправляем новому игроку его ID
    ws.send(JSON.stringify({
        type: 'init',
        id: playerId
    }));
    
    // Отправляем всех существующих игроков
    players.forEach((player, id) => {
        ws.send(JSON.stringify({
            type: 'player_join',
            id: id,
            name: player.name,
            x: player.x,
            z: player.z,
            rot: player.rot
        }));
    });
    
    // Отправляем всех зомби
    zombies.forEach((zombie, id) => {
        ws.send(JSON.stringify({
            type: 'zombie_spawn',
            id: id,
            x: zombie.x,
            z: zombie.z,
            type: zombie.type
        }));
    });
    
    // Отправляем все постройки
    buildings.forEach((building, id) => {
        ws.send(JSON.stringify({
            type: 'build',
            id: id,
            buildingType: building.type,
            x: building.x,
            z: building.z
        }));
    });
    
    ws.on('message', (data) => {
        try {
            const msg = JSON.parse(data);
            
            switch(msg.type) {
                case 'join':
                    players.set(playerId, {
                        ws: ws,
                        name: msg.name || 'Аноним',
                        x: msg.x || 0,
                        z: msg.z || 0,
                        rot: msg.rot || 0
                    });
                    break;
                    
                case 'move':
                    if (players.has(playerId)) {
                        const player = players.get(playerId);
                        player.x = msg.x;
                        player.z = msg.z;
                        player.rot = msg.rot;
                        
                        // Рассылаем всем
                        broadcast({
                            type: 'player_move',
                            id: playerId,
                            x: msg.x,
                            z: msg.z,
                            rot: msg.rot
                        }, ws);
                    }
                    break;
                    
                case 'zombie_spawn':
                    zombies.set(msg.id, {
                        x: msg.x,
                        z: msg.z,
                        type: msg.type,
                        health: msg.health || 50
                    });
                    
                    broadcast({
                        type: 'zombie_spawn',
                        id: msg.id,
                        x: msg.x,
                        z: msg.z,
                        type: msg.type
                    }, ws);
                    break;
                    
                case 'zombie_hit':
                    if (zombies.has(msg.id)) {
                        const zombie = zombies.get(msg.id);
                        zombie.health = msg.health;
                        
                        if (zombie.health <= 0) {
                            zombies.delete(msg.id);
                            broadcast({
                                type: 'zombie_death',
                                id: msg.id
                            }, ws);
                        } else {
                            broadcast({
                                type: 'zombie_hit',
                                id: msg.id,
                                health: msg.health
                            }, ws);
                        }
                    }
                    break;
                    
                case 'build':
                    buildings.set(msg.id, {
                        type: msg.buildingType,
                        x: msg.x,
                        z: msg.z,
                        health: 100
                    });
                    
                    broadcast({
                        type: 'build',
                        id: msg.id,
                        buildingType: msg.buildingType,
                        x: msg.x,
                        z: msg.z
                    }, ws);
                    break;
                    
                case 'chat':
                    if (players.has(playerId)) {
                        broadcast({
                            type: 'chat',
                            name: players.get(playerId).name,
                            message: msg.message
                        });
                    }
                    break;
            }
        } catch(e) {
            console.log('Ошибка:', e);
        }
    });
    
    ws.on('close', () => {
        console.log('Игрок ушёл:', playerId);
        players.delete(playerId);
        broadcast({
            type: 'player_left',
            id: playerId
        });
    });
});

function broadcast(message, excludeWs = null) {
    wss.clients.forEach(client => {
        if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(message));
        }
    });
}

const PORT = process.env.PORT || 10000;
server.listen(PORT, '0.0.0.0', () => {
    console.log('✅ ==========================');
    console.log(`✅ Сервер запущен на порту ${PORT}`);
    console.log('✅ IMBOVIY ZOMBIE SURVIVAL');
    console.log('✅ ==========================');
});
