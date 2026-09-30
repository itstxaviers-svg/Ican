const actions = [
  { word: "RUN", slug: "run", color: "#dff7ff", voice: "run" },
  { word: "JUMP", slug: "jump", color: "#fff0bd", voice: "jump" },
  { word: "COOK", slug: "cook", color: "#ffe0df", voice: "cook" },
  { word: "HIDE", slug: "hide", color: "#ede2ff", voice: "hide" },
  { word: "SWIM", slug: "swim", color: "#d9f4ff", voice: "swim" },
  { word: "STRETCH", slug: "stretch", color: "#e8f8d2", voice: "stretch" },
  { word: "CLIMB", slug: "climb", color: "#ffe6c8", voice: "climb" },
  { word: "FLY", slug: "fly", color: "#dfe7ff", voice: "fly" },
];

const modeInfo = {
  choose: {
    label: "FIND THE ACTION",
    finish: "Every phrase found! Your action vocabulary is powered up.",
  },
  memory: {
    label: "POWER PAIRS",
    finish: "All eight action-picture pairs are connected!",
  },
  verify: {
    label: "TRUE OR TRICK?",
    finish: "Great hero vision! You checked every phrase and picture.",
  },
};

const introScreen = document.querySelector("#intro-screen");
const setupScreen = document.querySelector("#setup-screen");
const playScreen = document.querySelector("#play-screen");
const finishScreen = document.querySelector("#finish-screen");
const setupBackButton = document.querySelector("#setup-back-button");
const setupStartButton = document.querySelector("#setup-start-button");
const setupTitle = document.querySelector("#setup-title");
const gameBackButton = document.querySelector("#game-back-button");
const replayButton = document.querySelector("#replay-button");
const homeButton = document.querySelector("#home-button");
const choicesElement = document.querySelector("#choices");
const missionPanel = document.querySelector(".mission-panel");
const missionHint = document.querySelector("#mission-hint");
const targetWordElement = document.querySelector("#target-word");
const roundNumberElement = document.querySelector("#round-number");
const roundTotalElement = document.querySelector("#round-total");
const modeLabel = document.querySelector("#mode-label");
const powerFill = document.querySelector("#power-fill");
const streakElement = document.querySelector("#streak");
const streakChip = document.querySelector("#streak-chip");
const feedback = document.querySelector("#feedback");
const feedbackIcon = document.querySelector("#feedback-icon");
const feedbackText = document.querySelector("#feedback-text");
const speakButton = document.querySelector("#speak-button");
const verifyVisual = document.querySelector("#verify-visual");
const verifyImage = document.querySelector("#verify-image");
const memoryDecision = document.querySelector("#memory-decision");
const confirmPairButton = document.querySelector("#confirm-pair-button");
const noMatchButton = document.querySelector("#no-match-button");
const fxLayer = document.querySelector("#fx-layer");
const heroLevel = document.querySelector("#hero-level");
const teamScoreboard = document.querySelector("#team-scoreboard");
const teamScoreElements = [
  document.querySelector("#team-1-score"),
  document.querySelector("#team-2-score"),
];

let currentMode = "choose";
let pendingMode = "choose";
let selectedPlayMode = "solo";
let selectedQuestionCount = 9;
let gamePlayMode = "solo";
let teamScores = [0, 0];
let activeTeam = 0;
let startingTeam = 0;
let deck = [];
let round = 0;
let score = 0;
let streak = 0;
let bestStreak = 0;
let correctCount = 0;
let soundOn = true;
let roundLocked = false;
let nextRoundTimer;
let memoryTimer;
let speechTimer;
let verifyIsMatch = true;
let shownVerifyAction = null;
let memoryOpen = [];
let memoryLocked = false;
let matchedPairs = 0;
let imageSetOffset = 0;
let currentSpokenAction = null;
let activeUtterance = null;
let speechRequestId = 0;
let audioContext = null;
const activeOscillators = new Set();

const phrasePlayer = new Audio();
phrasePlayer.preload = "auto";
phrasePlayer.volume = 1;

const speechClipPaths = new Map([
  ...actions.map((action) => [action.slug, `assets/audio/i-can-${action.slug}.mp3`]),
  ["mission-complete", "assets/audio/mission-complete.mp3"],
]);

// The clips are tiny, so warming the browser cache prevents a pause before each phrase.
const speechPreloads = [...speechClipPaths.values()].map((path) => {
  const audio = new Audio(path);
  audio.preload = "auto";
  audio.load();
  return audio;
});

const shuffle = (items) => {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

function buildQuestionDeck(questionCount) {
  const questionDeck = [];
  while (questionDeck.length < questionCount) {
    const batch = shuffle(actions);
    const previous = questionDeck[questionDeck.length - 1];
    if (previous && batch[0].word === previous.word) {
      const swapIndex = batch.findIndex((action) => action.word !== previous.word);
      [batch[0], batch[swapIndex]] = [batch[swapIndex], batch[0]];
    }
    questionDeck.push(...batch.slice(0, questionCount - questionDeck.length));
  }
  return questionDeck;
}

const getChoices = (answer) => {
  const distractors = shuffle(actions.filter((action) => action.word !== answer.word)).slice(0, 2);
  return shuffle([answer, ...distractors]);
};

const getActionImage = (action, setIndex = 0) =>
  `assets/actions/set${setIndex + 1}/${action.slug}.jpg`;

function setScreen(screen) {
  introScreen.hidden = screen !== "intro";
  setupScreen.hidden = screen !== "setup";
  playScreen.hidden = screen !== "play";
  finishScreen.hidden = screen !== "finish";
}

function setFeedback(type, icon, text) {
  feedback.className = `feedback${type ? ` ${type}` : ""}`;
  feedbackIcon.textContent = icon;
  feedbackText.textContent = text;
}

function selectEnglishVoice() {
  if (!("speechSynthesis" in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  const preferredNames = [
    "Samantha",
    "Ava",
    "Zoe",
    "Google US English",
    "Microsoft Aria Online (Natural) - English (United States)",
    "Daniel",
  ];
  for (const name of preferredNames) {
    const voice = voices.find((candidate) => candidate.name === name);
    if (voice) return voice;
  }
  return voices.find((voice) => voice.lang.toLowerCase() === "en-us")
    || voices.find((voice) => voice.lang.toLowerCase().startsWith("en"))
    || null;
}

function haltSpeechPlayback() {
  phrasePlayer.onerror = null;
  phrasePlayer.onplaying = null;
  phrasePlayer.onended = null;
  phrasePlayer.pause();
  phrasePlayer.currentTime = 0;
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  activeUtterance = null;
  speakButton.classList.remove("speaking");
}

function stopSpeech() {
  window.clearTimeout(speechTimer);
  speechRequestId += 1;
  haltSpeechPlayback();
}

function speakWithSystemVoice(text, requestId) {
  if (!("speechSynthesis" in window) || requestId !== speechRequestId) return;
  const utterance = new SpeechSynthesisUtterance(text);
  activeUtterance = utterance;
  utterance.lang = "en-US";
  utterance.voice = selectEnglishVoice();
  utterance.rate = 0.82;
  utterance.pitch = 1.02;
  utterance.volume = 1;
  utterance.onstart = () => {
    if (requestId === speechRequestId) speakButton.classList.add("speaking");
  };
  utterance.onend = () => {
    if (requestId !== speechRequestId) return;
    activeUtterance = null;
    speakButton.classList.remove("speaking");
  };
  utterance.onerror = utterance.onend;
  window.speechSynthesis.speak(utterance);
}

function playSpeech(clipKey, text, delay = 0) {
  stopSpeech();
  if (!soundOn) return;
  const requestId = speechRequestId;
  const startPlayback = () => {
    if (requestId !== speechRequestId) return;
    const clipPath = speechClipPaths.get(clipKey);
    let fallbackStarted = false;
    const useFallback = () => {
      if (fallbackStarted || requestId !== speechRequestId) return;
      fallbackStarted = true;
      phrasePlayer.pause();
      phrasePlayer.onerror = null;
      speakWithSystemVoice(text, requestId);
    };

    phrasePlayer.src = clipPath;
    phrasePlayer.currentTime = 0;
    phrasePlayer.onerror = useFallback;
    phrasePlayer.onplaying = () => {
      if (requestId === speechRequestId) speakButton.classList.add("speaking");
    };
    phrasePlayer.onended = () => {
      if (requestId === speechRequestId) speakButton.classList.remove("speaking");
    };
    const playPromise = phrasePlayer.play();
    if (playPromise) playPromise.catch(useFallback);
  };

  if (delay > 0) speechTimer = window.setTimeout(startPlayback, delay);
  else startPlayback();
}

function playActionPhrase(action, delay = 0) {
  if (!action) return;
  playSpeech(action.slug, `I can ${action.voice}`, delay);
}

function stopTones() {
  activeOscillators.forEach((oscillator) => {
    try {
      oscillator.stop();
    } catch (_) {
      // The oscillator may already have ended.
    }
  });
  activeOscillators.clear();
}

function stopAllAudio() {
  stopSpeech();
  stopTones();
}

function playTone(type) {
  if (!soundOn) return;
  stopTones();
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;
  if (!audioContext || audioContext.state === "closed") audioContext = new AudioContextClass();

  const scheduleNotes = () => {
    const notes = type === "good" ? [523.25, 659.25, 783.99] : [220, 185];
    notes.forEach((frequency, index) => {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      const startsAt = audioContext.currentTime + index * 0.08;
      oscillator.type = type === "good" ? "triangle" : "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, startsAt);
      gain.gain.exponentialRampToValueAtTime(type === "good" ? 0.065 : 0.045, startsAt + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, startsAt + 0.16);
      oscillator.connect(gain).connect(audioContext.destination);
      oscillator.addEventListener("ended", () => activeOscillators.delete(oscillator), { once: true });
      activeOscillators.add(oscillator);
      oscillator.start(startsAt);
      oscillator.stop(startsAt + 0.18);
    });
  };

  if (audioContext.state === "suspended") audioContext.resume().then(scheduleNotes).catch(() => {});
  else scheduleNotes();
}

function burstStars(element) {
  const rect = element.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const stars = ["★", "⚡", "✦", "★", "✹", "⚡"];
  stars.forEach((symbol, index) => {
    const particle = document.createElement("span");
    const angle = (Math.PI * 2 * index) / stars.length;
    particle.className = "star-particle";
    particle.textContent = symbol;
    particle.style.left = `${centerX}px`;
    particle.style.top = `${centerY}px`;
    particle.style.color = index % 2 ? "#ff4f57" : "#ffd72e";
    particle.style.setProperty("--x", `${Math.cos(angle) * (80 + Math.random() * 50)}px`);
    particle.style.setProperty("--y", `${Math.sin(angle) * (70 + Math.random() * 45)}px`);
    fxLayer.appendChild(particle);
    particle.addEventListener("animationend", () => particle.remove());
  });
}

function refreshSetupControls() {
  document.querySelectorAll("[data-play-mode]").forEach((button) => {
    const isSelected = button.dataset.playMode === selectedPlayMode;
    button.classList.toggle("is-selected", isSelected);
    button.setAttribute("aria-pressed", String(isSelected));
  });
  document.querySelectorAll("[data-question-count]").forEach((button) => {
    const isSelected = Number(button.dataset.questionCount) === selectedQuestionCount;
    button.classList.toggle("is-selected", isSelected);
    button.setAttribute("aria-pressed", String(isSelected));
  });
}

function openGameSetup(mode) {
  pendingMode = mode;
  setupTitle.textContent = modeInfo[mode].label;
  refreshSetupControls();
  setScreen("setup");
}

function updateTeamScoreboard() {
  const isTeamGame = gamePlayMode === "teams" && currentMode !== "memory";
  teamScoreboard.hidden = !isTeamGame;
  if (!isTeamGame) return;
  teamScoreElements.forEach((element, index) => {
    element.textContent = teamScores[index];
    element.closest(".team-score").classList.toggle("is-active", index === activeTeam);
  });
}

function awardTeamPoint() {
  if (gamePlayMode !== "teams") return;
  teamScores[activeTeam] += 1;
  updateTeamScoreboard();
}

function updateStatus() {
  const progress = currentMode === "memory" ? matchedPairs : round;
  const total = currentMode === "memory" ? actions.length : deck.length;
  streakElement.textContent = streak;
  powerFill.style.width = `${total ? (progress / total) * 100 : 0}%`;
  updateTeamScoreboard();
  if (score >= 750) heroLevel.textContent = "SUPER HERO";
  else if (score >= 400) heroLevel.textContent = "HERO";
  else if (score >= 140) heroLevel.textContent = "RISING STAR";
  else heroLevel.textContent = "SIDEKICK";
}

function popStreak() {
  streakChip.classList.add("pop");
  window.setTimeout(() => streakChip.classList.remove("pop"), 220);
}

function preparePlayArea() {
  stopSpeech();
  playScreen.classList.remove("memory-mode");
  playScreen.classList.remove("verify-mode");
  missionPanel.hidden = false;
  missionPanel.classList.remove("audio-mode");
  missionHint.textContent = "Find the action!";
  verifyVisual.hidden = true;
  speakButton.hidden = false;
  memoryDecision.hidden = true;
  confirmPairButton.disabled = false;
  noMatchButton.disabled = false;
  choicesElement.className = "choices";
  choicesElement.replaceChildren();
  setFeedback("", "", "Choose your hero move!");
}

function renderChooseRound() {
  roundLocked = false;
  activeTeam = (startingTeam + round) % 2;
  preparePlayArea();
  const answer = deck[round];
  currentSpokenAction = answer;
  const visualSet = (round + imageSetOffset) % 2;
  modeLabel.textContent = modeInfo.choose.label;
  roundNumberElement.textContent = round + 1;
  targetWordElement.textContent = answer.word;
  getChoices(answer).forEach((action, index) => {
    const button = document.createElement("button");
    button.className = "action-card";
    button.type = "button";
    button.style.setProperty("--card-color", action.color);
    button.style.setProperty("--emoji-tilt", `${index % 2 ? 3 : -3}deg`);
    button.setAttribute("aria-label", action.word.toLowerCase());
    button.innerHTML = `
      <span class="choice-number">${index + 1}</span>
      <img class="action-image" src="${getActionImage(action, visualSet)}" alt="" width="512" height="512" />
    `;
    button.addEventListener("click", () => checkChooseAnswer(button, action, answer));
    choicesElement.appendChild(button);
  });
  updateStatus();
  playActionPhrase(answer);
}

function checkChooseAnswer(card, selected, answer) {
  if (roundLocked) return;
  if (selected.word !== answer.word) {
    card.classList.remove("wrong");
    void card.offsetWidth;
    card.classList.add("wrong");
    streak = 0;
    const isTeamTurn = gamePlayMode === "teams";
    setFeedback(
      "error",
      "💥",
      isTeamTurn ? `No point for Team ${activeTeam + 1}. Here is the answer!` : "Not this one — try another hero move!",
    );
    playTone("wrong");
    playActionPhrase(answer, 300);
    if (isTeamTurn) {
      roundLocked = true;
      const cards = [...choicesElement.querySelectorAll("button")];
      cards.forEach((button) => { button.disabled = true; });
      const answerCard = cards.find((button) => button.getAttribute("aria-label") === answer.voice);
      if (answerCard) answerCard.classList.add("answer-reveal");
      round += 1;
      updateStatus();
      nextRoundTimer = window.setTimeout(() => {
        if (round >= deck.length) finishGame();
        else renderChooseRound();
      }, 1400);
      return;
    }
    updateStatus();
    return;
  }
  stopSpeech();
  roundLocked = true;
  card.classList.add("correct");
  choicesElement.querySelectorAll("button").forEach((button) => { button.disabled = true; });
  streak += 1;
  bestStreak = Math.max(bestStreak, streak);
  correctCount += 1;
  awardTeamPoint();
  score += 100 + Math.min(streak - 1, 5) * 20;
  setFeedback(
    "success",
    "⚡",
    gamePlayMode === "teams"
      ? `Point for Team ${activeTeam + 1}!`
      : (streak >= 3 ? `SUPER COMBO ×${streak}!` : `Yes! I can ${answer.voice}!`),
  );
  popStreak();
  playTone("good");
  burstStars(card);
  round += 1;
  updateStatus();
  nextRoundTimer = window.setTimeout(() => {
    if (round >= deck.length) finishGame();
    else renderChooseRound();
  }, 1100);
}

function renderMemoryGame() {
  preparePlayArea();
  currentSpokenAction = null;
  teamScoreboard.hidden = true;
  playScreen.classList.add("memory-mode");
  missionPanel.hidden = true;
  speakButton.hidden = true;
  modeLabel.textContent = modeInfo.memory.label;
  roundNumberElement.textContent = matchedPairs;
  choicesElement.className = "memory-board";
  setFeedback("", "🧠", "Open two cards and find the same action!");
  const memoryCards = shuffle(actions.flatMap((action) => [
    {
      action,
      kind: "set1",
      id: `${action.word}-set1`,
      imagePath: getActionImage(action, 0),
    },
    {
      action,
      kind: "set2",
      id: `${action.word}-set2`,
      imagePath: getActionImage(action, 1),
    },
  ]));
  memoryCards.forEach((item, index) => {
    const button = document.createElement("button");
    button.className = "memory-card";
    button.type = "button";
    button.dataset.key = item.action.word;
    button.dataset.kind = item.kind;
    button.dataset.id = item.id;
    button.style.setProperty("--card-color", item.action.color);
    button.setAttribute("aria-label", `Hidden memory card ${index + 1}`);
    button.innerHTML = `
      <span class="memory-index" aria-hidden="true">${index + 1}</span>
      <span class="memory-cover" aria-hidden="true">⚡</span>
      <span class="memory-content is-image">
        <img src="${item.imagePath}" alt="" width="512" height="512" />
      </span>
    `;
    button.addEventListener("click", () => revealMemoryCard(button, item));
    choicesElement.appendChild(button);
  });
  updateStatus();
}

function revealMemoryCard(card, item) {
  if (memoryLocked || card.classList.contains("revealed") || card.classList.contains("matched")) return;
  card.classList.add("revealed");
  card.setAttribute("aria-label", `${item.action.word} picture`);
  memoryOpen.push({ card, item });
  if (memoryOpen.length < 2) {
    setFeedback("", "👀", "Great — now choose the matching card.");
    return;
  }

  memoryLocked = true;
  confirmPairButton.disabled = false;
  noMatchButton.disabled = false;
  memoryDecision.hidden = false;
  setFeedback("", "⚡", "Do these cards match?");
}

function judgeMemoryChoice(playerSaysMatch) {
  if (memoryOpen.length !== 2) return;
  confirmPairButton.disabled = true;
  noMatchButton.disabled = true;
  memoryDecision.hidden = true;
  const [first, second] = memoryOpen;
  const isPair = first.item.action.word === second.item.action.word && first.item.kind !== second.item.kind;
  const choiceIsCorrect = playerSaysMatch === isPair;

  if (choiceIsCorrect && isPair) {
    memoryTimer = window.setTimeout(() => {
      first.card.classList.add("matched");
      second.card.classList.add("matched");
      first.card.disabled = true;
      second.card.disabled = true;
      matchedPairs += 1;
      correctCount += 1;
      streak += 1;
      bestStreak = Math.max(bestStreak, streak);
      score += 80 + Math.min(streak - 1, 5) * 20;
      roundNumberElement.textContent = matchedPairs;
      setFeedback("success", "⚡", "Power pair found!");
      popStreak();
      burstStars(second.card);
      memoryOpen = [];
      memoryLocked = false;
      updateStatus();
      if (matchedPairs === actions.length) nextRoundTimer = window.setTimeout(finishGame, 950);
    }, 280);
    return;
  }

  if (choiceIsCorrect) {
    streak += 1;
    bestStreak = Math.max(bestStreak, streak);
    score += 30;
    setFeedback("success", "✓", "Correct — no match! Choose two more cards.");
    popStreak();
    updateStatus();
    memoryTimer = window.setTimeout(() => {
      first.card.classList.remove("revealed");
      second.card.classList.remove("revealed");
      first.card.setAttribute("aria-label", "Hidden memory card");
      second.card.setAttribute("aria-label", "Hidden memory card");
      memoryOpen = [];
      memoryLocked = false;
    }, 650);
    return;
  }

  streak = 0;
  setFeedback(
    "error",
    "💥",
    isPair ? "These cards do match — remember this pair!" : "These cards do not match — try again!",
  );
  updateStatus();
  memoryTimer = window.setTimeout(() => {
    first.card.classList.remove("revealed");
    second.card.classList.remove("revealed");
    first.card.setAttribute("aria-label", "Hidden memory card");
    second.card.setAttribute("aria-label", "Hidden memory card");
    memoryOpen = [];
    memoryLocked = false;
  }, 800);
}

function renderVerifyRound() {
  roundLocked = false;
  activeTeam = (startingTeam + round) % 2;
  preparePlayArea();
  playScreen.classList.add("verify-mode");
  modeLabel.textContent = modeInfo.verify.label;
  roundNumberElement.textContent = round + 1;
  const answer = deck[round];
  currentSpokenAction = answer;
  const visualSet = (round + imageSetOffset) % 2;
  missionPanel.classList.add("audio-mode");
  missionHint.textContent = "Listen, then look!";
  verifyIsMatch = round % 2 === 0;
  shownVerifyAction = verifyIsMatch ? answer : shuffle(actions.filter((action) => action.word !== answer.word))[0];
  targetWordElement.textContent = answer.word;
  verifyImage.src = getActionImage(shownVerifyAction, visualSet);
  verifyImage.alt = `${shownVerifyAction.voice} action`;
  verifyVisual.hidden = false;
  choicesElement.className = "verify-choices";
  setFeedback("", "🔎", "Does the picture match the phrase?");
  [
    { value: true, label: "✓", ariaLabel: "Yes, they match" },
    { value: false, label: "✕", ariaLabel: "No, they are different" },
  ].forEach((choice) => {
    const button = document.createElement("button");
    button.className = "verify-button";
    button.type = "button";
    button.textContent = choice.label;
    button.setAttribute("aria-label", choice.ariaLabel);
    button.addEventListener("click", () => checkVerifyAnswer(button, choice.value, answer));
    choicesElement.appendChild(button);
  });
  updateStatus();
  playActionPhrase(answer);
}

function checkVerifyAnswer(button, selectedValue, answer) {
  if (roundLocked) return;
  const visualSet = (round + imageSetOffset) % 2;
  roundLocked = true;
  choicesElement.querySelectorAll("button").forEach((choiceButton) => { choiceButton.disabled = true; });
  const isCorrect = selectedValue === verifyIsMatch;
  if (isCorrect) {
    stopSpeech();
    button.classList.add("correct");
    streak += 1;
    bestStreak = Math.max(bestStreak, streak);
    correctCount += 1;
    awardTeamPoint();
    score += 110 + Math.min(streak - 1, 5) * 20;
    setFeedback(
      "success",
      "⚡",
      gamePlayMode === "teams" ? `Point for Team ${activeTeam + 1}!` : "Great listening!",
    );
    popStreak();
    playTone("good");
    burstStars(button);
  } else {
    button.classList.add("wrong");
    streak = 0;
    verifyImage.src = getActionImage(answer, visualSet);
    verifyImage.alt = `${answer.voice} action`;
    setFeedback(
      "error",
      "💥",
      gamePlayMode === "teams"
        ? `No point for Team ${activeTeam + 1}. Here is the answer!`
        : "Listen again and look at the matching action.",
    );
    playTone("wrong");
    playActionPhrase(answer, 300);
  }
  round += 1;
  updateStatus();
  nextRoundTimer = window.setTimeout(() => {
    if (round >= deck.length) finishGame();
    else renderVerifyRound();
  }, 1450);
}

function startGame(mode = currentMode) {
  window.clearTimeout(nextRoundTimer);
  window.clearTimeout(memoryTimer);
  stopAllAudio();
  currentMode = mode;
  gamePlayMode = currentMode === "memory" ? "solo" : selectedPlayMode;
  deck = currentMode === "memory"
    ? shuffle(actions)
    : buildQuestionDeck(selectedQuestionCount);
  round = 0;
  score = 0;
  streak = 0;
  bestStreak = 0;
  correctCount = 0;
  teamScores = [0, 0];
  startingTeam = gamePlayMode === "teams" ? Math.floor(Math.random() * 2) : 0;
  activeTeam = startingTeam;
  matchedPairs = 0;
  memoryOpen = [];
  memoryLocked = false;
  roundLocked = false;
  imageSetOffset = Math.floor(Math.random() * 2);
  roundTotalElement.textContent = currentMode === "memory" ? actions.length : deck.length;
  setScreen("play");
  if (currentMode === "memory") renderMemoryGame();
  else if (currentMode === "verify") renderVerifyRound();
  else renderChooseRound();
}

function finishGame() {
  stopSpeech();
  currentSpokenAction = null;
  document.querySelector("#final-score").textContent = score;
  document.querySelector("#best-streak").textContent = bestStreak;
  document.querySelector("#correct-count").textContent = `${correctCount}/${deck.length}`;
  let finishMessage = modeInfo[currentMode].finish;
  if (gamePlayMode === "teams") {
    if (teamScores[0] === teamScores[1]) finishMessage = `It's a tie — ${teamScores[0]} : ${teamScores[1]}!`;
    else {
      const winner = teamScores[0] > teamScores[1] ? 1 : 2;
      finishMessage = `Team ${winner} wins — ${teamScores[0]} : ${teamScores[1]}!`;
    }
  }
  document.querySelector("#finish-message").textContent = finishMessage;
  const badgeRow = document.querySelector("#badge-row");
  badgeRow.replaceChildren();
  actions.forEach((action) => {
    const badge = document.createElement("span");
    badge.className = "mini-badge";
    const badgeImage = document.createElement("img");
    badgeImage.src = getActionImage(action, imageSetOffset);
    badgeImage.alt = "";
    badge.appendChild(badgeImage);
    badge.title = action.word;
    badgeRow.appendChild(badge);
  });
  powerFill.style.width = "100%";
  setScreen("finish");
  if (currentMode !== "memory") {
    playTone("good");
    playSpeech("mission-complete", "Mission complete! You are a word hero!", 360);
  }
}

document.querySelectorAll(".mode-card").forEach((button) => {
  button.addEventListener("click", () => {
    const mode = button.dataset.mode;
    if (mode === "memory") startGame(mode);
    else openGameSetup(mode);
  });
});

document.querySelectorAll("[data-play-mode]").forEach((button) => {
  button.addEventListener("click", () => {
    selectedPlayMode = button.dataset.playMode;
    refreshSetupControls();
  });
});

document.querySelectorAll("[data-question-count]").forEach((button) => {
  button.addEventListener("click", () => {
    selectedQuestionCount = Number(button.dataset.questionCount);
    refreshSetupControls();
  });
});

setupStartButton.addEventListener("click", () => startGame(pendingMode));
setupBackButton.addEventListener("click", returnToGameMenu);

confirmPairButton.addEventListener("click", () => judgeMemoryChoice(true));
noMatchButton.addEventListener("click", () => judgeMemoryChoice(false));

replayButton.addEventListener("click", () => startGame(currentMode));
function returnToGameMenu() {
  window.clearTimeout(nextRoundTimer);
  window.clearTimeout(memoryTimer);
  stopAllAudio();
  score = 0;
  streak = 0;
  memoryOpen = [];
  memoryLocked = false;
  roundLocked = false;
  gamePlayMode = "solo";
  teamScores = [0, 0];
  activeTeam = 0;
  teamScoreboard.hidden = true;
  currentSpokenAction = null;
  memoryDecision.hidden = true;
  updateStatus();
  setScreen("intro");
}

gameBackButton.addEventListener("click", returnToGameMenu);
homeButton.addEventListener("click", returnToGameMenu);

speakButton.addEventListener("click", () => {
  if (!playScreen.hidden && currentMode !== "memory") playActionPhrase(currentSpokenAction);
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) stopAllAudio();
});

window.addEventListener("pagehide", stopAllAudio);

document.addEventListener("keydown", (event) => {
  if (playScreen.hidden || roundLocked || memoryLocked) return;
  const choiceIndex = Number(event.key) - 1;
  const buttons = choicesElement.querySelectorAll("button:not(:disabled)");
  if (choiceIndex >= 0 && choiceIndex < buttons.length) buttons[choiceIndex].click();
});

setScreen("intro");
