// --- State Variables ---
        let questions = [];
        let originalChapterName = "";
        let currentIndex = 0;
        let score = 0;
        let userResponses = {};
        let timerInterval = null;
        let timeLeft = 0;
        let maxTimePerQuestion = 30;
        let isExamMode = false;
        let isShuffleMode = false;
        let isPaletteEnabled = false; 
        
        let quizStartTime; 
        let quizActive = false;
        
        // FOLDER STATE
        let activeFolderId = null; // null = root menu

        window.addEventListener('beforeunload', function (e) {
            if (quizActive) {
                e.preventDefault(); 
                e.returnValue = ''; 
            }
        });

        window.onpopstate = function (event) {
            if (quizActive) {
                const userWantsToLeave = confirm("⚠️ Warning: Test in Progress!\n\nGoing back will reset your score and progress. Are you sure you want to leave?");
                
                if (userWantsToLeave) {
                    quizActive = false;
                    exitToSetup();
                } else {
                    history.pushState(null, document.title, location.href);
                }
            }
        };

        function setTheme(themeName) {
            document.body.className = document.body.className.replace(/theme-\w+/g, '');
            if (themeName !== 'blue') document.body.classList.add(`theme-${themeName}`);
            localStorage.setItem('mcq_hub_color_theme', themeName);
        }
        const savedTheme = localStorage.getItem('mcq_hub_color_theme');
        if (savedTheme) setTheme(savedTheme);

        function shuffleArray(array) {
            for (let i = array.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [array[i], array[j]] = [array[j], array[i]];
            }
            return array;
        }

        function showView(viewId) {
            ['setup-view', 'quiz-view', 'result-view', 'review-view'].forEach(id => document.getElementById(id).classList.add('hidden'));
            document.getElementById(viewId).classList.remove('hidden');
            
            const sidebar = document.getElementById('sidebar');
            const mainContent = document.getElementById('main-content');
            const appHeader = document.getElementById('app-header');
            const mobileLibBtn = document.getElementById('mobile-lib-btn');
            
            if (mobileLibBtn) {
                if (viewId === 'quiz-view') mobileLibBtn.classList.add('hidden');
                else mobileLibBtn.classList.remove('hidden');
            }

            if (viewId === 'setup-view') {
                sidebar.classList.remove('hidden');
                appHeader.classList.remove('hidden');
                mainContent.className = "w-full md:w-2/3 order-1 md:order-2 transition-all duration-300 flex flex-col h-full";
                document.getElementById('app').classList.add('md:p-8');
            } else {
                sidebar.classList.add('hidden');
                if (viewId === 'quiz-view') appHeader.classList.add('hidden');
                else if (viewId === 'review-view') appHeader.classList.add('hidden');
                else appHeader.classList.remove('hidden');
                mainContent.className = "w-full transition-all duration-300 flex flex-col h-full";
                document.getElementById('app').classList.remove('md:p-8');
            }
            if(viewId !== 'quiz-view' && viewId !== 'review-view') window.scrollTo(0, 0);
        }

        // ---------- FOLDER FUNCTIONS ---------- //
        function createNewFolder() {
            const folderName = prompt("Enter new folder name:");
            if (!folderName || !folderName.trim()) return;
            
            const folders = JSON.parse(localStorage.getItem('mcq_hub_folders') || '[]');
            const newFolder = { id: Date.now().toString(), name: folderName.trim() };
            folders.push(newFolder);
            localStorage.setItem('mcq_hub_folders', JSON.stringify(folders));
            
            updateFolderSelectDropdown();
            loadLibrary();
            showToast("📁 Folder Created!");
        }

        function deleteFolder(e, id) {
            e.stopPropagation(); // Parent ke click ko rokne ke liye
            if(confirm("⚠️ WARNING!\n\nAre you sure you want to delete this folder?\nALL QUIZZES inside this folder will also be DELETED permanently!")) {
                // Delete Folder
                let folders = JSON.parse(localStorage.getItem('mcq_hub_folders') || '[]');
                folders = folders.filter(f => f.id !== id);
                localStorage.setItem('mcq_hub_folders', JSON.stringify(folders));
                
                // Delete Items inside Folder
                let lib = JSON.parse(localStorage.getItem('mcq_hub_library') || '[]');
                lib = lib.filter(i => i.folderId !== id);
                localStorage.setItem('mcq_hub_library', JSON.stringify(lib));
                
                if (activeFolderId === id) activeFolderId = null;
                
                updateFolderSelectDropdown();
                loadLibrary();
                showToast("🗑️ Folder Deleted");
            }
        }

        function openFolder(id, name) {
            activeFolderId = id;
            document.getElementById('library-search').value = ''; // clear search on enter
            loadLibrary();
        }

        function goBackToRoot() {
            activeFolderId = null;
            document.getElementById('library-search').value = '';
            loadLibrary();
        }

        function updateFolderSelectDropdown() {
            const selectEl = document.getElementById('folder-select');
            if(!selectEl) return;
            
            // Current selection bachaye rakhne ke liye
            const currentVal = selectEl.value;
            
            const folders = JSON.parse(localStorage.getItem('mcq_hub_folders') || '[]');
            
            let html = `<option value="">📁 Main Menu (Root)</option>`;
            folders.forEach(f => {
                html += `<option value="${f.id}">📂 ${f.name}</option>`;
            });
            selectEl.innerHTML = html;
            
            // Agar purana select val valid hai to set kardo
            if(folders.some(f => f.id === currentVal)) {
                selectEl.value = currentVal;
            }
        }
        // -------------------------------------- //

        function openSettings() { 
            updateSettingUI('exam');
            updateSettingUI('shuffle');
            updateSettingUI('palette');
            updateSettingUI('timer');
            document.getElementById('settings-modal').classList.remove('hidden'); 
        }
        function closeSettings() { document.getElementById('settings-modal').classList.add('hidden'); }
        function handleTimerToggle() { updateSettingUI('timer'); }

        function updateSettingUI(type) {
            const isChecked = document.getElementById(type + '-toggle')?.checked;
            const descEl = document.getElementById(type + '-desc');
            if (!descEl) return;
            // ... (baki setting code same hai)
            if (type === 'exam') {
                if (isChecked) descEl.innerHTML = `<span class="text-primary-600 font-bold">Active:</span> Answers & score hidden until result.`;
                else descEl.innerHTML = `<span class="text-slate-400">Inactive:</span> Answers shown immediately.`;
            } else if (type === 'shuffle') {
                if (isChecked) descEl.innerHTML = `<span class="text-primary-600 font-bold">Active:</span> Questions will appear randomly.`;
                else descEl.innerHTML = `<span class="text-slate-400">Inactive:</span> Original question order.`;
            } else if (type === 'palette') {
                if (isChecked) descEl.innerHTML = `<span class="text-primary-600 font-bold">Active:</span> Map button visible in quiz.`;
                else descEl.innerHTML = `<span class="text-slate-400">Inactive:</span> Map button hidden.`;
            } else if (type === 'timer') {
                const inputContainer = document.getElementById('timer-input-container');
                if (isChecked) {
                    descEl.innerHTML = `<span class="text-primary-600 font-bold">Active:</span> Time limit enforced.`;
                    inputContainer.classList.remove('hidden');
                } else {
                    descEl.innerHTML = `<span class="text-slate-400">Inactive:</span> No time limit.`;
                    inputContainer.classList.add('hidden');
                }
            }
        }

        // Palette Code...
        function openPalette() {
            renderPalette();
            document.getElementById('palette-modal').classList.remove('hidden');
        }
        function closePalette() { document.getElementById('palette-modal').classList.add('hidden'); }
        function renderPalette() {
            const grid = document.getElementById('palette-grid');
            grid.innerHTML = '';
            questions.forEach((q, idx) => {
                const btn = document.createElement('button');
                btn.innerText = q.originalNumber; 
                btn.className = "palette-btn p-unanswered";
                
                const response = userResponses[idx];
                if (response) {
                    if (isExamMode) btn.className = "palette-btn p-answered-neutral"; 
                    else {
                        if (response === q.correctAnswer) btn.className = "palette-btn p-correct";
                        else btn.className = "palette-btn p-wrong";
                    }
                }
                
                if (idx === currentIndex) btn.classList.add('p-current');
                btn.onclick = () => {
                    clearInterval(timerInterval);
                    timerInterval = null;
                    currentIndex = idx;
                    showQuestion();
                    closePalette();
                };
                grid.appendChild(btn);
            });
        }

        function startQuiz(data, name) {
            quizActive = true; 
            history.pushState(null, document.title, location.href);

            if (isShuffleMode) questions = shuffleArray([...data]);
            else questions = data;
            
            originalChapterName = name;
            currentIndex = 0;
            score = 0;
            userResponses = {};
            quizStartTime = Date.now();
            
            document.getElementById('current-chapter-name').innerText = name;
            
            if (isPaletteEnabled) document.getElementById('open-palette-btn').classList.remove('hidden');
            else document.getElementById('open-palette-btn').classList.add('hidden');

            showView('quiz-view');
            showQuestion();
            saveSession();

            // NAYA: Jaise hi "Bismillah" dabe, sab mobiles ko Game Start ka signal bhejo
            if (typeof broadcastToMobiles === 'function') {
                broadcastToMobiles({ type: 'quiz_started' });
            }
        }

        function calculateScore() {
            let s = 0;
            questions.forEach((q, i) => { if (userResponses[i] === q.correctAnswer) s++; });
            return s;
        }

        function showQuestion() {
            const q = questions[currentIndex];
            document.getElementById('question-text').innerHTML = `${q.originalNumber}. ${q.text}`;

            const container = document.getElementById('options-container');
            container.innerHTML = '';

            if (maxTimePerQuestion > 0) {
                if (!userResponses[currentIndex]) {
                    if (!timerInterval) startTimer();
                } else if (isExamMode && userResponses[currentIndex] !== 'TIMED_OUT') {
                    if (!timerInterval) startTimer();
                } else {
                    clearInterval(timerInterval);
                    timerInterval = null;
                    document.getElementById('timer-text').innerText = "--:--";
                }
            } else {
                document.getElementById('timer-container').classList.add('hidden');
            }

            q.options.forEach(opt => {
                const btn = document.createElement('button');
                btn.className = "option-btn w-full text-left p-3 md:p-5 border-2 border-slate-100 dark:border-slate-800 rounded-xl md:rounded-2xl flex items-center group";
                btn.innerHTML = `<span class="w-6 h-6 md:w-8 md:h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-bold mr-3 md:mr-4 text-slate-400 uppercase text-xs md:text-sm shrink-0">${opt.label}</span><span class="text-sm md:text-lg font-medium">${opt.text}</span>`;

                if (userResponses[currentIndex]) {
                    if (isExamMode) {
                        if (userResponses[currentIndex] === opt.label) btn.classList.add('selected-neutral');
                        if (userResponses[currentIndex] === 'TIMED_OUT') btn.disabled = true;
                    } else {
                        if (opt.label === q.correctAnswer) btn.classList.add('correct');
                        else if (opt.label === userResponses[currentIndex]) btn.classList.add('wrong');
                        btn.disabled = true;
                    }
                }

                btn.onclick = () => {
                    userResponses[currentIndex] = opt.label;
                    if (!isExamMode) {
                        clearInterval(timerInterval);
                        timerInterval = null;
                        if (opt.label === q.correctAnswer) score = calculateScore();
                    }
                    saveSession(); 
                    showQuestion(); 
                };
                container.appendChild(btn);
            });
            updateProgress();
            
            // NAYA: Mobiles ko signal bhejna ki agla question aa gaya hai, buttons reset karlo aur Q Number bhejo
            if (typeof broadcastToMobiles === 'function') {
                broadcastToMobiles({ 
                    type: 'reset_ui', 
                    currentQ: currentIndex + 1, 
                    totalQ: questions.length 
                });
            }
        }

        function startTimer() {
            clearInterval(timerInterval);
            document.getElementById('timer-container').classList.remove('hidden');
            timeLeft = maxTimePerQuestion;
            updateTimerDisplay();
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

        function updateTimerDisplay() {
            document.getElementById('timer-text').innerText = `00:${timeLeft.toString().padStart(2, '0')}`;
        }

        function updateProgress() {
            const total = questions.length;
            const current = currentIndex + 1;
            document.getElementById('progress-text').innerText = `Question ${current} of ${total}`;
            document.getElementById('progress-bar').style.width = `${(current/total)*100}%`;
            document.getElementById('score-text').innerText = isExamMode ? "Exam Mode" : `Score: ${calculateScore()}`;
            document.getElementById('prev-btn').disabled = currentIndex === 0;
            document.getElementById('next-btn').innerText = (currentIndex === total - 1) ? "Finish Test" : "Next";
        }

        function nextOrFinish() {
            clearInterval(timerInterval);
            timerInterval = null;
            
            if (currentIndex < questions.length - 1) {
                currentIndex++;
                saveSession(); 
                
                // NAYA: Mid-Game Leaderboard ab sirf tabhi aayega jab 1 se zyada log connected honge
                if (Object.keys(multiPlayers).length > 1 && currentIndex % 5 === 0) {
                    showMidGameStandings();
                } else {
                    showQuestion();
                }
            } else {
                showResults();
            }
        }

        // NAYA: Mid-Game Standings Flash Screen Logic
        function showMidGameStandings() {
            const container = document.getElementById('mid-game-standings');
            const list = document.getElementById('mid-game-list');
            if(!container || !list) { showQuestion(); return; }

            list.innerHTML = '';
            
            // Score ke hisaab se sort karo
            const playersArray = Object.keys(multiPlayers).map(name => ({ name, score: multiPlayers[name].score }));
            playersArray.sort((a, b) => b.score - a.score);

            // Sirf Top 3 dikhao, Points hide rakho
            playersArray.slice(0, 3).forEach((p, i) => {
                const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉';
                const bg = i === 0 ? 'bg-purple-900/40 border-purple-500' : 'bg-slate-700/50 border-slate-600';
                
                list.innerHTML += `
                    <div class="${bg} border p-4 rounded-2xl flex justify-between items-center text-white font-bold text-xl transform transition-all hover:scale-105">
                        <div class="flex items-center gap-4">
                            <span class="text-3xl">${medal}</span>
                            <span>${p.name}</span>
                        </div>
                        <span class="text-xs bg-slate-800 px-2 py-1 rounded text-slate-400 uppercase tracking-widest">Top Rank</span>
                    </div>`;
            });

            container.classList.remove('hidden');
            
            // 5 Second ka Timer
            let timeLeft = 5;
            document.getElementById('mid-game-timer').innerText = timeLeft;
            
            const countInt = setInterval(() => {
                timeLeft--;
                document.getElementById('mid-game-timer').innerText = timeLeft;
                if(timeLeft <= 0) {
                    clearInterval(countInt);
                    container.classList.add('hidden');
                    showQuestion(); // 5 second baad agla sawaal dikhao
                }
            }, 1000);
        }

        function prevQuestion() {
            clearInterval(timerInterval);
            timerInterval = null;
            if (currentIndex > 0) {
                currentIndex--;
                saveSession(); 
                showQuestion();
            }
        }

        function showResults() {
            quizActive = false; 
            clearSession(); 
            clearInterval(timerInterval);
            
            const endTime = Date.now();
            const timeDiff = (endTime - quizStartTime) / 1000; 
            
            const minutes = Math.floor(timeDiff / 60);
            const seconds = Math.floor(timeDiff % 60);
            document.getElementById('final-time').innerText = `${minutes}m ${seconds}s`;

            const avgTime = questions.length > 0 ? (timeDiff / questions.length).toFixed(1) : 0;
            document.getElementById('final-avg-time').innerText = `${avgTime}s`;

            score = calculateScore();
            document.getElementById('final-total').innerText = questions.length;
            document.getElementById('final-correct').innerText = score;
            const attempted = Object.keys(userResponses).filter(k => userResponses[k] !== 'TIMED_OUT').length;
            document.getElementById('final-attempted').innerText = attempted;
            document.getElementById('final-accuracy').innerText = `${Math.round((score/questions.length)*100)}%`;
            
            document.getElementById('practice-wrong-btn').classList.toggle('hidden', score === questions.length);
            // Agar multiplayer mode chal raha tha, toh leaderboard dikhao
            if (Object.keys(multiPlayers).length > 0) {
                showLeaderboard();
            }
            showView('result-view');
            confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
        }

        function saveAndStart() {
            const name = document.getElementById('test-name').value.trim() || "Untitled";
            const content = document.getElementById('combined-input').value.trim();
            // Naya: Check selected folder
            const selectedFolderId = document.getElementById('folder-select').value || null;
            
            isExamMode = document.getElementById('exam-toggle').checked;
            isShuffleMode = document.getElementById('shuffle-toggle').checked;
            isPaletteEnabled = document.getElementById('palette-toggle').checked; 
            
            const isTimerEnabled = document.getElementById('timer-toggle').checked;
            maxTimePerQuestion = isTimerEnabled ? (parseInt(document.getElementById('timer-setting').value) || 30) : 0;

            if (!content) return;
            const parsed = parseAsteriskFormat(content);
            if (parsed.length === 0) { alert("Format Error!"); return; }
            
            const lib = JSON.parse(localStorage.getItem('mcq_hub_library') || '[]');
            // Naya: Saving with folderId
            lib.push({ 
                id: Date.now(), 
                name, 
                content, 
                qCount: parsed.length, 
                timerPref: maxTimePerQuestion,
                folderId: selectedFolderId 
            });
            localStorage.setItem('mcq_hub_library', JSON.stringify(lib));
            
            loadLibrary();
            startQuiz(parsed, name);
        }

        function loadTestFromLibrary(id) {
            const lib = JSON.parse(localStorage.getItem('mcq_hub_library') || '[]');
            const item = lib.find(i => i.id === id);
            if (item) {
                isExamMode = document.getElementById('exam-toggle').checked;
                isShuffleMode = document.getElementById('shuffle-toggle').checked;
                isPaletteEnabled = document.getElementById('palette-toggle').checked; 
                
                const isTimerEnabled = document.getElementById('timer-toggle').checked;
                maxTimePerQuestion = isTimerEnabled ? (parseInt(document.getElementById('timer-setting').value) || 30) : 0;
                
                startQuiz(parseAsteriskFormat(item.content), item.name);
            }
        }

        function parseAsteriskFormat(text) {
            const blocks = text.trim().split(/\n\s*(?=\d+\.)/);
            return blocks.filter(b => b.trim().length > 5).map((block, idx) => {
                const numMatch = block.match(/^(\d+)\./);
                const originalNumber = numMatch ? numMatch[1] : (idx + 1);

                let qText = "";
                const qMatch = block.match(/<Q>([\s\S]*?)<\/Q>/i);
                
                if (qMatch) {
                    qText = qMatch[1].trim();
                } else {
                    const lines = block.split('\n').map(l => l.trim()).filter(l => l !== "");
                    if (lines.length === 0) return null;
                    qText = lines[0].replace(/^\d+\.\s*/, '').trim();
                }

                let optionsBlock = block;
                const aMatch = block.match(/<A>([\s\S]*?)<\/A>/i);
                if (aMatch) optionsBlock = aMatch[1]; 

                const optMatch = optionsBlock.match(/\*?\([a-d]\)[\s\S]*?(?=\*?\([a-d]\)|$)/g);
                let correctLabel = '';
                const options = optMatch ? optMatch.map(optStr => {
                    const isCorrect = optStr.includes('*');
                    const labelMatch = optStr.match(/\*?\(([a-d])\)/);
                    const label = labelMatch ? labelMatch[1] : '';
                    if (isCorrect) correctLabel = label;
                    return { label, text: optStr.replace(/\*?\([a-d]\)\s*/, '').trim() };
                }) : [];

                if (!qText || options.length === 0) return null;

                return { id: idx, originalNumber, text: qText, options, correctAnswer: correctLabel };
            }).filter(q => q !== null);
        }

        function loadLibrary() {
            const listEl = document.getElementById('library-list');
            const searchVal = document.getElementById('library-search').value.toLowerCase();
            
            const savedFolders = JSON.parse(localStorage.getItem('mcq_hub_folders') || '[]');
            const savedData = JSON.parse(localStorage.getItem('mcq_hub_library') || '[]');
            
            const currentSessionJson = localStorage.getItem('mcq_hub_current_session');
            let htmlContent = '';
            
            // Header for current folder
            const folderHeaderEl = document.getElementById('current-folder-header');
            if (activeFolderId && !searchVal) {
                folderHeaderEl.classList.remove('hidden');
                const currFolder = savedFolders.find(f => f.id === activeFolderId);
                document.getElementById('current-folder-name').innerText = currFolder ? currFolder.name : "Unknown";
            } else {
                folderHeaderEl.classList.add('hidden');
            }

            // Session UI logic
            if (currentSessionJson && !searchVal) {
                try {
                    const sessionData = JSON.parse(currentSessionJson);
                    const progress = Math.round(((sessionData.currentIndex) / sessionData.questions.length) * 100);
                    
                    htmlContent += `
                    <div onclick="resumeSession()" class="mb-6 group w-full bg-white dark:bg-slate-900 rounded-2xl p-5 border-2 border-green-100 dark:border-green-900/30 hover:border-green-500 dark:hover:border-green-500 transition-all shadow-md hover:shadow-xl cursor-pointer relative overflow-hidden transform hover:-translate-y-1">
                        <div class="flex justify-between items-start mb-3">
                            <div>
                                <p class="text-[10px] font-black tracking-widest text-green-600 dark:text-green-400 uppercase mb-1 flex items-center gap-1">
                                    <span class="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                                    CONTINUE PROGRESS
                                </p>
                                <h3 class="font-bold text-slate-800 dark:text-slate-100 text-sm md:text-base truncate w-48 md:w-56 leading-tight">${sessionData.originalChapterName}</h3>
                            </div>
                            <div class="bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 p-2 rounded-xl group-hover:scale-110 group-hover:bg-green-500 group-hover:text-white transition-all duration-300 shadow-sm">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                            </div>
                        </div>
                        <div class="space-y-1.5">
                            <div class="flex justify-between text-xs font-bold text-slate-500 dark:text-slate-400 font-mono">
                                <span>Question ${sessionData.currentIndex + 1} / ${sessionData.questions.length}</span>
                                <span class="text-green-600 dark:text-green-400">${progress}% Done</span>
                            </div>
                            <div class="w-full bg-slate-100 dark:bg-slate-800 h-2.5 rounded-full overflow-hidden border border-slate-100 dark:border-slate-700">
                                <div class="bg-gradient-to-r from-green-400 to-green-600 h-full rounded-full transition-all duration-1000 ease-out shadow-[0_0_10px_rgba(34,197,94,0.5)] shadow-lg shadow-green-500/50" style="width: ${progress}%"></div>
                            </div>
                        </div>
                    </div>
                    <div class="h-px bg-slate-100 dark:bg-slate-800 w-full mb-4"></div>
                    `;
                } catch(e) {
                    console.error("Error parsing session data", e);
                }
            }
            
            listEl.innerHTML = htmlContent;

            // RENDER FOLDERS (Only if not in a folder OR if searching)
            let drawnFoldersCount = 0;
            if (!activeFolderId || searchVal) {
                const filteredFolders = savedFolders.filter(f => f.name.toLowerCase().includes(searchVal));
                drawnFoldersCount = filteredFolders.length;
                
                filteredFolders.forEach(f => {
                    const div = document.createElement('div');
                    div.className = "flex justify-between items-center p-3 bg-primary-50 dark:bg-primary-900/10 rounded-xl border border-primary-100 dark:border-primary-800 cursor-pointer hover:bg-primary-100 dark:hover:bg-primary-900/30 transition-colors";
                    div.innerHTML = `
                        <div onclick="openFolder('${f.id}', '${f.name.replace(/'/g, "\\'")}')" class="flex-1 flex items-center gap-3">
                            <span class="text-2xl">📁</span>
                            <div>
                                <p class="font-bold text-sm text-primary-900 dark:text-primary-100">${f.name}</p>
                                <p class="text-[10px] text-primary-600 dark:text-primary-400 font-medium">Folder</p>
                            </div>
                        </div>
                        <button onclick="deleteFolder(event, '${f.id}')" class="text-slate-300 hover:text-red-500 p-2">🗑️</button>
                    `;
                    listEl.appendChild(div);
                });
            }

            // RENDER QUIZZES
            const filteredQuizzes = savedData.filter(i => {
                const matchesSearch = i.name.toLowerCase().includes(searchVal);
                // Agar search kar rahe hain, to saare folder ki files dikhao.
                // Warna sirf active folder ke matching files dikhao.
                const matchesFolder = searchVal ? true : (i.folderId || null) == activeFolderId;
                return matchesSearch && matchesFolder;
            });
            
            [...filteredQuizzes].reverse().forEach(item => {
                const div = document.createElement('div');
                div.className = "flex justify-between items-center p-3 bg-white dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-700 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors";
                
                // Show folder name if searching and item is in a folder
                let folderBadge = '';
                if(searchVal && item.folderId) {
                    const fName = savedFolders.find(f=>f.id === item.folderId)?.name || 'Unknown';
                    folderBadge = `<span class="bg-primary-100 text-primary-700 dark:bg-primary-900/50 dark:text-primary-300 px-1.5 py-0.5 rounded text-[8px] uppercase ml-2">${fName}</span>`;
                }

                div.innerHTML = `
                    <div onclick="loadTestFromLibrary(${item.id})" class="flex-1">
                        <p class="font-bold text-sm flex items-center">${item.name} ${folderBadge}</p>
                        <p class="text-[10px] text-slate-400 mt-0.5">📄 ${item.qCount} Questions</p>
                    </div>
                    <button onclick="deleteLibItem(event, ${item.id})" class="text-slate-300 hover:text-red-500 p-2">🗑️</button>
                `;
                listEl.appendChild(div);
            });
            
            // Empty State
            if (drawnFoldersCount === 0 && filteredQuizzes.length === 0 && !htmlContent) {
                listEl.innerHTML += `<div class="text-center p-6 text-slate-400"><p class="text-3xl mb-2">📭</p><p class="text-sm font-medium">Nothing found</p></div>`;
            }
        }

        function deleteLibItem(e, id) {
            e.stopPropagation();
            if(confirm("Delete this test?")) {
                let lib = JSON.parse(localStorage.getItem('mcq_hub_library') || '[]');
                lib = lib.filter(i => i.id !== id);
                localStorage.setItem('mcq_hub_library', JSON.stringify(lib));
                loadLibrary();
            }
        }

        function toggleHowItWorks() { document.getElementById('how-it-works-box').classList.toggle('hidden'); }
        function toggleDarkMode() {
            const isDark = document.documentElement.classList.toggle('dark');
            localStorage.setItem('mcq_hub_theme', isDark ? 'dark' : 'light');
            document.getElementById('theme-icon-sun').classList.toggle('hidden', !isDark);
            document.getElementById('theme-icon-moon').classList.toggle('hidden', isDark);
        }
        if (localStorage.getItem('mcq_hub_theme') === 'dark') {
            document.documentElement.classList.add('dark');
            document.getElementById('theme-icon-sun').classList.remove('hidden');
            document.getElementById('theme-icon-moon').classList.add('hidden');
        }

        function scrollToLibrary() {
            document.getElementById('sidebar').scrollIntoView({ behavior: 'smooth' });
        }

        function toggleFullScreen() {
            if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen().catch(err => {
                    alert(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`);
                });
            } else {
                if (document.exitFullscreen) {
                    document.exitFullscreen();
                }
            }
        }

        document.addEventListener('fullscreenchange', () => {
            const isFS = !!document.fullscreenElement;
            document.getElementById('fs-icon-enter').classList.toggle('hidden', isFS);
            document.getElementById('fs-icon-exit').classList.toggle('hidden', !isFS);
        });
        
        function copyAIPrompt() {
            const txt = `Act as an expert Educational Content Formatter. I am preparing for competitive exams (like NTA CBT) and need your help to format my raw notes, questions, and texts into a VERY STRICT MCQ format for my custom application.

⚠️ STRICT RULES (Do not deviate):
1. QUESTION NUMBER: Start every question with a number and a dot (e.g., "1. ").
2. THE <Q> TAG (CRITICAL): The ENTIRE question text MUST be enclosed perfectly inside <Q> and </Q> tags. 
   - If there are multiple paragraphs, Assertion-Reason statements, or Case Studies, ALL of them go inside these tags.
3. TABLES & MATCHING: If the data requires a table (like Match the Following), convert it into a clean, simple HTML <table> inside the <Q> and </Q> tags. Use standard <tr>, <th>, and <td> tags.
4. OPTIONS PLACEMENT (CRITICAL): Exactly four options (a), (b), (c), (d) MUST be placed inside <A> and </A> tags below the </Q> tag. Each on a new line.
5. CORRECT ANSWER: Place an asterisk (*) EXACTLY before the correct option's bracket. Example: *(b) Correct Answer
6. NO EXTRA CHAT: Output ONLY the formatted MCQs. Do not say "Here are your questions" or add any explanations. Just give me the pure text in a code block so I can copy-paste it directly.

EXAMPLE 1 (Standard):
1. <Q> Which of the following is the largest planet in our solar system? </Q>
<A>
(a) Earth
*(b) Jupiter
(c) Saturn
(d) Mars
</A>

EXAMPLE 2 (Assertion & Reason):
2. <Q> Assertion (A): Plant cells have a cell wall.
Reason (R): The cell wall provides structural support and protection. </Q>
<A>
*(a) Both A and R are true, and R is the correct explanation of A
(b) Both A and R are true, but R is not the correct explanation of A
(c) A is true, but R is false
(d) A is false, but R is true
</A>

EXAMPLE 3 (Match the Following / Table):
3. <Q> Match the items in List I with List II:
<table>
  <tr><th>List I (Theories)</th><th>List II (Propounders)</th></tr>
  <tr><td>A. Classical Conditioning</td><td>I. Albert Bandura</td></tr>
  <tr><td>B. Operant Conditioning</td><td>II. Ivan Pavlov</td></tr>
</table>
Choose the correct option: </Q>
<A>
(a) A-1, B-2
*(b) A-2, B-2
(c) A-2, B-2
(d) A-1, B-1
</A>

Please format the following raw text strictly according to these rules:`;
            
            const textArea = document.createElement("textarea");
            textArea.value = txt;
            textArea.style.position = "fixed";
            textArea.style.left = "-9999px";
            document.body.appendChild(textArea);
            textArea.select();
            
            try {
                document.execCommand('copy');
                const btn = document.getElementById('copy-prompt-btn');
                btn.innerText = "✅ Copied!";
                setTimeout(() => btn.innerText = "📋 Copy AI Prompt", 2000);
            } catch (err) {
                alert("Failed to copy automatically. Please manually copy the prompt.");
            }
            document.body.removeChild(textArea);
        }

        function showToast(message) {
            const toast = document.getElementById('toast-notification');
            const text = document.getElementById('toast-text');
            text.innerText = message;
            
            toast.classList.remove('opacity-0');
            toast.classList.add('opacity-100');
            
            setTimeout(() => {
                toast.classList.remove('opacity-100');
                toast.classList.add('opacity-0');
            }, 3000); 
        }

        function askAI() {
            if (!questions || questions.length === 0 || !questions[currentIndex]) return;
            
            const q = questions[currentIndex];
            const optionsText = q.options.map(o => `(${o.label}) ${o.text}`).join('\n');
            
            const prompt = `Act as an expert exam-oriented teacher.

Explain the following MCQ in a clear, structured, step-by-step manner using simple Hinglish.
Focus on concept clarity, option elimination, and exam retention.

Step 1: Decode the question  
– Question ko simple Hinglish mein samjhao  
– Identify karo:
  • Topic / chapter
  • Question ka level (conceptual / factual / application)

Step 2: Core concept / background recall  
– Is question se related main theory / principle / rule explain karo  
– Agar relevant ho to scientist / psychologist / theorist ka naam mention karo  
– Sirf exam-useful background do (extra bookish explanation avoid karo)

Step 3: Option-wise analysis  
Har option (a, b, c, d) ko alag-alag analyse karo  
– Har option ke liye batao:
  ✔ kyun correct ho sakta hai  
  ❌ kyun incorrect hai  
– 3–4 lines mein:
  • Concept clear karo  
  • Common confusion address karo  
– MCQ elimination logic bhi apply karo

Step 4: Final answer  
– Correct option clearly mention karo  
– Ek short one-line reason do (easy exam recall ke liye)

Step 5: Retention & exam tips  
– Agar concept frequently asked ho, mention karo  
– Agar koi tricky term ho, short definition add karo  
– Ek quick exam tip do jo yaad reh sake

Now explain this MCQ:

Question:
${q.text}

Options:
${optionsText}`;

            const textArea = document.createElement("textarea");
            textArea.value = prompt;
            textArea.style.position = "fixed";
            textArea.style.left = "-9999px";
            document.body.appendChild(textArea);
            textArea.select();
            
            try {
                document.execCommand('copy');
                showToast("✅ Prompt Copied!");
            } catch (err) {
                showToast("❌ Failed to copy. Please copy manually.");
            }
            document.body.removeChild(textArea);
        }

        function startWrongQuestionsPractice() {
            const wrong = questions.filter((q, i) => userResponses[i] !== q.correctAnswer);
            isExamMode = false;
            
            // NAYA: Remote mode mein practice round shuru hone se pehle purana score aur streak 0 kar do
            if(typeof multiPlayers !== 'undefined') {
                Object.keys(multiPlayers).forEach(p => {
                    multiPlayers[p].score = 0;
                    multiPlayers[p].streak = 0;
                    multiPlayers[p].maxStreak = 0;
                });
            }

            startQuiz(wrong, `${originalChapterName} (Mistakes)`);
        }
        function showReviewScreen() {
            const container = document.getElementById('review-container');
            container.innerHTML = '';
            questions.forEach((q, idx) => {
                const pick = userResponses[idx];
                const isCorrect = pick === q.correctAnswer;
                const card = document.createElement('div');
                card.className = `p-6 rounded-2xl border-l-8 bg-white dark:bg-slate-900 shadow-md ${isCorrect ? 'border-green-500' : 'border-red-500'}`;
                const opts = q.options.map(o => {
                    let style = "text-slate-500";
                    let icon = "";
                    if(o.label === q.correctAnswer) { style = "text-green-600 font-bold"; icon = "✅ "; }
                    else if(o.label === pick && !isCorrect) { style = "text-red-600 font-bold"; icon = "❌ "; }
                    return `<div class="text-sm py-1.5 px-2 rounded ${style}">${icon}${o.label}. ${o.text}</div>`;
                }).join('');
                card.innerHTML = `<div class="mb-3 flex justify-between"><p class="font-bold text-lg">Q${q.originalNumber}. ${q.text}</p></div><div class="space-y-1">${opts}</div>`;
                container.appendChild(card);
            });
            showView('review-view');
        }

        function hideReviewScreen() { showView('result-view'); }
        
        function exitToSetup() { 
            if (quizActive) {
                const confirmExit = confirm("⚠️ Are you sure you want to exit?\n\nYour progress will be lost.");
                if (!confirmExit) return; 
            }

            clearSession(); 
            quizActive = false; 
            clearInterval(timerInterval); 
            if(autoShiftTimeout) clearTimeout(autoShiftTimeout);

            // NAYA: Connection zinda rakhne ke liye scores 0 kar do
            if(typeof multiPlayers !== 'undefined') {
                Object.keys(multiPlayers).forEach(p => {
                    multiPlayers[p].score = 0;
                    multiPlayers[p].streak = 0;
                    multiPlayers[p].maxStreak = 0;
                });
            }

            // NAYA: Mobiles ko 'Waiting Room' mein bhej do
            if (typeof broadcastToMobiles === 'function') {
                broadcastToMobiles({ type: 'waiting_room' });
            }

            showView('setup-view'); // FIX: location.reload() hata diya
        }

        function saveSession() {
            if (!quizActive) return;
            const sessionData = {
                questions,
                originalChapterName,
                currentIndex,
                score,
                userResponses,
                maxTimePerQuestion,
                isExamMode,
                isShuffleMode,
                isPaletteEnabled,
                elapsedTimeOffset: Date.now() - quizStartTime 
            };
            localStorage.setItem('mcq_hub_current_session', JSON.stringify(sessionData));
        }

        function clearSession() {
            localStorage.removeItem('mcq_hub_current_session');
        }

        function saveSettingsToStorage() {
            const settings = {
                exam: document.getElementById('exam-toggle').checked,
                shuffle: document.getElementById('shuffle-toggle').checked,
                palette: document.getElementById('palette-toggle').checked,
                timer: document.getElementById('timer-toggle').checked,
                timerVal: document.getElementById('timer-setting').value,
                remote: document.getElementById('remote-toggle').checked // NAYI LINE
            };
            localStorage.setItem('mcq_hub_settings_pref', JSON.stringify(settings));
        }

        function loadSettingsFromStorage() {
            const saved = localStorage.getItem('mcq_hub_settings_pref');
            if (saved) {
                try {
                    const s = JSON.parse(saved);
                    if(document.getElementById('exam-toggle')) document.getElementById('exam-toggle').checked = s.exam;
                    if(document.getElementById('shuffle-toggle')) document.getElementById('shuffle-toggle').checked = s.shuffle;
                    if(document.getElementById('palette-toggle')) document.getElementById('palette-toggle').checked = s.palette;
                    if(document.getElementById('timer-toggle')) document.getElementById('timer-toggle').checked = s.timer;
                    if(document.getElementById('timer-setting')) document.getElementById('timer-setting').value = s.timerVal || 30;
                    if(document.getElementById('remote-toggle') && s.remote !== undefined) document.getElementById('remote-toggle').checked = s.remote; // NAYI LINE
                } catch(e) {
                    console.error("Error loading settings", e);
                }
            }
        }

        function resumeSession() {
            const saved = localStorage.getItem('mcq_hub_current_session');
            if (saved) {
                const data = JSON.parse(saved);
                
                questions = data.questions;
                originalChapterName = data.originalChapterName;
                currentIndex = data.currentIndex;
                score = data.score;
                userResponses = data.userResponses;
                maxTimePerQuestion = data.maxTimePerQuestion;
                isExamMode = data.isExamMode;
                isShuffleMode = data.isShuffleMode;
                isPaletteEnabled = data.isPaletteEnabled;
                
                quizStartTime = Date.now() - data.elapsedTimeOffset;

                quizActive = true;
                history.pushState(null, document.title, location.href);

                document.getElementById('current-chapter-name').innerText = originalChapterName;
                
                if (isPaletteEnabled) document.getElementById('open-palette-btn').classList.remove('hidden');
                else document.getElementById('open-palette-btn').classList.add('hidden');

                showView('quiz-view');
                showQuestion();
            }
        }

        document.addEventListener('keydown', (e) => {
            if (document.getElementById('quiz-view').classList.contains('hidden')) return;
            const k = e.key.toLowerCase();
            const btns = document.querySelectorAll('#options-container button');
            if(['1','a'].includes(k) && btns[0] && !btns[0].disabled) btns[0].click();
            if(['2','b'].includes(k) && btns[1] && !btns[1].disabled) btns[1].click();
            if(['3','c'].includes(k) && btns[2] && !btns[2].disabled) btns[2].click();
            if(['4','d'].includes(k) && btns[3] && !btns[3].disabled) btns[3].click();
            if(k === 'e') askAI();
            
            if(k === 'enter') {
                e.preventDefault(); // Browser ke default click ko rokta hai taaki double skip na ho
                nextOrFinish();
            }
            if(k === 'backspace') prevQuestion();
        });

        // Naya Feature: Right click se next question par jana
        document.addEventListener('contextmenu', (e) => {
            if (!document.getElementById('quiz-view').classList.contains('hidden')) {
                e.preventDefault(); // Default menu ko block karta hai
                nextOrFinish();
            }
        });