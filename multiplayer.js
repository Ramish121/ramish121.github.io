// --- MULTIPLAYER REMOTE CONTROL LOGIC ---
        let peer = null;
        let remoteConnection = null;
        const urlParams = new URLSearchParams(window.location.search);
        const isRemoteMode = urlParams.get('mode') === 'remote';
        const autoConnectId = urlParams.get('peerId'); 
        const userRole = urlParams.get('role') || 'player'; 

        let playerName = ""; 
        
        // NAYA: Smart Tracking State (Overwrite Mode ke liye)
        let multiPlayers = {}; 
        let totalConnected = 0;
        let currentAnswers = {}; 
        let autoShiftTimeout = null;
        let clientConnections = []; // NAYA: Sabhi connected mobiles ki list yahan save hogi

        // 1. Settings Toggle Logic
        function handleRemoteSettingChange() {
            const isEnabled = document.getElementById('remote-toggle').checked;
            const desc = document.getElementById('remote-desc');
            const qrBtns = document.getElementById('multiplayer-qr-btns');
            const setupQrBtns = document.getElementById('setup-multiplayer-qr-btns'); // NAYA
            
            if (isEnabled) {
                if(desc) desc.innerHTML = `<span class="text-blue-600 font-bold">Active:</span> Multiplayer ON.`;
                if(qrBtns) { qrBtns.classList.remove('hidden'); qrBtns.classList.add('flex'); }
                if(setupQrBtns) { setupQrBtns.classList.remove('hidden'); setupQrBtns.classList.add('flex'); }
            } else {
                if(desc) desc.innerHTML = `<span class="text-slate-400">Inactive:</span> Remote off.`;
                if(qrBtns) { qrBtns.classList.add('hidden'); qrBtns.classList.remove('flex'); }
                if(setupQrBtns) { setupQrBtns.classList.add('hidden'); setupQrBtns.classList.remove('flex'); }
            }
        }

        // 2. QR Modal Functions
        function openRemoteQR(role) {
            document.getElementById('qr-modal').classList.remove('hidden');
            if(peer && peer.id) {
                const baseUrl = window.location.href.split('?')[0]; 
                const magicUrl = `${baseUrl}?mode=remote&peerId=${peer.id}&role=${role}`;
                const qrContainer = document.getElementById('qrcode-container');
                qrContainer.innerHTML = ''; 
                new QRCode(qrContainer, {
                    text: magicUrl,
                    width: 160, height: 160,
                    colorDark : "#0f172a", colorLight : "#ffffff",
                    correctLevel : QRCode.CorrectLevel.H
                });
            }
        }
        function closeRemoteQR() { document.getElementById('qr-modal').classList.add('hidden'); }

       // 3. Main Desktop Initialization (The Server)
        function initPeer() {
            // NAYA: Google STUN servers for faster and stable local connections
            peer = new Peer({
                config: { 'iceServers': [{ urls: 'stun:stun.l.google.com:19302' }] }
            }); 
            peer.on('connection', function(conn) {
                clientConnections.push(conn); 
                
                conn.on('data', function(data) {
                    if (data.type === 'join') {
                        if (!multiPlayers[data.name]) {
                            totalConnected++;
                            updateHUDOnJoin(data.name); 
                        }
                        multiPlayers[data.name] = { 
                            score: multiPlayers[data.name]?.score || 0,
                            streak: multiPlayers[data.name]?.streak || 0,
                            maxStreak: multiPlayers[data.name]?.maxStreak || 0 
                        };
                        showToast("👤 " + data.name + " Joined!");
                        
                        broadcastToMobiles({ 
                            type: 'update_player_list', 
                            list: Object.keys(multiPlayers), 
                            count: totalConnected 
                        });

                        // NAYA: Naye player ko batao ki wo Waiting mein jayega ya direct Game mein
                        conn.send({ type: quizActive ? 'quiz_started' : 'waiting_room' });
                    } 
                    else if (data.type === 'answer') {
                        handleMultiplayerAnswer(data.name, data.option);
                    } 
                    else if (data.type === 'cmd') {
                        if (data.cmd === 'REQUEST_LIST') {
                            broadcastToMobiles({ 
                                type: 'update_player_list', 
                                list: Object.keys(multiPlayers), 
                                count: totalConnected 
                            });
                        } else {
                            handleRemoteCommand(data.cmd);
                        }
                    }
                });
            });
        }

        function broadcastToMobiles(payload) {
            clientConnections.forEach(conn => {
                if(conn && conn.open) conn.send(payload);
            });
        }

        // HUD Functions
        function updateHUDOnJoin(name) {
            const hud = document.getElementById('player-hud');
            if(!hud) return;
            const badge = document.createElement('div');
            badge.id = 'badge-' + name;
            badge.className = 'px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400 transition-colors border border-slate-300 dark:border-slate-700';
            badge.innerText = name;
            hud.appendChild(badge);
        }

        function resetHUD() {
             const hud = document.getElementById('player-hud');
             if(hud) {
                 Array.from(hud.children).forEach(badge => {
                     badge.classList.remove('bg-green-500', 'text-white', 'border-green-600', 'dark:bg-green-600', 'dark:border-green-500');
                     badge.classList.add('bg-slate-200', 'text-slate-500', 'border-slate-300', 'dark:bg-slate-800', 'dark:text-slate-400', 'dark:border-slate-700');
                 });
             }
        }

      // Smart Answer Tracking & Overwrite Logic
        // Smart Answer Tracking & Overwrite Logic
        function handleMultiplayerAnswer(name, option) {
            if(document.getElementById('quiz-view').classList.contains('hidden')) return;
            
            // Agar 3-sec timer start ho chuka hai, toh answers LOCK kar do
            if (autoShiftTimeout !== null) {
                return; 
            }
            
            let playerBadge = document.getElementById('badge-' + name);
            if(playerBadge) {
                playerBadge.classList.remove('bg-slate-200', 'text-slate-500', 'border-slate-300', 'dark:bg-slate-800', 'dark:text-slate-400', 'dark:border-slate-700');
                playerBadge.classList.add('bg-green-500', 'text-white', 'border-green-600', 'dark:bg-green-600', 'dark:border-green-500');
            }

            currentAnswers[name] = option;
            const answeredCount = Object.keys(currentAnswers).length;

            if (answeredCount >= totalConnected && totalConnected > 0) {
                showToast("⏳ Everyone answered! Next in 3 sec...");
                
                const q = questions[currentIndex];
                const btns = document.querySelectorAll('#options-container button');
                
                // NAYA: Sirf ek player hone par uska galat answer detect karna aur memory mein save karna
                let singlePlayerAnswer = null;
                if (totalConnected === 1) {
                    const playerNames = Object.keys(currentAnswers);
                    if(playerNames.length > 0) {
                        singlePlayerAnswer = currentAnswers[playerNames[0]];
                        // NAYA: User responses mein save karo taaki Review aur Practice Mistakes kaam kare
                        userResponses[currentIndex] = singlePlayerAnswer; 
                    }
                }
                
                q.options.forEach((opt, index) => {
                    // Sahi answer ko hamesha green karo
                    if(opt.label.toLowerCase() === q.correctAnswer.toLowerCase() && btns[index]) {
                        btns[index].classList.add('correct');
                    } 
                    // Agar ek hi player hai aur uska answer galat hai, toh usko red karo
                    else if (totalConnected === 1 && singlePlayerAnswer && opt.label.toLowerCase() === singlePlayerAnswer.toLowerCase() && btns[index]) {
                        btns[index].classList.add('wrong');
                    }
                });

                Object.keys(multiPlayers).forEach(playerName => {
                    const playerAnswer = currentAnswers[playerName];
                    
                    if (playerAnswer && playerAnswer.toLowerCase() === q.correctAnswer.toLowerCase()) {
                        multiPlayers[playerName].score += 1;
                        multiPlayers[playerName].streak += 1;
                        if(multiPlayers[playerName].streak > multiPlayers[playerName].maxStreak) {
                            multiPlayers[playerName].maxStreak = multiPlayers[playerName].streak;
                        }
                    } else {
                        multiPlayers[playerName].streak = 0;
                    }
                });

                if (typeof broadcastToMobiles === 'function') {
                    broadcastToMobiles({ type: 'turn_result', playersData: multiPlayers });
                }

                // Timer shuru karo
                autoShiftTimeout = setTimeout(() => {
                    currentAnswers = {};
                    resetHUD();
                    autoShiftTimeout = null; 
                    nextOrFinish();
                }, 3000);
            }
        }

        // Host Manual Commands (UPDATED for Advanced Logic)
        function handleRemoteCommand(command) {
            if(document.getElementById('quiz-view').classList.contains('hidden')) return;
            
            if(command === 'NEXT' || command === 'BACK') {
                clearTimeout(autoShiftTimeout); 
                autoShiftTimeout = null; 
                currentAnswers = {};
                resetHUD();
                if(command === 'NEXT') nextOrFinish();
                if(command === 'BACK') prevQuestion();
            }
            if(command === 'SHOW_LEADERBOARD') {
                showResults();
            }
            if(command === 'PAUSE') {
                clearTimeout(autoShiftTimeout);
                clearInterval(timerInterval); // Timer rok do
                showToast("⏸ Game Paused by Admin");
                document.getElementById('question-card').classList.add('opacity-50', 'pointer-events-none');
            }
            if(command === 'RESUME') {
                document.getElementById('question-card').classList.remove('opacity-50', 'pointer-events-none');
                showToast("▶️ Game Resumed");
                if (maxTimePerQuestion > 0 && timeLeft > 0) {
                    timerInterval = setInterval(() => {
                        timeLeft--;
                        updateTimerDisplay();
                        if (timeLeft <= 5) document.getElementById('timer-text').classList.add('timer-low');
                        else document.getElementById('timer-text').classList.remove('timer-low');
                        if (timeLeft <= 0) {
                            clearInterval(timerInterval);
                            timerInterval = null;
                            if (!userResponses[currentIndex]) userResponses[currentIndex] = 'TIMED_OUT';
                            showQuestion();
                        }
                    }, 1000);
                }
            }
            if(command === 'SHOW_QR') {
                openRemoteQR('player');
            }
            if(command.startsWith('KICK:')) {
                const targetName = command.split(':')[1];
                if(multiPlayers[targetName]) {
                    // NAYA: Us specific player ko signal bhejo ki wo nikal diya gaya hai
                    if (typeof broadcastToMobiles === 'function') {
                        broadcastToMobiles({ type: 'kicked', target: targetName });
                    }
                    
                    delete multiPlayers[targetName]; // Player ko system se nikal do
                    totalConnected--;
                    
                    // HUD se uska badge hatao
                    const badge = document.getElementById('badge-' + targetName);
                    if(badge) badge.remove();
                    
                    showToast("👢 " + targetName + " removed by Admin");
                    
                    const countEl = document.getElementById('host-player-count');
                    if(countEl) countEl.innerText = totalConnected;
                    
                    // Nayi list sabko bhejo
                    broadcastToMobiles({ type: 'update_player_list', list: Object.keys(multiPlayers), count: totalConnected });
                }
            }
        }

        // --- NAYA: Mobile Advanced Menu JS Logic ---
        function openHostAdvancedMenu() {
            document.getElementById('host-advanced-modal').classList.remove('hidden');
            document.getElementById('host-advanced-modal').classList.add('flex');
            // Menu khulte hi list update karne ki request
            if(remoteConnection && remoteConnection.open) {
                remoteConnection.send({ type: 'cmd', cmd: 'REQUEST_LIST', name: playerName });
            }
        }

        function closeHostAdvancedMenu() {
            document.getElementById('host-advanced-modal').classList.add('hidden');
            document.getElementById('host-advanced-modal').classList.remove('flex');
        }

        function confirmEndGame() {
            if(confirm("⚠️ Are you sure you want to END the quiz and show results?")) {
                sendRemoteCommand('SHOW_LEADERBOARD');
                closeHostAdvancedMenu();
            }
        }

        function confirmKickPlayer(targetName) {
            if(confirm(`⚠️ Remove ${targetName} from the quiz?\n\nThey will not be able to answer anymore.`)) {
                sendRemoteCommand('KICK:' + targetName);
            }
        }

    
       // 4. Mobile Remote Logic (With Auto-Reconnect Save)
        function connectToDesktop() {
            playerName = document.getElementById('player-name-input').value.trim();
            if(!playerName) return alert("Please enter your name first!");

            const targetId = document.getElementById('connect-id-input').value.trim();
            if(!targetId) return alert("Desktop ID missing!");

            // NAYA: Player ka naam aur Host ID local memory mein save kar lo
            sessionStorage.setItem('ramish_quiz_name', playerName);
            sessionStorage.setItem('ramish_quiz_host', targetId);

            document.getElementById('remote-status').innerText = "Connecting...";
            // NAYA: Connection ko 'reliable' mark karna taaki data drop na ho
            remoteConnection = peer.connect(targetId, { reliable: true });
            
            remoteConnection.on('open', function() {
                remoteConnection.send({ type: 'join', name: playerName, role: userRole });

                document.getElementById('remote-status').innerText = "👤 " + playerName;
                document.getElementById('remote-status').classList.replace('text-slate-400', 'text-green-400');
                
                document.getElementById('player-join-box').classList.add('hidden');
                document.getElementById('gameplay-controls').classList.remove('hidden');
                document.getElementById('gameplay-controls').classList.add('flex');

                if (userRole === 'host') {
                    document.getElementById('host-extra-controls').classList.remove('hidden');
                    document.getElementById('host-extra-controls').classList.add('flex');
                    document.getElementById('host-stats').classList.remove('hidden');
                    document.getElementById('remote-title').innerText = "Admin Panel";
                    document.getElementById('remote-title').classList.replace('text-blue-400', 'text-purple-400');
                }

                // Mobile par Laptop se aane wale signals ko sunna
                remoteConnection.on('data', function(data) {
                    // NAYA: Kicked Signal Receive karna
                    if (data.type === 'kicked') {
                        // Check karo ki kya yeh signal isi player ke liye hai
                        if (playerName === data.target) {
                            // Local storage saaf kar do taaki page refresh karne par wapas connect na ho
                            sessionStorage.removeItem('ramish_quiz_name');
                            sessionStorage.removeItem('ramish_quiz_host');
                            
                            // Saare controls chupa do aur Kicked screen dikhao
                            document.getElementById('gameplay-controls').classList.add('hidden');
                            document.getElementById('gameplay-controls').classList.remove('flex');
                            document.getElementById('mobile-result-card').classList.add('hidden');
                            
                            const badge = document.getElementById('streak-badge');
                            if(badge) badge.classList.add('hidden');
                            
                            const kickedScreen = document.getElementById('kicked-screen');
                            if(kickedScreen) {
                                kickedScreen.classList.remove('hidden');
                                kickedScreen.classList.add('flex');
                            }
                            
                            // Connection puri tarah se kaat do
                            if(remoteConnection) remoteConnection.close();
                        }
                    }

                    // NAYA: Waiting Room Logic
                    if (data.type === 'waiting_room') {
                        document.getElementById('player-join-box').classList.add('hidden');
                        document.getElementById('gameplay-controls').classList.add('hidden');
                        document.getElementById('gameplay-controls').classList.remove('flex');
                        document.getElementById('mobile-result-card').classList.add('hidden');
                        document.getElementById('mobile-result-card').classList.remove('flex');

                        const waitingScreen = document.getElementById('waiting-screen');
                        if(waitingScreen) {
                            waitingScreen.classList.remove('hidden');
                            waitingScreen.classList.add('flex');
                        }
                    }

                    // NAYA: Game Started Logic
                    if (data.type === 'quiz_started') {
                        const waitingScreen = document.getElementById('waiting-screen');
                        if(waitingScreen) {
                            waitingScreen.classList.add('hidden');
                            waitingScreen.classList.remove('flex');
                        }
                        document.getElementById('player-join-box').classList.add('hidden');
                        document.getElementById('mobile-result-card').classList.add('hidden');
                        document.getElementById('mobile-result-card').classList.remove('flex');

                        document.getElementById('gameplay-controls').classList.remove('hidden');
                        document.getElementById('gameplay-controls').classList.add('flex');
                    }
                    
                    // NAYA: Live Participant List Mobile par Update Karna (Purane update_count ki jagah)
                    if (data.type === 'update_player_list') {
                        const adminCount = document.getElementById('admin-list-count');
                        const mainCount = document.getElementById('host-player-count');
                        if (adminCount) adminCount.innerText = data.count;
                        if (mainCount) mainCount.innerText = data.count;

                        const listContainer = document.getElementById('admin-participants-list');
                        if (listContainer) {
                            listContainer.innerHTML = '';
                            if(data.list.length === 0) {
                                listContainer.innerHTML = '<p class="text-xs text-slate-500 italic">No participants yet.</p>';
                            } else {
                                data.list.forEach(pName => {
                                    listContainer.innerHTML += `
                                        <div class="flex justify-between items-center bg-slate-900 p-3 rounded-xl border border-slate-700 mb-2">
                                            <span class="font-bold text-slate-300 text-sm">👤 ${pName}</span>
                                            <button onclick="confirmKickPlayer('${pName}')" class="text-xs bg-red-900/50 text-red-400 hover:bg-red-600 hover:text-white px-3 py-1.5 rounded-lg transition-colors font-bold border border-red-800">Remove</button>
                                        </div>
                                    `;
                                });
                            }
                        }
                    }

                    if (data.type === 'reset_ui') {
                        // NAYA: Question Number Screen Par Dikhana
                        const qProg = document.getElementById('remote-q-progress');
                        if(qProg && data.currentQ && data.totalQ) {
                            qProg.innerText = `Question ${data.currentQ} / ${data.totalQ}`;
                            qProg.classList.remove('hidden');
                        }

                        // Buttons wapas normal kar do
                        ['a','b','c','d'].forEach(opt => {
                            const btn = document.getElementById('btn-' + opt);
                            if(btn) {
                                btn.classList.remove('translate-y-[5px]', 'shadow-none', 'ring-4', 'ring-white', 'opacity-40', 'scale-95');
                            }
                        });
                    }

                    if (data.type === 'turn_result') {
                        const myData = data.playersData[playerName];
                        const badge = document.getElementById('streak-badge');
                        if (myData && myData.streak >= 3) {
                            document.getElementById('streak-count').innerText = myData.streak;
                            badge.classList.remove('hidden');
                        } else {
                            badge.classList.add('hidden');
                        }
                    }

                    if (data.type === 'game_over') {
                        const myData = data.playersData[playerName];
                        
                        // NAYA: Advanced modal ko force-close karna zaroori hai
                        const advancedModal = document.getElementById('host-advanced-modal');
                        if(advancedModal) {
                            advancedModal.classList.add('hidden');
                            advancedModal.classList.remove('flex');
                        }
                        
                        document.getElementById('gameplay-controls').classList.remove('flex');
                        document.getElementById('gameplay-controls').classList.add('hidden');
                        
                        document.getElementById('mobile-result-card').classList.remove('hidden');
                        document.getElementById('mobile-result-card').classList.add('flex');
                        
                        if(myData) {
                            document.getElementById('mobile-final-score').innerText = myData.score;
                            document.getElementById('mobile-final-streak').innerText = '🔥 ' + myData.maxStreak;
                        }
                    }
                });
            });

            remoteConnection.on('error', function(err) {
                document.getElementById('remote-status').innerText = "❌ Connection Failed";
            });
        }

        // NAYA: Mobile Button 3D Effect Function
        function sendPlayerAnswer(option) {
            if(remoteConnection && remoteConnection.open) {
                remoteConnection.send({ type: 'answer', option: option, name: playerName });
                if (navigator.vibrate) navigator.vibrate(50);
                
                // 3D Press Effect lagao (Jo dabaya wo dhas jayega, baaki light ho jayenge)
                ['a','b','c','d'].forEach(opt => {
                    const btn = document.getElementById('btn-' + opt);
                    if(!btn) return;
                    if(opt === option) {
                        btn.classList.add('translate-y-[5px]', 'shadow-none', 'ring-4', 'ring-white');
                        btn.classList.remove('opacity-40', 'scale-95');
                    } else {
                        btn.classList.remove('translate-y-[5px]', 'shadow-none', 'ring-4', 'ring-white');
                        btn.classList.add('opacity-40', 'scale-95');
                    }
                });
            }
        }

        function sendRemoteCommand(cmd) {
            if(remoteConnection && remoteConnection.open) {
                remoteConnection.send({ type: 'cmd', cmd: cmd, name: playerName });
                if (navigator.vibrate) navigator.vibrate(50);
            }
        }

        // 5. On Load Setup (With Auto-Reconnect)
        window.onload = function() {
            updateFolderSelectDropdown();
            loadSettingsFromStorage(); 
            loadLibrary();

            if(isRemoteMode) {
                document.getElementById('app').style.display = 'none'; 
                document.getElementById('remote-view').classList.remove('hidden');
                
                // NAYA: Mobile par bhi STUN server setup
                peer = new Peer({
                    config: { 'iceServers': [{ urls: 'stun:stun.l.google.com:19302' }] }
                }); 
                
                // Auto-Reconnect Logic
                const savedName = sessionStorage.getItem('ramish_quiz_name');
                const savedHost = sessionStorage.getItem('ramish_quiz_host');

                if (savedName && savedHost) {
                    document.getElementById('player-name-input').value = savedName;
                    document.getElementById('connect-id-input').value = savedHost;
                    
                    // Thoda time dekar auto-connect trigger karna
                    setTimeout(() => {
                        connectToDesktop();
                    }, 1000);
                } 
                else if(autoConnectId) {
                    document.getElementById('connect-id-input').value = autoConnectId;
                } else {
                    document.getElementById('connect-id-input').classList.remove('hidden');
                }
                
                if (userRole === 'host') {
                    document.getElementById('join-heading').innerText = "👑 Host Setup";
                }
            } else {
                initPeer();
                if(document.getElementById('remote-toggle')) {
                    handleRemoteSettingChange();
                }
            }
        };

       // 6. Multiplayer Leaderboard Function 
        function showLeaderboard() {
            const lbContainer = document.getElementById('multiplayer-leaderboard-container');
            const lbList = document.getElementById('leaderboard-list');
            
            // NAYA: Laptop sabhi mobiles ko 'game_over' ka signal bhejega
            if (typeof broadcastToMobiles === 'function') {
                broadcastToMobiles({ type: 'game_over', playersData: multiPlayers });
            }

            if(!lbContainer || !lbList) return;
            
            lbContainer.classList.remove('hidden');
            lbList.innerHTML = '';
            
            // Sabhi players ke data ko array mein convert karke score ke hisaab se sort karna
            const playersArray = Object.keys(multiPlayers).map(name => {
                return { name: name, score: multiPlayers[name].score };
            });
            
            playersArray.sort((a, b) => b.score - a.score); // Highest score sabse upar
            
            playersArray.forEach((player, index) => {
                let medal = '🏅';
                let bgClass = 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-700';
                
                // Top 3 ke liye special colors aur medals
                if(index === 0) { medal = '🥇'; bgClass = 'bg-yellow-100 dark:bg-yellow-900/30 border-yellow-400 shadow-md transform scale-105 z-10 relative'; }
                else if(index === 1) { medal = '🥈'; bgClass = 'bg-slate-200 dark:bg-slate-700/50 border-slate-400'; }
                else if(index === 2) { medal = '🥉'; bgClass = 'bg-orange-100 dark:bg-orange-900/30 border-orange-400'; }
                
                const item = document.createElement('div');
                item.className = `flex justify-between items-center p-4 rounded-2xl border-2 transition-all ${bgClass}`;
                item.innerHTML = `
                    <div class="flex items-center gap-4">
                        <span class="text-3xl">${medal}</span>
                        <span class="text-xl font-bold text-slate-800 dark:text-slate-100">${player.name}</span>
                    </div>
                    <div class="text-2xl font-black text-primary-600 dark:text-primary-400">
                        ${player.score} <span class="text-sm text-slate-500 font-bold uppercase">Pts</span>
                    </div>
                `;
                lbList.appendChild(item);
            });

            // Normal single-player result boxes ko hide kar do
            const normalStats = document.querySelector('#result-view .grid.sm\\:grid-cols-4');
            if(normalStats) normalStats.classList.add('hidden');
        }