# InterviewAI – AI-Powered Voice Interview Coach

A full-stack, voice-based mock interview platform powered by Groq (Llama 3.1), LangGraph, AssemblyAI, and Murf AI. Practice technical interviews with an adaptive AI interviewer that listens, responds in a natural voice, tracks the conversation, and delivers a detailed scorecard.

---

## Live Demo

[Demo Link Here](https://interview-ai-murex-eta.vercel.app/)

---

## Screenshots

| Topic Selection | Live Interview | Feedback Report |
|:---:|:---:|:---:|
| ![Topic Selection](screenshots/Screenshot%202026-06-16%20172427.png) | ![Live Interview](screenshots/Screenshot%202026-06-16%20173044.png) | ![Feedback](screenshots/Screenshot%202026-06-16%20173058.png) |

---

## Features

- **Voice-first interaction** — speak your answers; no typing required
- **6 interview topics** — Python, Generative AI, HTML, CSS, English, Self Introduction
- **Adaptive follow-up questions** — the AI references your exact answers, not generic scripts
- **Conversation memory** — LangGraph `InMemorySaver` maintains full session state across all 5 questions
- **Automated scoring** — 4-dimensional rubric (technical knowledge, problem solving, communication, practical experience)
- **Strengths & improvement analysis** — grounded in your actual responses with direct quotes
- **Recommended learning topics** — specific, gap-targeted study suggestions
- **Downloadable report** — print-ready HTML report with score breakdown
- **Real-time transcript** — live conversation log in the right panel
- **Session timer** — tracks total interview duration

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        BROWSER (Frontend)                    │
│  HTML / CSS / Vanilla JS                                     │
│                                                              │
│  Topic Select ──► Start Interview ──► Record Answer          │
│       │                │                    │                │
│  MediaRecorder    fetch /start-interview  fetch /submit-answer│
│  (audio/webm)          │                    │                │
└────────────────────────┼────────────────────┼────────────────┘
                         │                    │
                         ▼                    ▼
┌─────────────────────────────────────────────────────────────┐
│                     Flask Backend (Python)                   │
│                                                              │
│  /start-interview        /submit-answer      /get-feedback   │
│       │                       │                   │          │
│       ▼                       ▼                   │          │
│  LangGraph Agent         AssemblyAI STT           │          │
│  (InMemorySaver)    ◄──  (audio → text)           │          │
│       │                       │                   │          │
│       ▼                       ▼                   ▼          │
│  Groq LLM              LangGraph Agent      LangGraph Agent  │
│  llama-3.1-8b-instant  (next question)      (score + report) │
│       │                       │                   │          │
│       ▼                       ▼                   ▼          │
│  Murf AI TTS           Murf AI TTS          JSON Feedback    │
│  (text → MP3 stream)   (text → MP3 stream)  ──► jsonify()    │
│       │                       │                              │
└───────┼───────────────────────┼──────────────────────────────┘
        │                       │
        ▼                       ▼
   Base64 MP3 stream      Base64 MP3 stream
   via HTTP Response       via HTTP Response
        │                       │
        ▼                       ▼
┌──────────────────────────────────────┐
│   MediaSource API (browser)          │
│   Decode base64 ──► append buffer    │
│   Audio().play() ──► speaker output  │
└──────────────────────────────────────┘
```

**End-to-end flow:**
1. User selects a topic → frontend POSTs to `/start-interview`
2. Flask creates a new LangGraph agent with fresh `InMemorySaver`, sends system prompt + first question request to Groq
3. Groq response is piped through Murf AI TTS and streamed back as base64-encoded MP3 chunks
4. Browser reassembles chunks via `MediaSource API` and plays audio
5. User records answer via `MediaRecorder` → uploads `audio/webm` to `/submit-answer`
6. Flask transcribes audio via AssemblyAI → feeds transcript into LangGraph memory → sends adaptive follow-up request to Groq
7. After 5 questions, `/get-feedback` sends the full conversation to Groq with a structured JSON scoring prompt
8. Frontend renders the scorecard with animated score ring and breakdown bars

---

## Tech Stack

| Layer | Technology |
|---|---|
| LLM | [Groq](https://groq.com) — `llama-3.1-8b-instant` |
| Memory | [LangGraph](https://langchain-ai.github.io/langgraph/) `InMemorySaver` |
| Speech-to-Text | [AssemblyAI](https://www.assemblyai.com) Universal-3 Pro |
| Text-to-Speech | [Murf AI](https://murf.ai) — `en-US-natalie`, Falcon model |
| Backend | [Flask](https://flask.palletsprojects.com) + Flask-CORS |
| Frontend | Vanilla HTML5, CSS3, JavaScript (no framework) |
| Audio streaming | MediaSource API + base64 chunked encoding |

---

## Folder Structure

```
interview-ai/
├── backend/
│   ├── app.py          # Flask API — all routes and LLM logic
│   └── .env            # API keys (not committed)
├── frontend/
│   ├── index.html      # Single-page app shell
│   ├── index.js        # All client-side logic
│   └── style.css       # Dark-theme UI styles
├── screenshots/        # UI screenshots for README
├── .env.example        # Environment variable template
├── .gitignore
└── README.md
```

---

## Installation

### Prerequisites

- Python 3.10+
- A modern browser (Chrome/Edge recommended for MediaSource API support)
- API keys for Groq, AssemblyAI, and Murf AI

### 1. Clone the repository

```bash
git clone https://github.com/yourusername/interview-ai.git
cd interview-ai
```

### 2. Set up the backend

```bash
cd backend
python -m venv venv

# Windows
venv\Scripts\activate

# macOS/Linux
source venv/bin/activate

pip install flask flask-cors python-dotenv langchain-groq langgraph langchain assemblyai requests
```
pip install -r requirements.txt
### 3. Configure environment variables

```bash
cp .env.example backend/.env
```

Edit `backend/.env` and fill in your API keys (see [Environment Variables](#environment-variables)).

### 4. Run the backend

```bash
python app.py
```

Flask starts on `http://127.0.0.1:5000`.

### 5. Open the frontend

Open `frontend/index.html` directly in your browser, or serve it with any static file server:

```bash
# Using Python
python -m http.server 8080 --directory frontend
```

---

## Environment Variables

| Variable | Description | Where to get it |
|---|---|---|
| `GROQ_API_KEY` | Groq Cloud API key | [console.groq.com](https://console.groq.com) |
| `ASSEMBLYAI_API_KEY` | AssemblyAI API key | [app.assemblyai.com](https://app.assemblyai.com) |
| `MURF_API_KEY` | Murf AI API key | [murf.ai/api](https://murf.ai/api) |

---

## Challenges & Learnings

**Stateful conversation across turns**
LangGraph's `InMemorySaver` solved multi-turn memory, but the initial design used a single global `thread_id` — meaning concurrent users would corrupt each other's sessions. Scoping each session to a unique thread ID was a key architectural fix.

**Real-time audio streaming without buffering**
Waiting for a full TTS clip before playing created a noticeable delay that broke the conversational feel. The solution was chunked HTTP streaming from Murf → base64-encoded line-by-line → browser `MediaSource API` buffer, so audio starts playing within the first few hundred milliseconds.

**Prompting the LLM to reference actual answers**
Early versions of the interviewer prompt let the model hallucinate what the candidate had said, making follow-up questions feel generic and fake. Adding an explicit constraint — *"ONLY reference what the candidate actually said; quote their exact words"* — and injecting the transcript verbatim into the agent message resolved this.

**Migrating from Gemini to Groq**
The project originally used Gemini for inference. Switching to Groq required adapting the LangChain integration (`langchain-groq`), re-tuning the system prompts for Llama 3.1's response style, and updating structured JSON output handling since Llama is more likely to wrap output in markdown fences — hence the fence-stripping logic in `/get-feedback`.

**Structured JSON reliability**
Getting the LLM to return valid, schema-consistent JSON every time required iterative prompt hardening: explicit field names, strict scoring range rules, and a post-processing fallback that strips markdown code fences before `json.loads()`.

---

## API Reference

| Endpoint | Method | Description |
|---|---|---|
| `/start-interview` | POST | Initializes a new LangGraph session, returns streamed audio of question 1 |
| `/submit-answer` | POST | Accepts `multipart/form-data` with `audio` file, transcribes, generates next question |
| `/get-feedback` | POST | Scores the full conversation and returns a structured JSON report |

Custom response headers used for metadata transport:

- `X-Question-Text` — URL-encoded question text
- `X-User-Answer` — URL-encoded transcribed answer
- `X-Interview-Complete` — `"true"` when all 5 questions are done
- `X-Question-Number` — current question index

---

