from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
from langchain_groq import ChatGroq
from langgraph.checkpoint.memory import InMemorySaver
from langchain.agents import create_agent
import assemblyai as aai
import os
import base64
import requests
import tempfile
import json

load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
MURF_API_KEY = os.getenv("MURF_API_KEY")
ASSEMBLYAI_API_KEY = os.getenv("ASSEMBLYAI_API_KEY")
aai.settings.api_key = ASSEMBLYAI_API_KEY
checkpointer = InMemorySaver()

model = ChatGroq(
    model="llama-3.1-8b-instant",
    api_key=GROQ_API_KEY
)

agent = create_agent(
    model=model,
    tools=[],
    checkpointer=checkpointer
)



question_count = 0
current_subject = ""
thread_id = "interview_session"

INTERVIEW_PROMPT = """You are Natalie, a friendly and conversational interviewer conducting a natural {subject} interview.

IMPORTANT GUIDELINES:
1. Ask exactly 5 questions total throughout the interview
2. Keep questions SHORT and CRISP (1-2 sentences maximum)
3. ALWAYS reference what the candidate ACTUALLY said in their previous answer - do NOT make up or assume their answers
4. Show genuine interest with brief acknowledgments based on their REAL responses
5. Adapt questions based on their ACTUAL responses - go deeper if they're strong, adjust if uncertain
6. Be warm and conversational but CONCISE
7. No lengthy explanations - just ask clear, direct questions

CRITICAL: Read the conversation history carefully. Only acknowledge what the candidate truly said, not what you think they might have said.

Keep it short, conversational, and adaptive!"""

FEEDBACK_PROMPT = """You are a strict, honest interviewer evaluating a candidate based on the EXACT conversation above.

Analyze the entire interview transcript carefully. Score each dimension based ONLY on what the candidate actually said.

SCORING RULES (be honest — do NOT default to high scores):
- 1.0-1.9: Very weak — vague, incorrect, or no real answers
- 2.0-2.9: Below average — some understanding but major gaps
- 3.0-3.4: Average — acceptable answers but limited depth
- 3.5-4.0: Good — solid answers with relevant examples
- 4.1-4.5: Strong — detailed, accurate, well-explained
- 4.6-5.0: Exceptional — deep expertise, precise, impressive

Return ONLY valid JSON (no markdown, no explanation outside JSON):
{{
  "subject": "{subject}",
  "scores": {{
    "technical_knowledge": <1.0-5.0>,
    "problem_solving": <1.0-5.0>,
    "communication": <1.0-5.0>,
    "practical_experience": <1.0-5.0>
  }},
  "candidate_score": <arithmetic average of the 4 scores, rounded to 1 decimal>,
  "feedback": "<2-3 sentences referencing SPECIFIC things the candidate said — use direct quotes where possible. Mention what they got right and what was weak.>",
  "strengths": [
    "<specific strength with quote or example from their actual answer>",
    "<specific strength with quote or example>",
    "<specific strength with quote or example>"
  ],
  "areas_of_improvement": [
    "<specific gap observed — quote what they said or failed to address>",
    "<specific gap>",
    "<specific gap>"
  ],
  "recommended_topics": [
    "<concrete study topic directly related to a gap, e.g. 'Python AsyncIO and event loops'>",
    "<concrete study topic>",
    "<concrete study topic>",
    "<concrete study topic>"
  ]
}}

CRITICAL:
- recommended_topics must be SPECIFIC learning subjects (not generic advice).
- recommended_topics must NOT repeat anything already in areas_of_improvement.
- strengths must reference ACTUAL answers given — no generic praise.
- If the candidate gave weak answers, the candidate_score should be 2.0-3.0, not 4+.
- Do not be encouraging at the cost of accuracy."""


app = Flask(__name__)
CORS(app,
     origins="*",
     expose_headers=[
         'X-Question-Number',
         'X-Interview-Complete',
         'X-Question-Text',
         'X-User-Answer',
     ])


def generate_audio(text):
    """Generate speech via Murf AI and return complete base64-encoded MP3."""
    BASE_URL = "https://global.api.murf.ai/v1/speech/stream"
    payload = {
        "text": text,
        "voiceId": "en-US-natalie",
        "model": "FALCON",
        "multiNativeLocale": "en-US",
        "sampleRate": 24000,
        "format": "MP3",
    }
    headers = {
        "Content-Type": "application/json",
        "api-key": MURF_API_KEY
    }
    print(f"[Murf] Requesting TTS for: {text[:60]}...")
    response = requests.post(
        BASE_URL,
        headers=headers,
        data=json.dumps(payload),
        stream=True
    )
    response.raise_for_status()

    audio_bytes = b"".join(response.iter_content(chunk_size=4096))
    print(f"[Murf] Received {len(audio_bytes)} bytes of audio")
    return base64.b64encode(audio_bytes).decode("utf-8")



@app.route("/start-interview", methods=["POST"])
def start_interview():
    global question_count, current_subject, checkpointer, agent
    data = request.json
    current_subject = data.get("subject", "Python")
    question_count = 1
    checkpointer = InMemorySaver()
    agent = create_agent(
        model=model,
        tools=[],
        checkpointer=checkpointer
    )
    config = {"configurable": {"thread_id": thread_id}}
    formatted_prompt = INTERVIEW_PROMPT.format(subject=current_subject)
    response = agent.invoke({
        "messages": [
            {"role": "system", "content": formatted_prompt},
            {"role": "user", "content": f"Start the interview with a warm greeting and ask the first question about {current_subject}. Keep it SHORT (1-2 sentences)."}
        ]
    }, config=config)
    question = response["messages"][-1].content
    print(f"\n[Question {question_count}] {question}")
    audio_b64 = generate_audio(question)
    return jsonify({
        "question": question,
        "audio": audio_b64,
    })

def speech_to_text(audio_path):
  """Convert audio file to text using AssemblyAI"""
  transcriber = aai.Transcriber()
  config = aai.TranscriptionConfig(
        speech_models=["universal-3-pro", "universal-2"],
        language_detection=True, speaker_labels=True,
    )
  transcript = transcriber.transcribe(audio_path, config=config)
  return transcript.text if transcript.text else ""



@app.route("/submit-answer", methods=["POST"])
def submit_answer():
    """Process user's answer and generate next question"""
    global question_count
    
    audio_file = request.files["audio"]
    
    temp_path = tempfile.NamedTemporaryFile(delete=False, suffix=".webm").name
    audio_file.save(temp_path)
    
    answer = speech_to_text(temp_path)
    os.unlink(temp_path)
    
    if not answer or answer.strip() == "":
        answer = "[Candidate provided a verbal response]"
    
    print(f"[Answer {question_count}] {answer}")
    
    config = {"configurable": {"thread_id": thread_id}}
    
    agent.invoke({"messages": [{"role": "user", "content": answer}]}, config=config)
    
    if question_count >= 5:
        response = agent.invoke({
            "messages": [{"role": "user", "content": "That was the 5th question. Briefly acknowledge their ACTUAL answer and let them know the interview is complete. Keep it SHORT."}]
        }, config=config)
        
        closing_message = response["messages"][-1].content
        print(f"\n[Closing] {closing_message}")
        audio_b64 = generate_audio(closing_message)
        return jsonify({
            "question": closing_message,
            "audio":    audio_b64,
            "interview_complete": True,
            "user_answer": answer,
        })
    
    question_count += 1
    
    prompt = f"""The candidate just answered question {question_count - 1}.

Look at their ACTUAL answer above. Do NOT assume or make up what they said.

Now ask question {question_count} of 5:
1. Briefly acknowledge what they ACTUALLY said (1 sentence) - quote their exact words if needed
2. Ask your next question that builds on their REAL response (1-2 sentences)
3. If they said "I don't know" or gave a wrong answer, acknowledge that and ask something simpler
4. Keep the TOTAL response under 3 sentences

Be conversational but CONCISE. Only reference what they truly said."""
    
    response = agent.invoke({"messages": [{"role": "user", "content": prompt}]}, config=config)
    
    question = response["messages"][-1].content
    print(f"\n[Question {question_count}] {question}")
    audio_b64 = generate_audio(question)
    return jsonify({
        "question":        question,
        "audio":           audio_b64,
        "question_number": question_count,
        "user_answer":     answer,
    })


@app.route("/get-feedback", methods=["POST"])
def get_feedback():
    """Generate detailed interview feedback"""
    config = {"configurable": {"thread_id": thread_id}}
    response = agent.invoke({
        "messages": [
        {
            "role": "user",
            "content": FEEDBACK_PROMPT.format(subject=current_subject)
        }
        ]
    }, config=config)
    text = response["messages"][-1].content
    print(f"\n[Feedback Generated]\n{text}\n")
    cleaned = text.strip()
    if "```" in cleaned:
        parts = cleaned.split("```")
        # Find the JSON block
        for part in parts:
            part = part.strip().lstrip("json").strip()
            if part.startswith("{"):
                cleaned = part
                break
    feedback = json.loads(cleaned)
    scores = feedback.get("scores", {})
    if scores:
        vals = [v for v in scores.values() if isinstance(v, (int, float))]
        if vals:
            computed = round(sum(vals) / len(vals), 1)
            feedback["candidate_score"] = computed
    return jsonify({"success": True, "feedback": feedback})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(
        host="0.0.0.0",
        port=port,
        debug=False
    )
