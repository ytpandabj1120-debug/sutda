// public/client.js
// ------------------------------------------------------------------
// 브라우저 클라이언트 로직
// - 서버가 보내준 roomState를 화면에 렌더링
// - 사용자는 버튼 클릭 시 createRoom / joinRoom / gameAction 등을 전송
// - 카드 판정/승패 계산은 절대 클라이언트가 하지 않음
// ------------------------------------------------------------------

const socket = io();
let currentState = null;

// -----------------------
// DOM 캐시
// -----------------------
const lobbyScreen = document.getElementById('lobbyScreen');
const gameScreen = document.getElementById('gameScreen');

const nicknameInput = document.getElementById('nicknameInput');
const roomCodeInput = document.getElementById('roomCodeInput');
const createRoomBtn = document.getElementById('createRoomBtn');
const joinRoomBtn = document.getElementById('joinRoomBtn');

const roomCodeDisplay = document.getElementById('roomCodeDisplay');
const myIdDisplay = document.getElementById('myIdDisplay');
const hostDisplay = document.getElementById('hostDisplay');
const potDisplay = document.getElementById('potDisplay');
const currentBetDisplay = document.getElementById('currentBetDisplay');
const turnBanner = document.getElementById('turnBanner');
const playersList = document.getElementById('playersList');
const myCards = document.getElementById('myCards');
const logBox = document.getElementById('logBox');
const lastResultBox = document.getElementById('lastResultBox');

const startGameBtn = document.getElementById('startGameBtn');
const leaveRoomBtn = document.getElementById('leaveRoomBtn');
const callBtn = document.getElementById('callBtn');
const betBtn = document.getElementById('betBtn');
const foldBtn = document.getElementById('foldBtn');
const betAmountInput = document.getElementById('betAmountInput');

const developerPanel = document.getElementById('developerPanel');
const devTargetInput = document.getElementById('devTargetInput');
const devAmountInput = document.getElementById('devAmountInput');
const devSecretInput = document.getElementById('devSecretInput');
const devGrantBtn = document.getElementById('devGrantBtn');
const devResult = document.getElementById('devResult');

const toast = document.getElementById('toast');
let toastTimer = null;

// 닉네임 편의 저장
nicknameInput.value = localStorage.getItem('sutdaNickname') || '';

function showToast(message) {
  toast.textContent = message;
  toast.classList.remove('hidden');

  if (toastTimer) {
    clearTimeout(toastTimer);
  }

  toastTimer = setTimeout(() => {
    toast.classList.add('hidden');
  }, 2600);
}

function switchToLobby() {
  lobbyScreen.classList.remove('hidden');
  gameScreen.classList.add('hidden');
  currentState = null;
}

function switchToGame() {
  lobbyScreen.classList.add('hidden');
  gameScreen.classList.remove('hidden');
}

function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function renderCardFront(card) {
  return `
    <div class="card front">
      <div class="card-inner">
        <div>
          <div class="card-month">${card.month}</div>
          <div class="card-sub">${escapeHtml(card.label)}</div>
        </div>
        ${card.isKwang ? '<div class="card-kwang">광</div>' : '<div class="card-sub">일반패</div>'}
      </div>
    </div>
  `;
}

function renderCardBack() {
  return `
    <div class="card back">
      <div class="card-inner"></div>
    </div>
  `;
}

function renderMyCardsSection(state) {
  const cards = state.game?.myCards || [];
  if (!cards.length) {
    myCards.innerHTML = '<div class="small-label">아직 게임이 시작되지 않았습니다.</div>';
    return;
  }

  myCards.innerHTML = cards.map((card) => renderCardFront(card)).join('');
}

function renderTurnBanner(state) {
  if (state.roomStatus === 'lobby') {
    turnBanner.textContent = state.isHost
      ? '방장입니다. 인원이 모이면 게임 시작 버튼을 눌러주세요.'
      : '방장이 게임을 시작하기를 기다리는 중입니다.';
    return;
  }

  const myTurn = state.controls?.canAct;
  if (myTurn) {
    turnBanner.textContent = '지금은 당신의 차례입니다. 콜/베팅/다이 중 하나를 선택하세요.';
    return;
  }

  const currentTurn = state.game?.currentTurnPlayerId || '-';
  turnBanner.textContent = `현재 ${currentTurn}님의 차례입니다.`;
}

function renderPlayers(state) {
  playersList.innerHTML = state.players
    .map((player) => {
      const isTurn = state.game?.currentTurnPlayerId === player.id;
      const hiddenCardCount = player.revealedCards?.length
        ? 0
        : state.roomStatus === 'playing'
          ? Math.max(player.cardCount, 2)
          : 0;

      const cardsHtml = player.revealedCards?.length
        ? player.revealedCards.map((card) => renderCardFront(card)).join('')
        : new Array(hiddenCardCount).fill(0).map(() => renderCardBack()).join('');

      return `
        <div class="player-card ${isTurn ? 'turn' : ''}">
          <div class="player-row-top">
            <div>
              <div class="player-name">${escapeHtml(player.id)}</div>
              <div class="small-label">보유 조각 ${player.pieces} / 이번 판 참여 ${player.totalContribution}</div>
            </div>
            <div>
              <strong>${player.currentBet}조각</strong>
            </div>
          </div>

          <div class="player-badges">
            ${state.hostId === player.id ? '<span class="badge host">방장</span>' : ''}
            ${isTurn ? '<span class="badge turn">현재 차례</span>' : ''}
            ${player.folded ? '<span class="badge fold">다이</span>' : ''}
            ${player.handName ? `<span class="badge">${escapeHtml(player.handName)}</span>` : ''}
          </div>

          ${cardsHtml ? `<div class="cards-row" style="margin-top:10px;">${cardsHtml}</div>` : ''}
        </div>
      `;
    })
    .join('');
}

function renderLogs(state) {
  const items = state.messages || [];
  if (!items.length) {
    logBox.innerHTML = '<div class="small-label">아직 로그가 없습니다.</div>';
    return;
  }

  logBox.innerHTML = items
    .map((item) => `<div class="log-item">${escapeHtml(item.text)}</div>`)
    .join('');
}

function renderLastResult(state) {
  const result = state.lastResult;
  if (!result) {
    lastResultBox.classList.add('hidden');
    lastResultBox.innerHTML = '';
    return;
  }

  const winnersHtml = result.winners
    .map((winner) => `<strong>${escapeHtml(winner.id)}</strong> (+${winner.payout}조각, ${escapeHtml(winner.handName)})`)
    .join('<br />');

  const playersHtml = result.players
    .map((player) => {
      const cardsHtml = player.cards?.length
        ? `<div class="cards-row" style="margin-top:8px;">${player.cards.map((card) => renderCardFront(card)).join('')}</div>`
        : '<div class="small-label" style="margin-top:8px;">공개 카드 없음</div>';

      return `
        <div class="result-player">
          <div><strong>${escapeHtml(player.id)}</strong></div>
          <div class="small-label">${player.folded ? '다이' : (player.handName || '자동 승리')} / 총 투입 ${player.totalContribution}조각</div>
          ${cardsHtml}
        </div>
      `;
    })
    .join('');

  lastResultBox.classList.remove('hidden');
  lastResultBox.innerHTML = `
    <h4>지난 판 결과</h4>
    <div class="small-label">${escapeHtml(result.reason)}</div>
    <div style="margin-top:8px;"><strong>판돈:</strong> ${result.pot}조각</div>
    <div style="margin-top:8px;"><strong>승자:</strong><br />${winnersHtml}</div>
    <div style="margin-top:12px;"><strong>패 공개</strong></div>
    ${playersHtml}
  `;
}

function renderDeveloperPanel(state) {
  const enabled = !!state.developerTools?.enabled;
  developerPanel.classList.toggle('hidden', !enabled);
}

function renderButtons(state) {
  const canStart = !!state.controls?.canStart;
  const canAct = !!state.controls?.canAct;

  startGameBtn.disabled = !canStart;
  startGameBtn.style.opacity = canStart ? '1' : '0.5';

  callBtn.disabled = !canAct;
  betBtn.disabled = !canAct;
  foldBtn.disabled = !canAct;
}

function renderState(state) {
  switchToGame();

  roomCodeDisplay.textContent = state.roomCode || '-';
  myIdDisplay.textContent = state.myId || '-';
  hostDisplay.textContent = state.hostId || '-';
  potDisplay.textContent = `${state.game?.pot || 0}조각`;
  currentBetDisplay.textContent = `${state.game?.currentBet || 0}조각`;

  renderTurnBanner(state);
  renderPlayers(state);
  renderMyCardsSection(state);
  renderLogs(state);
  renderLastResult(state);
  renderDeveloperPanel(state);
  renderButtons(state);
}

function saveNickname() {
  const nickname = nicknameInput.value.trim();
  if (nickname) {
    localStorage.setItem('sutdaNickname', nickname);
  }
}

createRoomBtn.addEventListener('click', () => {
  const nickname = nicknameInput.value.trim();
  if (!nickname) {
    showToast('닉네임을 입력해 주세요.');
    return;
  }

  saveNickname();
  socket.emit('createRoom', { nickname });
});

joinRoomBtn.addEventListener('click', () => {
  const nickname = nicknameInput.value.trim();
  const roomCode = roomCodeInput.value.trim().toUpperCase();

  if (!nickname) {
    showToast('닉네임을 입력해 주세요.');
    return;
  }

  if (!roomCode) {
    showToast('방 코드를 입력해 주세요.');
    return;
  }

  saveNickname();
  socket.emit('joinRoom', { nickname, roomCode });
});

startGameBtn.addEventListener('click', () => {
  socket.emit('startGame');
});

leaveRoomBtn.addEventListener('click', () => {
  socket.emit('leaveRoom');
});

callBtn.addEventListener('click', () => {
  socket.emit('gameAction', { type: 'call' });
});

betBtn.addEventListener('click', () => {
  const amount = betAmountInput.value.trim();
  socket.emit('gameAction', { type: 'bet', amount });
});

foldBtn.addEventListener('click', () => {
  socket.emit('gameAction', { type: 'fold' });
});

devGrantBtn.addEventListener('click', () => {
  const targetNickname = devTargetInput.value.trim();
  const amount = devAmountInput.value.trim();
  const secret = devSecretInput.value;

  socket.emit('adminGrantPieces', {
    targetNickname,
    amount,
    secret,
  });
});

socket.on('roomState', (state) => {
  currentState = state;
  renderState(state);
});

socket.on('leftRoom', () => {
  switchToLobby();
});

socket.on('errorMessage', (message) => {
  showToast(message);
});

socket.on('adminGrantResult', (result) => {
  devResult.textContent = `${result.targetNickname}님의 조각이 ${result.amount > 0 ? '+' : ''}${result.amount} 변경되었습니다. 현재 총 ${result.totalPieces}조각입니다.`;
  showToast('개발자 조각 변경 완료');
});

socket.on('connect_error', () => {
  showToast('서버 연결에 실패했습니다. 잠시 후 다시 시도해 주세요.');
});

socket.on('disconnect', () => {
  showToast('서버와 연결이 끊어졌습니다.');
});
