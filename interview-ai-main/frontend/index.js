const API_BASE = "http://127.0.0.1:5000";
// or
// const API_BASE = "http://localhost:5000";
let mediaRecorder    = null;
let recordingChunks  = [];
let recordedBlob     = null;
let currentSubject   = null;
let isSpeaking       = false;
let currentAudio     = null;
let currentQuestion  = 1;
const TOTAL_QUESTIONS = 5;

let timerInterval = null;
let timerSeconds  = 0;


const welcomeState      = document.getElementById('welcomeState');
const interviewState    = document.getElementById('interviewState');
const resultsState      = document.getElementById('resultsState');

const topicBtns         = document.querySelectorAll('.topic-btn');
const topicBadge        = document.getElementById('topicBadge');
const topicIcon         = document.getElementById('topicIcon');

const progressBlock     = document.getElementById('progressBlock');
const progressFill      = document.getElementById('progressFill');
const progressPct       = document.getElementById('progressPct');
const progressLabel     = document.getElementById('progressLabel');
const timerDisplay      = document.getElementById('timerDisplay');

const statusDot         = document.getElementById('statusDot');
const statusText        = document.getElementById('statusText');

const avatarWrap        = document.getElementById('avatarWrap');
const stateLabel        = document.getElementById('stateLabel');
const stateLabelText    = document.getElementById('stateLabelText');
const waveform          = document.getElementById('waveform');

const startInterviewBtn = document.getElementById('startInterviewBtn');
const recordBtn         = document.getElementById('recordBtn');
const micIcon           = document.getElementById('micIcon');
const stopIcon          = document.getElementById('stopIcon');
const submitBtn         = document.getElementById('submitBtn');
const endInterviewBtn   = document.getElementById('endInterviewBtn');

const transcriptEl      = document.getElementById('transcript');
const transcriptEmpty   = document.getElementById('transcriptEmpty');
const msgCount          = document.getElementById('msgCount');

const resultsLoading    = document.getElementById('resultsLoading');
const resultsContent    = document.getElementById('resultsContent');
const resultsSubject    = document.getElementById('resultsSubject');
const scoreRingFill     = document.getElementById('scoreRingFill');
const scoreValue        = document.getElementById('scoreValue');
const scoreDesc         = document.getElementById('scoreDesc');
const feedbackText      = document.getElementById('feedbackText');
const strengthsList     = document.getElementById('strengthsList');
const improveList       = document.getElementById('improveList');
const recommendList     = document.getElementById('recommendList');
const newInterviewBtn   = document.getElementById('newInterviewBtn');
const downloadBtn       = document.getElementById('downloadBtn');

const toast             = document.getElementById('toast');


console.log('[InterviewAI] DOM check:', {
  welcomeState, interviewState, resultsState,
  topicBtns: topicBtns.length,
  topicBadge, topicIcon,
  progressBlock, progressFill, progressPct, progressLabel, timerDisplay,
  statusDot, statusText,
  avatarWrap, stateLabel, stateLabelText, waveform,
  startInterviewBtn, recordBtn, micIcon, stopIcon, submitBtn, endInterviewBtn,
  transcriptEl, transcriptEmpty, msgCount,
  resultsLoading, resultsContent, resultsSubject,
  scoreRingFill, scoreValue, scoreDesc,
  feedbackText, strengthsList, improveList, recommendList,
  newInterviewBtn, downloadBtn, toast,
});


const iconMap = {
  'Self Introduction': { cls: 'fas fa-user',        color: '#3b82f6' },
  'Generative AI':     { cls: 'fas fa-brain',       color: '#a855f7' },
  'Python':            { cls: 'fab fa-python',      color: '#eab308' },
  'English':           { cls: 'fas fa-language',    color: '#22c55e' },
  'HTML':              { cls: 'fab fa-html5',       color: '#f97316' },
  'CSS':               { cls: 'fab fa-css3-alt',    color: '#06b6d4' },
};


function showToast(msg, duration = 3000) {
  toast.textContent = msg;
  toast.classList.remove('hidden');
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.classList.add('hidden'), 260);
  }, duration);
}


function setStatus(state, text) {
  statusDot.className = `status-dot status-dot--${state}`;
  statusText.textContent = text;
  stateLabel.className   = `state-label ${state}`;
  stateLabelText.textContent = text;
}


function startTimer() {
  timerSeconds = 0;
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    timerSeconds++;
    const m = String(Math.floor(timerSeconds / 60)).padStart(2, '0');
    const s = String(timerSeconds % 60).padStart(2, '0');
    timerDisplay.textContent = `${m}:${s}`;
  }, 1000);
}

function stopTimer() {
  clearInterval(timerInterval);
}


function updateProgress(qNum) {
  currentQuestion = qNum;
  const pct = Math.round(((qNum - 1) / TOTAL_QUESTIONS) * 100);
  progressFill.style.width = `${pct}%`;
  progressPct.textContent  = `${pct}%`;
  progressLabel.textContent = `Question ${qNum} of ${TOTAL_QUESTIONS}`;
}


let pendingAiMsgEl = null; 


function timestamp() {
  const now = new Date();
  return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}


let statusChipEl = null;
function showStatusChip(text) {
  removeStatusChip();
  statusChipEl = document.createElement('div');
  statusChipEl.className = 'transcript-chip';
  statusChipEl.innerHTML = `<span class="chip-dot"></span>${escapeHtml(text)}`;
  transcriptEl.appendChild(statusChipEl);
  transcriptEmpty.classList.add('hidden');
  scrollTranscript();
}
function removeStatusChip() {
  if (statusChipEl) { statusChipEl.remove(); statusChipEl = null; }
}


function insertAiPlaceholder() {
  removeStatusChip();
  transcriptEmpty.classList.add('hidden');

  const el = document.createElement('div');
  el.className = 'msg msg--ai';
  el.innerHTML = `
    <div class="msg__meta">
      <span class="msg__sender">Natalie</span>
      <span class="msg__time">${timestamp()}</span>
    </div>
    <div class="msg__bubble msg__bubble--pending">
      <span class="bubble-dots"><span></span><span></span><span></span></span>
    </div>
  `;
  transcriptEl.appendChild(el);
  pendingAiMsgEl = el;
  scrollTranscript();
  updateMsgCount();
  return el;
}


function finaliseAiMessage(text) {
  if (!pendingAiMsgEl) return;
  const bubble = pendingAiMsgEl.querySelector('.msg__bubble');
  bubble.className = 'msg__bubble';
  bubble.textContent = text || '…';
  console.log('AI Message Added', text);
  pendingAiMsgEl = null;
  scrollTranscript();
}


function discardAiPlaceholder() {
  if (pendingAiMsgEl) { pendingAiMsgEl.remove(); pendingAiMsgEl = null; updateMsgCount(); }
}

function addMessage(sender, text) {
  removeStatusChip();
  transcriptEmpty.classList.add('hidden');

  const isAI = sender === 'ai';
  const div = document.createElement('div');
  div.className = `msg msg--${isAI ? 'ai' : 'user'}`;
  div.innerHTML = `
    <div class="msg__meta">
      <span class="msg__sender">${isAI ? 'Natalie' : 'You'}</span>
      <span class="msg__time">${timestamp()}</span>
    </div>
    <div class="msg__bubble">${escapeHtml(text)}</div>
  `;
  transcriptEl.appendChild(div);
  scrollTranscript();
  updateMsgCount();
  console.log(`${isAI ? 'AI' : 'User'} Message Added`, text);
}

function scrollTranscript() {
  transcriptEl.scrollTop = transcriptEl.scrollHeight;
}

function updateMsgCount() {
  const count = transcriptEl.querySelectorAll('.msg').length;
  msgCount.textContent = `${count} message${count !== 1 ? 's' : ''}`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}


function setAvatarSpeaking(on) {
  avatarWrap.classList.toggle('speaking', on);
}

function showWaveform(on) {
  waveform.classList.toggle('hidden', !on);
}


function showWelcome() {
  welcomeState.classList.remove('hidden');
  interviewState.classList.add('hidden');
  resultsState.classList.add('hidden');
}

function showInterview() {
  welcomeState.classList.add('hidden');
  interviewState.classList.remove('hidden');
  resultsState.classList.add('hidden');
}

function showResults() {
  welcomeState.classList.add('hidden');
  interviewState.classList.add('hidden');
  resultsState.classList.remove('hidden');
  resultsLoading.classList.remove('hidden');
  resultsContent.classList.add('hidden');
}


function beginSession(subject) {
  currentSubject  = subject;
  currentQuestion = 1;
  timerSeconds    = 0;


  transcriptEl.innerHTML = '';
  transcriptEmpty.classList.remove('hidden');
  updateMsgCount();


  topicBtns.forEach(b => b.classList.toggle('active', b.dataset.subject === subject));


  const meta = iconMap[subject] || { cls: 'fas fa-star', color: '#7c6fcd' };
  topicBadge.textContent  = subject;
  topicIcon.className     = meta.cls;
  topicIcon.style.color   = meta.color;


  progressBlock.classList.remove('hidden');
  updateProgress(1);


  startInterviewBtn.classList.remove('hidden');
  recordBtn.classList.add('hidden');
  submitBtn.classList.add('hidden');
  endInterviewBtn.disabled = true;
  recordBtn.disabled       = true;


  setAvatarSpeaking(false);
  showWaveform(false);
  setStatus('idle', 'Ready to start');


  resultsSubject.textContent = subject;

  showInterview();
}

function resetAll() {
  stopTimer();
  currentSubject = null;
  isSpeaking     = false;
  mediaRecorder  = null;
  recordingChunks = [];
  recordedBlob   = null;

  if (currentAudio) { currentAudio.pause(); currentAudio = null; }

  topicBtns.forEach(b => b.classList.remove('active'));
  progressBlock.classList.add('hidden');
  setAvatarSpeaking(false);
  showWaveform(false);
  setStatus('idle', 'Select a topic to start');

  recordBtn.classList.remove('recording');
  micIcon.classList.remove('hidden');
  stopIcon.classList.add('hidden');

  showWelcome();
}


// ---------------------------------------------------------------------------
// playAudioResponse — unified handler for all JSON audio responses.
// Decodes base64 MP3, plays it, updates UI state, then calls onDone.
// ---------------------------------------------------------------------------
function playAudioResponse(data, onDone) {
  const questionText = data.question  || null;
  const userAnswer   = data.user_answer || null;

  setAvatarSpeaking(true);
  showWaveform(false);
  setStatus('speaking', 'AI Interviewer Speaking...');
  isSpeaking = true;
  recordBtn.disabled = true;
  submitBtn.classList.add('hidden');

  if (userAnswer) addMessage('user', userAnswer);
  insertAiPlaceholder();

  // Decode base64 → Blob → object URL → Audio element
  const audioBytes = Uint8Array.from(atob(data.audio), c => c.charCodeAt(0));
  const blob       = new Blob([audioBytes], { type: 'audio/mpeg' });
  const audioUrl   = URL.createObjectURL(blob);

  if (currentAudio) { currentAudio.pause(); currentAudio = null; }
  currentAudio = new Audio(audioUrl);
  console.log('[Audio] created from base64 blob, attempting play');

  function onAudioDone() {
    if (!isSpeaking) return;           // guard against double-firing
    console.log('[Audio] playback done — enabling mic');
    isSpeaking = false;
    setAvatarSpeaking(false);
    setStatus('idle', 'Your turn');
    setTimeout(() => URL.revokeObjectURL(audioUrl), 100);
    finaliseAiMessage(questionText);
    removeStatusChip();
    if (onDone) onDone();
  }

  currentAudio.addEventListener('ended', onAudioDone);
  currentAudio.addEventListener('error', (e) => {
    console.warn('[Audio] error event:', e);
    onAudioDone();
  });

  currentAudio.play().catch((e) => {
    // Rejected play() promise (autoplay policy) does NOT fire the error DOM
    // event — must call onAudioDone() directly or the UI stays stuck.
    console.warn('[Audio] play() rejected:', e);
    onAudioDone();
  });
}


function startRecording() {
  navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
    const opts = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? { mimeType: 'audio/webm;codecs=opus' }
      : { mimeType: 'audio/webm' };

    mediaRecorder = new MediaRecorder(stream, opts);
    recordingChunks = [];

    mediaRecorder.ondataavailable = e => { if (e.data.size > 0) recordingChunks.push(e.data); };
    mediaRecorder.onstop = () => {
      recordedBlob = new Blob(recordingChunks, { type: 'audio/webm' });
      stream.getTracks().forEach(t => t.stop());
    };

    mediaRecorder.start();
    recordBtn.classList.add('recording');
    micIcon.classList.add('hidden');
    stopIcon.classList.remove('hidden');
    endInterviewBtn.disabled = true;
    submitBtn.classList.add('hidden');

    showWaveform(true);
    setStatus('listening', 'Listening...');
  }).catch(() => showToast('Microphone access denied'));
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
    recordBtn.classList.remove('recording');
    micIcon.classList.remove('hidden');
    stopIcon.classList.add('hidden');
    showWaveform(false);
    setStatus('idle', 'Recording complete');
    submitBtn.classList.remove('hidden');
    submitBtn.disabled = false;
  }
}

function enableRecording() {
  recordBtn.disabled       = false;
  endInterviewBtn.disabled = false;
}

function disableRecording() {
  recordBtn.disabled = true;
  submitBtn.disabled = true;
  submitBtn.classList.add('hidden');
}


async function startInterview() {
  // Unlock autoplay with the user gesture that triggered this call.
  // A silent 0-duration audio context resume is enough to satisfy
  // browser autoplay policy for subsequent programmatic audio.play() calls.
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    await ctx.resume();
    ctx.close();
  } catch (_) {}

  startInterviewBtn.classList.add('hidden');
  recordBtn.classList.remove('hidden');
  recordBtn.disabled = true;
  setStatus('processing', 'Connecting...');
  showStatusChip('Generating first question...');
  startTimer();

  try {
    const res  = await fetch(`${API_BASE}/start-interview`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ subject: currentSubject }),
    });
    const data = await res.json();
    removeStatusChip();
    playAudioResponse(data, () => {
      enableRecording();
      endInterviewBtn.disabled = false;
    });
  } catch {
    removeStatusChip();
    discardAiPlaceholder();
    setStatus('idle', 'Backend not connected');
    showToast('Could not connect to backend — is Flask running?');
    recordBtn.classList.add('hidden');
    startInterviewBtn.classList.remove('hidden');
    stopTimer();
  }
}


async function submitAnswer() {
  if (!recordedBlob) return;

  disableRecording();


  showStatusChip('Transcribing your answer...');
  setStatus('processing', 'Transcribing...');

  const formData = new FormData();
  formData.append('audio', recordedBlob, 'answer.webm');

  try {
    const res = await fetch(`${API_BASE}/submit-answer`, {
      method: 'POST',
      body:   formData,
    });
    const data = await res.json();

    recordedBlob    = null;
    recordingChunks = [];

    if (data.question_number) updateProgress(data.question_number);

    removeStatusChip();

    if (data.interview_complete) {
      playAudioResponse(data, () => {
        triggerFeedback();
      });
    } else {
      playAudioResponse(data, () => {
        enableRecording();
        endInterviewBtn.disabled = false;
      });
    }
  } catch (err) {
    removeStatusChip();
    discardAiPlaceholder();
    
    const msg = err && err.message && err.message.includes('quota')
      ? 'Interview paused: Gemini API quota exceeded.'
      : 'Connection error — please retry';
    addMessage('ai', `⚠️ ${msg}`);
    showToast(msg);
    setStatus('idle', 'Error');
    enableRecording();
  }
}


async function endInterview() {
  if (!confirm('End the interview now and get your feedback?')) return;
  disableRecording();
  endInterviewBtn.disabled = true;
  triggerFeedback();
}


async function triggerFeedback() {
  stopTimer();
  showResults();
  setStatus('processing', 'Generating report...');

  try {
    const res  = await fetch(`${API_BASE}/get-feedback`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({}),
    });
    const data = await res.json();

    if (data.success) {
      renderFeedback(data.feedback);
      setStatus('done', 'Interview Complete');
    } else {
      throw new Error('No feedback returned');
    }
  } catch {
    resultsLoading.innerHTML = `
      <i class="fas fa-triangle-exclamation" style="font-size:1.5rem;color:var(--yellow)"></i>
      <p>Could not load feedback. <button class="btn btn--outline btn--sm" id="retryFeedbackBtn" style="margin-top:.5rem">Retry</button></p>
    `;
    document.getElementById('retryFeedbackBtn').addEventListener('click', triggerFeedback);
    setStatus('idle', 'Error generating report');
  }
}


const scoreBreakdown = document.getElementById('scoreBreakdown');

const SCORE_DIMS = [
  { key: 'technical_knowledge',  label: 'Technical Knowledge' },
  { key: 'problem_solving',      label: 'Problem Solving'     },
  { key: 'communication',        label: 'Communication'       },
  { key: 'practical_experience', label: 'Practical Experience'},
];

function renderFeedback(fb) {
  const score = parseFloat(fb.candidate_score) || 0;


  scoreValue.textContent = score.toFixed(1);
  scoreDesc.textContent  = getScoreLabel(score);
  const circumference = 314.16;
  setTimeout(() => {
    scoreRingFill.style.strokeDashoffset = circumference - (score / 5) * circumference;
  }, 50);


  const scores = fb.scores || {};
  if (scoreBreakdown) {
    scoreBreakdown.innerHTML = SCORE_DIMS.map(dim => {
      const val = parseFloat(scores[dim.key]) || 0;
      const pct = (val / 5) * 100;
      const color = val >= 4 ? 'var(--green)' : val >= 3 ? 'var(--accent)' : val >= 2 ? 'var(--yellow)' : 'var(--red)';
      return `
        <div class="breakdown-row">
          <span class="breakdown-label">${escapeHtml(dim.label)}</span>
          <div class="breakdown-bar-track">
            <div class="breakdown-bar-fill" style="width:${pct}%;background:${color}"></div>
          </div>
          <span class="breakdown-val">${val.toFixed(1)}</span>
        </div>`;
    }).join('');
  }


  feedbackText.textContent = fb.feedback || 'No feedback available.';

  fillList(strengthsList, toArray(fb.strengths));

  fillList(improveList, toArray(fb.areas_of_improvement));

  fillList(recommendList, toArray(fb.recommended_topics));

  resultsLoading.classList.add('hidden');
  resultsContent.classList.remove('hidden');
}


function toArray(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val.filter(s => String(s).trim().length > 0);
  return String(val)
    .split(/[;\n•]+/)
    .map(s => s.trim())
    .filter(s => s.length > 8)
    .slice(0, 5);
}

function getScoreLabel(score) {
  if (score >= 4.6) return 'Exceptional performance';
  if (score >= 4.1) return 'Strong candidate';
  if (score >= 3.5) return 'Good performance';
  if (score >= 3.0) return 'Average performance';
  if (score >= 2.0) return 'Needs improvement';
  return 'Significant gaps identified';
}

function fillList(el, items) {
  el.innerHTML = items.length
    ? items.map(i => `<li>${escapeHtml(String(i))}</li>`).join('')
    : '<li>No specific items noted.</li>';
}


function downloadReport() {
  const score      = scoreValue.textContent;
  const feedbackRaw  = feedbackText.textContent;
  const strengthsRaw = [...strengthsList.querySelectorAll('li')].map(l => l.textContent);
  const improveRaw   = [...improveList.querySelectorAll('li')].map(l => l.textContent);
  const recommendRaw = [...recommendList.querySelectorAll('li')].map(l => l.textContent);
  const breakdownRaw = scoreBreakdown
    ? [...scoreBreakdown.querySelectorAll('.breakdown-row')].map(r => {
        const lbl = r.querySelector('.breakdown-label')?.textContent || '';
        const val = r.querySelector('.breakdown-val')?.textContent || '';
        return `${lbl}: ${val}/5`;
      })
    : [];

  const win = window.open('', '_blank');
  const timerStr = timerDisplay ? timerDisplay.textContent : '—';
  win.document.write(`<!DOCTYPE html><html><head>
    <meta charset="UTF-8"/>
    <title>Interview Report — ${currentSubject || 'AI Interview'}</title>
    <style>
      body { font-family: 'Segoe UI', Arial, sans-serif; padding: 2.5rem; color: #1a1a2e; max-width: 720px; margin: auto; }
      h1   { font-size: 1.8rem; margin-bottom: .25rem; }
      .sub { color: #666; font-size: .9rem; margin-bottom: 2rem; }
      .score-box { display: inline-block; background: linear-gradient(135deg,#667eea,#764ba2); color: #fff;
                   padding: .5rem 1.5rem; border-radius: 8px; font-size: 1.5rem; font-weight: 700; margin-bottom: 1.5rem; }
      h2   { font-size: 1.1rem; margin: 1.25rem 0 .4rem; border-bottom: 2px solid #eee; padding-bottom: .3rem; }
      p, li { font-size: .9rem; line-height: 1.6; color: #333; }
      ul   { padding-left: 1.25rem; }
      .footer { margin-top: 2.5rem; font-size: .75rem; color: #aaa; border-top: 1px solid #eee; padding-top: .75rem; }
    </style>
  </head><body>
    <h1>Interview Feedback Report</h1>
    <p class="sub">Topic: <strong>${currentSubject}</strong> &nbsp;|&nbsp; Duration: ${timerStr} &nbsp;|&nbsp; Date: ${new Date().toLocaleDateString()}</p>
    <div class="score-box">Score: ${score} / 5</div>
    ${breakdownRaw.length ? `<h2>Score Breakdown</h2><ul>${breakdownRaw.map(s=>`<li>${s}</li>`).join('')}</ul>` : ''}
    <h2>Detailed Feedback</h2><p>${feedbackRaw}</p>
    <h2>Strengths</h2><ul>${strengthsRaw.map(s=>`<li>${s}</li>`).join('')}</ul>
    <h2>Areas to Improve</h2><ul>${improveRaw.map(s=>`<li>${s}</li>`).join('')}</ul>
    <h2>Recommended Topics</h2><ul>${recommendRaw.map(s=>`<li>${s}</li>`).join('')}</ul>
    <div class="footer">Generated by InterviewAI &nbsp;•&nbsp; ${new Date().toLocaleString()}</div>
  </body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 400);
}


topicBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    if (currentSubject === btn.dataset.subject) return;
    if (currentSubject && !confirm('Start a new session? Current progress will be lost.')) return;
    resetAll();
    beginSession(btn.dataset.subject);
  });
});

if (startInterviewBtn) {
  startInterviewBtn.addEventListener('click', startInterview);
}

if (recordBtn) {
  recordBtn.addEventListener('click', () => {
    if (isSpeaking || recordBtn.disabled) return;
    if (!mediaRecorder || mediaRecorder.state === 'inactive') {
      startRecording();
    } else {
      stopRecording();
    }
  });
}

if (submitBtn)       { submitBtn.addEventListener('click', submitAnswer); }
if (endInterviewBtn) { endInterviewBtn.addEventListener('click', endInterview); }
if (newInterviewBtn) { newInterviewBtn.addEventListener('click', resetAll); }
if (downloadBtn)     { downloadBtn.addEventListener('click', downloadReport); }

(function injectSvgDef() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '0'); svg.setAttribute('height', '0');
  svg.style.cssText = 'position:absolute;overflow:hidden;width:0;height:0';
  svg.innerHTML = `<defs>
    <linearGradient id="sg" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%"   stop-color="#667eea"/>
      <stop offset="100%" stop-color="#764ba2"/>
    </linearGradient>
  </defs>`;
  document.body.prepend(svg);
})();
