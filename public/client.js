(() => {
  const $ = id => document.getElementById(id);
  const socket = io();
  let playerId = localStorage.getItem('imposterPlayerId') || null;
  let roomCode = null, myRole = null, myWord = null, state = null, toastTimer = null, votedPhase = null, hasVoted = false;
  const screens = ['home','game'];
  function showToast(message) {
    const el = $('toast'); el.textContent = message; el.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 3500);
  }
  function showScreen(name) { screens.forEach(id => $(id).classList.toggle('hidden', id !== name)); }
  function showSection(id, yes) { $(id).classList.toggle('hidden', !yes); }
  function me() { return state?.players.find(p => p.id === playerId); }
  function escapeHtml(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function startCreate() {
    const name = $('nickname').value.trim(); if (!name) return showToast('Enter a nickname first.');
    socket.emit('create-room', { name, playerId });
  }
  function startJoin() {
    const name = $('nickname').value.trim(), code = $('roomCode').value.trim().toUpperCase();
    if (!name) return showToast('Enter a nickname first.');
    if (code.length !== 6) return showToast('Enter the 6-character room code.');
    socket.emit('join-room', { name, code, playerId });
  }
  $('createBtn').addEventListener('click', startCreate); $('joinBtn').addEventListener('click', startJoin);
  $('nickname').addEventListener('keydown', e => { if (e.key === 'Enter') startCreate(); });
  $('roomCode').addEventListener('input', e => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0,6); });
  $('copyCode').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(roomCode); showToast('Room code copied. Share it with your friends!'); }
    catch { showToast(`Room code: ${roomCode}`); }
  });
  $('clueForm').addEventListener('submit', e => { e.preventDefault(); const clue = $('clueInput').value.trim(); if (clue) { socket.emit('submit-clue', { clue }); $('clueInput').value = ''; } });
  $('guessForm').addEventListener('submit', e => { e.preventDefault(); const guess = $('guessInput').value.trim(); if (guess) { socket.emit('imposter-guess', { guess }); $('guessInput').value = ''; } });
  $('nextBtn').addEventListener('click', () => socket.emit('next-round'));
  $('leaveBtn').addEventListener('click', () => { roomCode = null; state = null; myRole = null; myWord = null; showScreen('home'); });
  socket.on('connect', () => { if (roomCode && playerId) socket.emit('join-room', { code: roomCode, name: $('nickname').value.trim() || 'Player', playerId }); });
  socket.on('identity', data => { playerId = data.playerId; roomCode = data.roomCode; localStorage.setItem('imposterPlayerId', playerId); showScreen('game'); $('codeDisplay').textContent = roomCode; });
  socket.on('private-role', role => { myRole = role.role; myWord = role.word; renderRole(); });
  socket.on('error-message', showToast);
  socket.on('state', next => { if (state && state.phase !== next.phase) { votedPhase = null; hasVoted = false; } state = next; roomCode = next.code; $('codeDisplay').textContent = next.code; showScreen('game'); render(); });
  function renderRole() {
    const card = $('roleCard');
    if (!myRole || !state || ['lobby','results'].includes(state.phase)) { card.classList.add('hidden'); return; }
    card.className = `role-card role-${myRole}`;
    card.innerHTML = myRole === 'imposter'
      ? `<div class="role-kicker">YOUR SECRET ROLE</div><div class="role-main">IMPOSTER</div><div class="role-hint">Blend in. Read the clues. Don't get caught.</div><div class="role-hint" style="margin-top:9px">CATEGORY: ${escapeHtml(state.category || 'Unknown')}</div>`
      : `<div class="role-kicker">YOUR SECRET WORD</div><div class="role-main">${escapeHtml(myWord || '••••••')}</div><div class="role-hint">Keep it secret. Give a clue that points to it.</div><div class="role-hint" style="margin-top:9px">CATEGORY: ${escapeHtml(state.category || 'Unknown')}</div>`;
  }
  function renderPlayers() {
    $('playerCount').textContent = `${state.players.length}/8`;
    $('playersList').innerHTML = state.players.map((p,i) => `<div class="player-card ${p.connected?'':'offline'}"><div class="avatar">${escapeHtml(p.name.slice(0,1).toUpperCase())}</div><div style="min-width:0"><div class="player-name">${escapeHtml(p.name)}${p.id===playerId?' (YOU)':''}</div><div class="player-meta">${p.id===state.hostId?'HOST · ':''}${p.connected?'ONLINE':'OFFLINE'}</div></div><div class="player-score">${p.score}</div></div>`).join('');
  }
  function renderClues() {
    $('clueProgress').textContent = `${state.clues.length} CLUE${state.clues.length===1?'':'S'}`;
    $('cluesList').innerHTML = state.clues.length ? state.clues.map(c => `<div class="clue-item"><span class="clue-author">${escapeHtml(c.name)}</span><span class="clue-text">${escapeHtml(c.clue)}</span></div>`).join('') : '<p class="muted">Clues will appear here as players submit them.</p>';
  }
  function renderVoting() {
    const voted = hasVoted && votedPhase === state.phase;
    const eligible = state.eligibleVotes;
    $('voteOptions').innerHTML = state.players.filter(p => p.connected && p.id !== playerId && (!eligible || eligible.includes(p.id))).map(p => `<button class="vote-option" data-id="${escapeHtml(p.id)}" ${voted?'disabled':''}><span class="avatar">${escapeHtml(p.name.slice(0,1).toUpperCase())}</span><strong>${escapeHtml(p.name)}</strong><span>VOTE ↗</span></button>`).join('');
    $('voteOptions').querySelectorAll('button').forEach(btn => btn.addEventListener('click', () => { socket.emit('submit-vote', { targetId: btn.dataset.id }); hasVoted = true; votedPhase = state.phase; renderVoting(); }));
    $('voteStatus').textContent = `${state.votesCast} vote${state.votesCast===1?'':'s'} recorded. Votes are private.`;
  }
  function renderResults() {
    $('resultTitle').textContent = state.winnerId ? 'MATCH COMPLETE' : 'THE TRUTH IS OUT';
    const imposter = state.players.find(p => p.id === state.imposterId);
    $('resultDetails').innerHTML = `<div>${escapeHtml(state.message)}</div><div style="margin-top:10px">SECRET WORD</div><div class="result-word">${escapeHtml(state.word || '—')}</div><div style="margin-top:8px">IMPOSTER: <strong>${escapeHtml(imposter?.name || 'Unknown')}</strong></div>${state.winnerId ? `<div style="margin-top:8px;color:var(--green)">🏆 MATCH WINNER: ${escapeHtml(state.players.find(p=>p.id===state.winnerId)?.name || '')}</div>` : ''}`;
    $('scoreList').innerHTML = [...state.players].sort((a,b)=>b.score-a.score).map((p,i)=>`<div class="score-row"><span class="score-name">${i===0?'✦ ':''}${escapeHtml(p.name)}${p.id===playerId?' (YOU)':''}</span><span class="score-points">${p.score} PTS</span></div>`).join('');
    const isHost = playerId === state.hostId;
    $('nextBtn').classList.toggle('hidden', !isHost);
    $('nextBtn').textContent = state.round >= state.maxRounds ? 'BACK TO LOBBY ↗' : 'NEXT ROUND ↗';
  }
  function render() {
    $('roundChip').textContent = `ROUND ${Math.max(1,state.round)} / ${state.maxRounds}`;
    $('messageBox').textContent = state.message || '';
    const titles = {lobby:'THE LOBBY',clue:'DROP A CLUE',voting:'CAST YOUR VOTE',revote:'REVOTE',guess:'FINAL GUESS',results:'ROUND RESULTS'};
    $('phaseTitle').textContent = titles[state.phase] || 'IMPOSTER';
    renderPlayers(); renderRole(); renderClues();
    showSection('clueSection', state.phase==='clue' && !state.clues.some(c=>c.playerId===playerId));
    showSection('cluesSection', ['clue','voting','revote','guess','results'].includes(state.phase));
    showSection('voteSection', ['voting','revote'].includes(state.phase));
    showSection('guessSection', state.phase==='guess' && myRole==='imposter');
    showSection('resultsSection', state.phase==='results');
    if (['voting','revote'].includes(state.phase)) renderVoting();
    if (state.phase==='results') renderResults();
    if (state.phase==='lobby') {
      const isHost = playerId === state.hostId;
      $('messageBox').innerHTML = `${escapeHtml(state.message)}${isHost && state.players.filter(p=>p.connected).length>=2 ? '<div style="margin-top:12px"><button id="startBtn" class="btn btn-primary">START MATCH ↗</button></div>' : ''}`;
      const startBtn = $('startBtn'); if (startBtn) startBtn.addEventListener('click', () => socket.emit('start-game'));
      showSection('cluesSection',false); showSection('voteSection',false); showSection('clueSection',false); showSection('guessSection',false); showSection('resultsSection',false);
    }
  }
})();