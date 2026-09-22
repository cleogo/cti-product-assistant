# Week 14A · Chainlit RAG starter

A streaming PDF RAG chatbot built with [Chainlit](https://chainlit.io/) and the OpenAI API. This starter is the working solution for Section 2 of Week 14A — and a reference for the in-class hands-on builds.

## What's here

```
14A-chainlit-rag/
├── app.py                       # FINAL state (Step 5 complete) — what `chainlit run app.py` uses
├── steps/                       # Snapshot of each progressive build step
│   ├── step1_echo.py            # Echo bot (no LLM)
│   ├── step2_llm.py             # + LLM call (no retrieval)
│   ├── step3_retrieval.py       # + FAISS retrieval (no streaming)
│   ├── step4_streaming.py       # + token streaming
│   └── step5_sources.py         # + source citations  (== app.py)
├── data/
│   └── sample.pdf               # Synthetic Acme Widget Spec — replace with your own
├── scripts/
│   └── make_sample_pdf.py       # Re-generates data/sample.pdf
├── .chainlit/config.toml        # Chainlit feature flags (feedback, file upload)
├── .env.example                 # Template — copy to .env and add your key
├── requirements.txt
└── README.md                    # this file
```

## Setup (5 minutes)

```bash
# 1. (optional) virtualenv
python -m venv .venv
source .venv/bin/activate                 # Win: .venv\Scripts\activate

# 2. install
pip install -r requirements.txt

# 3. environment
cp .env.example .env
# edit .env, paste your real OPENAI_API_KEY

# 4. generate the sample PDF (only needed once; produces data/sample.pdf)
python scripts/make_sample_pdf.py
```

## Run the final bot

```bash
chainlit run app.py -w
```

Opens http://localhost:8000. The `-w` flag enables hot-reload.

Try asking:
- *"What auth methods does the API support?"*
- *"What happens when I exceed the rate limit?"*
- *"Compare OAuth2 and API key authentication."*

You should see tokens stream in, then the four retrieved chunks appear as clickable **Source N** elements in the right-hand panel.

## Walk through the steps

```bash
chainlit run steps/step1_echo.py -w        # Step 1: prove the loop works
chainlit run steps/step2_llm.py -w         # Step 2: + LLM
chainlit run steps/step3_retrieval.py -w   # Step 3: + retrieval
chainlit run steps/step4_streaming.py -w   # Step 4: + streaming
chainlit run steps/step5_sources.py -w     # Step 5: + sources (== app.py)
```

Run them in order to feel each capability turn on.

## Use your own corpus

Drop any PDF at `data/sample.pdf` and restart the chat (refresh the browser tab — `@cl.on_chat_start` re-fires per session, not per code edit). For multiple PDFs see Additional Exercise E2 in the Week 14A Additional Exercises doc.

## Stretch goals

The `.chainlit/config.toml` already enables:
- `[features] feedback = true` — wire `@cl.on_feedback` to capture thumbs up/down
- `[features.spontaneous_file_upload]` — replace the hardcoded path with `cl.AskFileMessage`

See Section 2 Step 6 in the Hands-On Exercises notebook for the code.

## Common errors

| Symptom                                                    | Fix                                                                   |
|------------------------------------------------------------|-----------------------------------------------------------------------|
| `chainlit hello` hangs                                     | Port 8000 in use. Try `--port 8001` or kill the offender (`lsof -i :8000`). |
| `openai.AuthenticationError`                               | `OPENAI_API_KEY` not set in the shell that started Chainlit. Re-export. |
| Took >30s to build the index                               | The PDF is too long for a workshop. Use a 5–20 page PDF.              |
| `TypeError: 'async_generator' object is not iterable`      | Used `for` instead of `async for` in the streaming loop.              |
| Got a single-shot answer instead of streaming              | Forgot `stream=True` on the OpenAI `create` call.                     |
