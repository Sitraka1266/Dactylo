const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

let rooms = {};

const textes = {
    debutant: [
        "Au YMCA Madagascar, nous proposons aux jeunes des activités éducatives et ludiques pour apprendre tout en s'amusant. Aujourd'hui, dix-neuf clubs sont actifs, et parmi eux, le club Y-Tech accueille les jeunes passionnés par l'informatique et le numérique. Chaque samedi, de dix heures à midi, nous nous retrouvons pour apprendre ensemble et partager nos connaissances."
    ],
    intermediaire: [
        "Au YMCA Madagascar, nous accompagnons les jeunes depuis plus de cent ans. Dix-neuf clubs actifs répartis dans différentes régions offrent des activités éducatives et créatives adaptées aux intérêts des jeunes. Parmi ces clubs, le club Y-Tech rassemble des jeunes passionnés par l'informatique et le numérique. Chaque samedi, de dix heures à midi, nous participons à des ateliers pour apprendre la programmation, travailler sur des projets et progresser ensemble en équipe."
    ],
    expert: [
        "Au YMCA Madagascar, nous existons depuis plus d'un siècle et comptons actuellement dix-neuf clubs actifs. Chacun offre aux jeunes un espace pour apprendre, créer et partager. Parmi ces clubs, le club Y-Tech accueille les jeunes intéressés par l'informatique et le numérique. Chaque samedi, de dix heures à midi, nous nous réunissons pour travailler sur des projets concrets, partager nos connaissances et progresser ensemble. Le club n'est pas seulement un lieu d'apprentissage, mais aussi un espace collaboratif où chacun peut développer des compétences techniques, l'esprit d'équipe et la confiance nécessaire pour mener ses propres projets. Nous illustrons ainsi l'esprit du YMCA Madagascar : offrir aux jeunes un cadre éducatif, ludique et stimulant pour construire leur avenir."
    ]
};

io.on("connection", (socket) => {
    console.log("Socket connecté : " + socket.id);

    socket.on("createRoom", (data) => {
        const { roomId, level, name, clientId } = data;
        if(!rooms[roomId]){
            rooms[roomId] = {
                host: clientId,
                level,
                texte: textes[level][Math.floor(Math.random()*textes[level].length)],
                players: {},
                finishedPlayers: []
            };
        }
        socket.join(roomId);
        rooms[roomId].players[clientId] = { name, progress:0, cpm:0, socketId: socket.id, stats:{} };
        io.to(roomId).emit("texteCommun", rooms[roomId].texte);
        updatePlayers(roomId);
    });

    socket.on("joinRoom", (data) => {
        const { roomId, name, clientId } = data;
        if(!rooms[roomId]) return;
        socket.join(roomId);
        rooms[roomId].players[clientId] = { name, progress:0, cpm:0, socketId: socket.id, stats:{} };
        socket.emit("texteCommun", rooms[roomId].texte);
        updatePlayers(roomId);

        if(Object.keys(rooms[roomId].players).length >= 2){
            io.to(roomId).emit("contestStarted");
        }
    });

    socket.on("progress", (data) => {
        const { roomId, clientId, progress } = data;
        if(!rooms[roomId] || !rooms[roomId].players[clientId]) return;
        rooms[roomId].players[clientId].progress = progress;
        updatePlayers(roomId);
    });

    socket.on("speed", (data) => {
        const { roomId, clientId, cpm, errors } = data;
        if(!rooms[roomId] || !rooms[roomId].players[clientId]) return;
        rooms[roomId].players[clientId].cpm = cpm;
        rooms[roomId].players[clientId].stats = { cpm, errors };
        updatePlayers(roomId);
    });

    socket.on("finished", (data) => {
        const { roomId, clientId } = data;
        if(!rooms[roomId] || rooms[roomId].finishedPlayers.includes(clientId)) return;
        rooms[roomId].finishedPlayers.push(clientId);

        const stats = rooms[roomId].players[clientId].stats || {cpm:0, errors:0};
        io.to(rooms[roomId].players[clientId].socketId).emit("finishModal", stats);

        if(Object.keys(rooms[roomId].players).length === rooms[roomId].finishedPlayers.length){
            let maxCPM = 0;
            let winnerId = null;
            for(const id in rooms[roomId].players){
                const player = rooms[roomId].players[id];
                if(player.stats && player.stats.cpm > maxCPM){
                    maxCPM = player.stats.cpm;
                    winnerId = id;
                }
            }
            for(const id in rooms[roomId].players){
                const socketId = rooms[roomId].players[id].socketId;
                io.to(socketId).emit("finalWinner", id === winnerId ? "success" : "secondary");
            }
            delete rooms[roomId];
        }
    });

    socket.on("leaveRoom", ({ roomId, clientId }) => {
        if(!rooms[roomId]) return;
        delete rooms[roomId].players[clientId];

        if(Object.keys(rooms[roomId].players).length === 0 || rooms[roomId].host === clientId){
            io.to(roomId).emit("roomClosed");
            delete rooms[roomId];
        } else {
            updatePlayers(roomId);
        }
    });

   
    socket.on("getRooms", () => {
        const roomList = Object.keys(rooms).map(id => {
            return { roomId: id, level: rooms[id].level, host: rooms[id].host };
        });
        socket.emit("roomsList", roomList);
    });

    socket.on("disconnect", () => {
        console.log("Socket déconnecté : " + socket.id);
        for(const roomId in rooms){
            const players = rooms[roomId].players;
            for(const clientId in players){
                if(players[clientId].socketId === socket.id){
                    delete players[clientId];
                    if(Object.keys(players).length === 0 || rooms[roomId].host === clientId){
                        io.to(roomId).emit("roomClosed");
                        delete rooms[roomId];
                    } else {
                        updatePlayers(roomId);
                    }
                    break;
                }
            }
        }
    });

    function updatePlayers(roomId){
        io.to(roomId).emit("playersUpdate", rooms[roomId].players);
    }
});

server.listen(3000, () => console.log("Serveur en ligne sur http://0.0.0.0:3000"));
