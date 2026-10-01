(function(){
  const QUESTIONS = [
    { q: "Which planet has the shortest day of all the planets in our solar system?", options: ["Mercury","Jupiter","Earth","Mars"], correct: 1 },
    { q: "In what year did the Berlin Wall fall?", options: ["1987","1991","1989","1993"], correct: 2 },
    { q: "What is the smallest prime number?", options: ["0","1","2","3"], correct: 2 },
    { q: "Which element has the chemical symbol 'Fe'?", options: ["Fluorine","Iron","Francium","Lead"], correct: 1 },
    { q: "Who wrote the novel '1984'?", options: ["Aldous Huxley","Ray Bradbury","George Orwell","H.G. Wells"], correct: 2 },
    { q: "What is the capital city of Australia?", options: ["Sydney","Melbourne","Canberra","Perth"], correct: 2 },
    { q: "Which ocean is the largest by surface area?", options: ["Atlantic","Indian","Arctic","Pacific"], correct: 3 },
    { q: "How many strings does a standard violin have?", options: ["4","5","6","3"], correct: 0 },
    { q: "Which language has the most native speakers worldwide?", options: ["English","Hindi","Spanish","Mandarin Chinese"], correct: 3 },
    { q: "What is the hardest natural substance on Earth?", options: ["Quartz","Diamond","Titanium","Granite"], correct: 1 }
  ];

  const TIME_PER_Q = 15;
  const LETTERS = ["A","B","C","D"];

  // ---------- Storage keys ----------
  const USERS_KEY = 'splitsecond_users';
  const SESSION_KEY = 'splitsecond_session';
  const HISTORY_PREFIX = 'splitsecond_history_';
  const MAX_HISTORY_ENTRIES = 20;

  let current = 0;
  let score = 0;
  let timeLeft = TIME_PER_Q;
  let timerId = null;
  let locked = false;
  let answerLog = []; // {question, chosen, correct, timedOut}
  let currentUser = null; // null = guest

  const authScreen = document.getElementById('authScreen');
  const startScreen = document.getElementById('startScreen');
  const quizScreen = document.getElementById('quizScreen');
  const endScreen = document.getElementById('endScreen');
  const startBtn = document.getElementById('startBtn');
  const restartBtn = document.getElementById('restartBtn');
  const nextBtn = document.getElementById('nextBtn');
  const flapRow = document.getElementById('flapRow');
  const progress = document.getElementById('progress');
  const qEyebrow = document.getElementById('qEyebrow');
  const qText = document.getElementById('qText');
  const optionsEl = document.getElementById('options');
  const scoreTick = document.getElementById('scoreTick');
  const roundLabel = document.getElementById('roundLabel');
  const personalBest = document.getElementById('personalBest');
  const historyBlock = document.getElementById('historyBlock');
  const historyList = document.getElementById('historyList');
  const userChip = document.getElementById('userChip');
  const userChipName = document.getElementById('userChipName');
  const logoutBtn = document.getElementById('logoutBtn');
  const tabLogin = document.getElementById('tabLogin');
  const tabSignup = document.getElementById('tabSignup');
  const loginForm = document.getElementById('loginForm');
  const signupForm = document.getElementById('signupForm');
  const loginError = document.getElementById('loginError');
  const signupError = document.getElementById('signupError');
  const guestBtn = document.getElementById('guestBtn');

  // ---------- Local-storage helpers ----------
  // NOTE: this is a client-only demo. Passwords are lightly obfuscated (not
  // securely hashed) and everything lives in the browser's localStorage on
  // this device. Don't reuse a real password here — wire up a real backend
  // for anything that needs actual account security.
  function hashPassword(pw){
    let hash = 5381;
    for(let i=0;i<pw.length;i++){
      hash = ((hash << 5) + hash) + pw.charCodeAt(i);
      hash = hash & hash;
    }
    return String(hash);
  }

  function getUsers(){
    try{
      return JSON.parse(localStorage.getItem(USERS_KEY)) || {};
    }catch(e){ return {}; }
  }

  function saveUsers(users){
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  }

  function getHistory(username){
    try{
      return JSON.parse(localStorage.getItem(HISTORY_PREFIX + username)) || [];
    }catch(e){ return []; }
  }

  function saveRun(username, runScore, total){
    const list = getHistory(username);
    list.unshift({ date: new Date().toISOString(), score: runScore, total: total });
    localStorage.setItem(HISTORY_PREFIX + username, JSON.stringify(list.slice(0, MAX_HISTORY_ENTRIES)));
  }

  function getBest(username){
    const list = getHistory(username);
    if(list.length === 0) return null;
    return list.reduce((best, r) => r.score > best.score ? r : best, list[0]);
  }

  function formatDate(iso){
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month:'short', day:'numeric' }) + ' ' +
           d.toLocaleTimeString(undefined, { hour:'2-digit', minute:'2-digit' });
  }

  function buildFlaps(){
    flapRow.innerHTML = '';
    const str = String(TIME_PER_Q).padStart(2,'0');
    for(let i=0;i<str.length;i++){
      const flap = document.createElement('div');
      flap.className = 'flap';
      const digit = document.createElement('div');
      digit.className = 'digit';
      digit.textContent = str[i];
      flap.appendChild(digit);
      flapRow.appendChild(flap);
    }
  }

  function updateFlaps(val){
    const str = String(val).padStart(2,'0');
    const flaps = flapRow.querySelectorAll('.flap');
    flaps.forEach((flap, i) => {
      const digit = flap.querySelector('.digit');
      if(digit.textContent !== str[i]){
        flap.classList.add('flip');
        setTimeout(() => { digit.textContent = str[i]; }, 175);
        setTimeout(() => { flap.classList.remove('flip'); }, 350);
      }
      flap.classList.toggle('urgent', val <= 5);
    });
  }

  function buildProgress(){
    progress.innerHTML = '';
    for(let i=0;i<QUESTIONS.length;i++){
      const dot = document.createElement('div');
      dot.className = 'dot';
      progress.appendChild(dot);
    }
  }

  function updateProgress(){
    const dots = progress.querySelectorAll('.dot');
    dots.forEach((dot, i) => {
      dot.classList.toggle('done', i < current);
      dot.classList.toggle('current', i === current);
    });
  }

  function renderQuestion(){
    locked = false;
    timeLeft = TIME_PER_Q;
    updateFlaps(timeLeft);
    updateProgress();

    const item = QUESTIONS[current];
    qEyebrow.textContent = `QUESTION ${current + 1} OF ${QUESTIONS.length}`;
    qText.textContent = item.q;
    scoreTick.textContent = score;
    roundLabel.textContent = `ROUND ${current + 1}/${QUESTIONS.length}`;

    optionsEl.innerHTML = '';
    item.options.forEach((opt, i) => {
      const btn = document.createElement('button');
      btn.className = 'opt';
      btn.innerHTML = `<span class="key">${LETTERS[i]}</span><span>${opt}</span>`;
      btn.addEventListener('click', () => selectAnswer(i));
      optionsEl.appendChild(btn);
    });

    nextBtn.classList.remove('ready');

    clearInterval(timerId);
    timerId = setInterval(tick, 1000);
  }

  function tick(){
    timeLeft -= 1;
    if(timeLeft < 0){
      clearInterval(timerId);
      if(!locked) selectAnswer(null, true);
      return;
    }
    updateFlaps(timeLeft);
  }

  function selectAnswer(idx, timedOut){
    if(locked) return;
    locked = true;
    clearInterval(timerId);

    const item = QUESTIONS[current];
    const opts = optionsEl.querySelectorAll('.opt');
    const isCorrect = idx === item.correct;
    if(isCorrect) score += 1;

    opts.forEach((btn, i) => {
      btn.disabled = true;
      if(i === item.correct){
        btn.classList.add('correct');
      } else if(i === idx){
        btn.classList.add('wrong');
      } else {
        btn.classList.add('dim');
      }
    });

    scoreTick.textContent = score;

    answerLog.push({
      question: item.q,
      chosenText: idx === null ? "No answer (time ran out)" : item.options[idx],
      correctText: item.options[item.correct],
      isCorrect: isCorrect,
      timedOut: !!timedOut
    });

    nextBtn.classList.add('ready');
  }

  function goNext(){
    current += 1;
    if(current >= QUESTIONS.length){
      showEnd();
    } else {
      renderQuestion();
    }
  }

  function showEnd(){
    quizScreen.classList.add('hidden');
    endScreen.classList.remove('hidden');
    roundLabel.textContent = 'COMPLETE';

    document.getElementById('resultScore').textContent = `${score}/${QUESTIONS.length}`;

    let grade;
    const pct = score / QUESTIONS.length;
    if(pct === 1) grade = "PERFECT RUN";
    else if(pct >= 0.8) grade = "LIGHTNING FAST";
    else if(pct >= 0.6) grade = "SOLID PACE";
    else if(pct >= 0.4) grade = "CUTTING IT CLOSE";
    else grade = "OUT OF TIME";
    document.getElementById('resultGrade').textContent = grade;

    const breakdown = document.getElementById('breakdown');
    breakdown.innerHTML = '';
    answerLog.forEach((h, i) => {
      const row = document.createElement('div');
      row.className = `b-row ${h.isCorrect ? 'ok' : 'no'}`;
      row.innerHTML = `<span class="mark">${h.isCorrect ? '✓' : '✕'}</span>` +
        `<span class="b-text"><strong>Q${i+1}.</strong> ${h.question}<br>` +
        (h.isCorrect ? `Answered: ${h.chosenText}` : `Your answer: ${h.chosenText} — Correct: ${h.correctText}`) +
        `</span>`;
      breakdown.appendChild(row);
    });

    if(currentUser){
      saveRun(currentUser, score, QUESTIONS.length);
      const runs = getHistory(currentUser);
      historyList.innerHTML = '';
      runs.slice(0, 5).forEach(r => {
        const row = document.createElement('div');
        row.className = 'history-row';
        row.innerHTML = `<span>${formatDate(r.date)}</span><b>${r.score}/${r.total}</b>`;
        historyList.appendChild(row);
      });
      historyBlock.classList.remove('hidden');
    } else {
      historyBlock.classList.add('hidden');
    }
  }

  function startQuiz(){
    current = 0;
    score = 0;
    answerLog = [];
    authScreen.classList.add('hidden');
    startScreen.classList.add('hidden');
    endScreen.classList.add('hidden');
    quizScreen.classList.remove('hidden');
    buildFlaps();
    buildProgress();
    renderQuestion();
  }

  function showStart(){
    authScreen.classList.add('hidden');
    endScreen.classList.add('hidden');
    quizScreen.classList.add('hidden');
    startScreen.classList.remove('hidden');
    roundLabel.textContent = '';

    if(currentUser){
      const best = getBest(currentUser);
      if(best){
        personalBest.innerHTML = `PERSONAL BEST&nbsp; <b>${best.score}/${best.total}</b>`;
        personalBest.classList.remove('hidden');
      } else {
        personalBest.classList.add('hidden');
      }
    } else {
      personalBest.classList.add('hidden');
    }
  }

  function showAuth(){
    startScreen.classList.add('hidden');
    quizScreen.classList.add('hidden');
    endScreen.classList.add('hidden');
    authScreen.classList.remove('hidden');
    loginError.textContent = '';
    signupError.textContent = '';
    loginForm.reset();
    signupForm.reset();
  }

  function setSignedInUI(){
    if(currentUser){
      userChip.classList.remove('hidden');
      userChipName.textContent = currentUser;
    } else {
      userChip.classList.add('hidden');
      userChipName.textContent = '';
    }
  }

  // ---------- Auth actions ----------
  function handleSignup(e){
    e.preventDefault();
    const username = document.getElementById('signupUsername').value.trim();
    const password = document.getElementById('signupPassword').value;

    if(username.length < 3){
      signupError.textContent = 'Username needs at least 3 characters.';
      return;
    }
    if(password.length < 4){
      signupError.textContent = 'Password needs at least 4 characters.';
      return;
    }
    const users = getUsers();
    if(users[username]){
      signupError.textContent = 'That username is already taken.';
      return;
    }
    users[username] = hashPassword(password);
    saveUsers(users);
    signupError.textContent = '';
    logIn(username);
  }

  function handleLogin(e){
    e.preventDefault();
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;
    const users = getUsers();

    if(!users[username] || users[username] !== hashPassword(password)){
      loginError.textContent = 'Wrong username or password.';
      return;
    }
    loginError.textContent = '';
    logIn(username);
  }

  function logIn(username){
    currentUser = username;
    localStorage.setItem(SESSION_KEY, username);
    setSignedInUI();
    showStart();
  }

  function logOut(){
    currentUser = null;
    localStorage.removeItem(SESSION_KEY);
    setSignedInUI();
    showAuth();
  }

  function continueAsGuest(){
    currentUser = null;
    localStorage.removeItem(SESSION_KEY);
    setSignedInUI();
    showStart();
  }

  tabLogin.addEventListener('click', () => {
    tabLogin.classList.add('active');
    tabSignup.classList.remove('active');
    loginForm.classList.remove('hidden');
    signupForm.classList.add('hidden');
  });
  tabSignup.addEventListener('click', () => {
    tabSignup.classList.add('active');
    tabLogin.classList.remove('active');
    signupForm.classList.remove('hidden');
    loginForm.classList.add('hidden');
  });

  loginForm.addEventListener('submit', handleLogin);
  signupForm.addEventListener('submit', handleSignup);
  guestBtn.addEventListener('click', continueAsGuest);
  logoutBtn.addEventListener('click', logOut);

  startBtn.addEventListener('click', startQuiz);
  restartBtn.addEventListener('click', showStart);
  nextBtn.addEventListener('click', () => {
    if(nextBtn.classList.contains('ready')) goNext();
  });

  document.addEventListener('keydown', (e) => {
    if(quizScreen.classList.contains('hidden')) return;
    if(locked && e.key === 'Enter'){ goNext(); return; }
    const idx = ['1','2','3','4'].indexOf(e.key);
    if(idx !== -1) selectAnswer(idx);
  });

  // ---------- Init: restore session if present ----------
  (function init(){
    const savedUser = localStorage.getItem(SESSION_KEY);
    const users = getUsers();
    if(savedUser && users[savedUser]){
      currentUser = savedUser;
      setSignedInUI();
      showStart();
    } else {
      localStorage.removeItem(SESSION_KEY);
      setSignedInUI();
      showAuth();
    }
  })();
})();
