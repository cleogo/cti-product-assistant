"""
Step 2 — Add the LLM (no retrieval yet).

Goal: real answers from the model. Confirms your OPENAI_API_KEY works.

Run from the project root:
    chainlit run steps/step2_llm.py -w
"""

import chainlit as cl
from dotenv import load_dotenv
from openai import AsyncOpenAI

load_dotenv()

client = AsyncOpenAI()
MODEL = "gpt-4o-mini"


@cl.on_message
async def main(msg: cl.Message):
    resp = await client.chat.completions.create(
        model=MODEL,
        messages=[{"role": "user", "content": msg.content}],
    )
    await cl.Message(content=resp.choices[0].message.content).send()
