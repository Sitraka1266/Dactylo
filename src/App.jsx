import { useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const socket = io();

const levelLabels = {
    debutant: 'Débutant',
    intermediaire: 'Intermédiaire',
    expert: 'Expert',
};

function App() {
    const [screen, setScreen] = useState('home');
    const [playerName, setPlayerName] = useState('');
    const [level, setLevel] = useState('expert');
    const [roomId, setRoomId] = useState('');
    const [rooms, setRooms] = useState([]);
    const [roomText, setRoomText] = useState('');
    const [players, setPlayers] = useState({});
    const [typingValue, setTypingValue] = useState('');
    const [isTypingEnabled, setIsTypingEnabled] = useState(false);
    const [result, setResult] = useState(null);
    const [winnerStatus, setWinnerStatus] = useState('');
    const inputRef = useRef(null);
    const urlSearch = useMemo(() => new URLSearchParams(window.location.search), []);

    const clientId = useMemo(() => {
        const stored = localStorage.getItem('clientId');
        if (stored) return stored;
        const generated = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        localStorage.setItem('clientId', generated);
        return generated;
    }, []);

    useEffect(() => {
        const savedName = localStorage.getItem('playerName') || '';
        const savedLevel = localStorage.getItem('level') || 'expert';
        setPlayerName(savedName);
        setLevel(savedLevel);

        const params = new URLSearchParams(window.location.search);
        const roomParam = params.get('roomId');
        const hostParam = params.get('host') === 'true';

        if (roomParam && hostParam) {
            socket.emit('createRoom', {
                roomId: roomParam,
                level: savedLevel,
                name: savedName || 'Hôte',
                clientId,
            });
        }

        if (roomParam && !hostParam) {
            socket.emit('joinRoom', {
                roomId: roomParam,
                name: savedName || 'Joueur',
                clientId,
            });
        }

        socket.on('roomsList', (roomList) => setRooms(roomList));
        socket.on('texteCommun', (txt) => {
            setRoomText(txt);
            setIsTypingEnabled(true);
            setTypingValue('');
            setTimeout(() => inputRef.current?.focus(), 50);
        });
        socket.on('playersUpdate', (updatedPlayers) => {
            setPlayers(updatedPlayers);
            setIsTypingEnabled(Object.keys(updatedPlayers).length >= 2);
            if (Object.keys(updatedPlayers).length >= 2) {
                setTimeout(() => inputRef.current?.focus(), 50);
            }
        });
        socket.on('finishModal', (stats) => {
            setResult({
                title: '✅ Terminé !',
                body: `Votre saisie est terminée.<br>CPM : ${stats.cpm || 0}<br>Nombre de fautes : ${stats.errors || 0}`,
                variant: 'success',
            });
        });
        socket.on('finalWinner', (winnerId) => {
            const isWinner = winnerId === clientId || winnerId === 'success';
            setWinnerStatus(isWinner ? 'success' : 'danger');
            setResult({
                title: isWinner ? '🎉 Vous êtes le vainqueur !' : '🏁 Terminé',
                body: isWinner ? 'Bravo, vous avez le CPM le plus élevé !' : 'Le concours est terminé.',
                variant: isWinner ? 'success' : 'danger',
            });
        });
        socket.on('roomClosed', () => {
            alert('La room a été fermée.');
            setScreen('home');
            window.history.pushState({}, '', '/');
        });

        return () => {
            socket.off('roomsList');
            socket.off('texteCommun');
            socket.off('playersUpdate');
            socket.off('finishModal');
            socket.off('finalWinner');
            socket.off('roomClosed');
        };
    }, [clientId]);

    useEffect(() => {
        if (screen === 'join') {
            socket.emit('getRooms');
        }
    }, [screen]);

    useEffect(() => {
        if (screen !== 'room') return;
        if (!roomText) {
            const savedText = localStorage.getItem('roomTexte');
            if (savedText) setRoomText(savedText);
        }
    }, [roomText, screen]);

    const createRoom = () => {
        const safeName = playerName.trim() || 'Hôte';
        const generatedRoom = `ROOM${Math.floor(Math.random() * 1000)}`;
        localStorage.setItem('playerName', safeName);
        localStorage.setItem('level', level);
        setPlayerName(safeName);
        setRoomId(generatedRoom);
        window.history.pushState({}, '', `/?roomId=${generatedRoom}&host=true`);
        socket.emit('createRoom', { roomId: generatedRoom, level, name: safeName, clientId });
        setScreen('room');
    };

    const joinSelectedRoom = (selectedRoomId, selectedLevel) => {
        const safeName = playerName.trim() || 'Joueur';
        localStorage.setItem('playerName', safeName);
        localStorage.setItem('level', selectedLevel);
        setPlayerName(safeName);
        setRoomId(selectedRoomId);
        window.history.pushState({}, '', `/?roomId=${selectedRoomId}`);
        socket.emit('joinRoom', { roomId: selectedRoomId, name: safeName, clientId });
        setScreen('room');
    };

    const refreshRooms = () => socket.emit('getRooms');

    const leaveRoom = () => {
        if (roomId) socket.emit('leaveRoom', { roomId, clientId });
        setScreen('home');
        setRoomText('');
        setPlayers({});
        setTypingValue('');
        setResult(null);
        setWinnerStatus('');
        window.history.pushState({}, '', '/');
    };

    const startTimeRef = useRef(null);
    const typedCharsTotalRef = useRef(0);

    const onTyping = (value) => {
        if (!roomText) return;
        if (!startTimeRef.current) startTimeRef.current = Date.now();

        const typed = value;
        typedCharsTotalRef.current = typed.length;

        let correctChars = 0;
        for (let i = 0; i < typed.length; i += 1) {
            if (typed[i] === roomText[i]) correctChars += 1;
            else break;
        }

        const progress = Math.floor((correctChars / roomText.length) * 100);
        const elapsedMinutes = (Date.now() - startTimeRef.current) / 60000;
        const cpm = elapsedMinutes > 0 ? Math.floor(typedCharsTotalRef.current / elapsedMinutes) : 0;
        const errors = typed.length - correctChars;

        socket.emit('progress', { roomId, clientId, progress });
        socket.emit('speed', { roomId, clientId, cpm, errors });

        if (correctChars === roomText.length) {
            socket.emit('finished', { roomId, clientId, stats: { cpm, errors } });
        }

        setTypingValue(typed);
    };

    return (
        <>
            <header>
                <img src="/assets/logo/logo no fond.svg" alt="Logo gauche" />
                <img src="/assets/logo/Logo_YMCA_HD.png" alt="Logo droite" />
            </header>

            {screen === 'home' && (
                <div className="container text-center mt-5">
                    <h1>Concours de Dactylo YMCA</h1>
                    <div className="mt-4">
                        <button className="btn btn-danger btn-lg m-2" onClick={() => setScreen('create')}>Créer une room</button>
                        <button className="btn btn-secondary btn-lg m-2" onClick={() => setScreen('join')}>Rejoindre une room</button>
                    </div>
                </div>
            )}

            {screen === 'create' && (
                <div className="container mt-5">
                    <h2>Créer une room (Host)</h2>
                    <div className="mb-3">
                        <label>Pseudo :</label>
                        <input type="text" value={playerName} onChange={(e) => setPlayerName(e.target.value)} className="form-control" placeholder="Votre pseudo" />
                    </div>
                    <div className="mb-3">
                        <label>Niveau :</label>
                        <select value={level} onChange={(e) => setLevel(e.target.value)} className="form-select">
                            {Object.entries(levelLabels).map(([value, label]) => (
                                <option key={value} value={value}>{label}</option>
                            ))}
                        </select>
                    </div>
                    <button className="btn btn-danger" onClick={createRoom}><i className="fas fa-plus-circle"></i> Créer la room</button>
                </div>
            )}

            {screen === 'join' && (
                <div className="container mt-5">
                    <h2>Rejoindre une room</h2>
                    <div className="mb-3">
                        <label>Pseudo :</label>
                        <input type="text" value={playerName} onChange={(e) => setPlayerName(e.target.value)} className="form-control" placeholder="Votre pseudo" />
                    </div>
                    <div id="roomsContainer" className="mt-4">
                        {rooms.length === 0 ? (
                            <p>Aucune room disponible</p>
                        ) : (
                            rooms.map((r) => (
                                <div key={r.roomId} className="mb-2 p-2 border rounded d-flex justify-content-between align-items-center">
                                    <span>Room: {r.roomId} - Niveau: {levelLabels[r.level] || r.level}</span>
                                    <button className="btn btn-secondary btn-sm" onClick={() => joinSelectedRoom(r.roomId, r.level)}>
                                        <i className="fas fa-sign-in-alt"></i> Rejoindre
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                    <button className="btn btn-primary mt-3" onClick={refreshRooms}><i className="fas fa-sync-alt"></i> Actualiser la liste</button>
                </div>
            )}

            {screen === 'room' && (
                <div className="container mt-4">
                    <h1 className="text-center mb-4 title-red">Y-tech TypeRush <i className="fas fa-keyboard text-dark"></i></h1>
                    <p id="texte">{roomText}</p>

                    <div className="mb-3">
                        <label htmlFor="input" className="form-label label-progress">Votre saisie :</label>
                        <textarea
                            id="input"
                            className="form-control"
                            value={typingValue}
                            onChange={(e) => onTyping(e.target.value)}
                            placeholder="Tapez le texte ci-dessus..."
                            disabled={!isTypingEnabled}
                            ref={inputRef}
                        />
                    </div>

                    <div id="playersContainer">
                        {Object.entries(players).map(([id, player]) => (
                            <div key={id} className="player-bar">
                                <div className="label-progress">
                                    {player.name} : {player.progress}%{player.cpm ? ` - ${player.cpm} CPM` : ''}
                                </div>
                                <div className="progress">
                                    <div className={`progress-bar ${id === clientId ? 'bg-danger' : 'bg-secondary'}`} role="progressbar" style={{ width: `${player.progress}%` }}>
                                        {player.progress}%
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    <button className="btn btn-secondary" id="leaveBtn" onClick={leaveRoom}><i className="fas fa-sign-out-alt"></i> Quitter la room</button>
                </div>
            )}

            {result && (
                <div className="modal fade show d-block" tabIndex="-1" role="dialog" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
                    <div className="modal-dialog modal-dialog-centered" role="document">
                        <div className={`modal-content ${result.variant === 'success' ? 'bg-success text-white' : 'bg-danger text-white'}`}>
                            <div className="modal-header border-0">
                                <h5 className="modal-title">{result.title}</h5>
                                <button type="button" className="btn-close btn-close-white" aria-label="Fermer" onClick={() => setResult(null)}></button>
                            </div>
                            <div className="modal-body" dangerouslySetInnerHTML={{ __html: result.body }} />
                            <div className="modal-footer border-0">
                                <button type="button" className="btn btn-light" onClick={() => setResult(null)}>Fermer</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

export default App;
