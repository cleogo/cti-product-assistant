"""
Step 1 — Echo bot.

Goal: prove the loop works (install OK, websocket OK, hot-reload OK).
No LLM, no retrieval — just echo the user's message back.

Run from the project root:
    chainlit run steps/step1_echo.py -w
"""

import chainlit as cl


@cl.on_message
async def main(msg: cl.Message):
    await cl.Message(content=f"You said: {msg.content}").send()
