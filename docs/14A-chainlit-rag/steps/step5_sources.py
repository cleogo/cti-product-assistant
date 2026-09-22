"""
Step 5 — Display sources.

Goal: each retrieved chunk becomes a clickable cl.Text element.

Identical to app.py at the project root — kept here so students can compare
against earlier steps.

Run from the project root:
    chainlit run steps/step5_sources.py -w
"""

from pathlib import Path

import chainlit as cl
from dotenv import load_dotenv
from langchain_community.document_loaders import PyPDFLoader
from langchain_community.vectorstores import FAISS
from langchain_openai import OpenAIEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter
from openai import AsyncOpenAI

load_dotenv()

PDF_PATH = Path(__file__).resolve().parents[1] / "data" / "sample.pdf"
MODEL = "gpt-4o-mini"

client = AsyncOpenAI()


@cl.on_chat_start
async def start():
    docs = PyPDFLoader(str(PDF_PATH)).load()
    chunks = RecursiveCharacterTextSplitter(
        chunk_size=800, chunk_overlap=100
    ).split_documents(docs)
    store = FAISS.from_documents(chunks, OpenAIEmbeddings())
    cl.user_session.set(
        "retriever", store.as_retriever(search_kwargs={"k": 4})
    )


@cl.on_message
async def main(msg: cl.Message):
    retriever = cl.user_session.get("retriever")
    chunks = await retriever.ainvoke(msg.content)
    context = "\n\n".join(c.page_content for c in chunks)
    prompt = (
        "Answer using ONLY this context. If unsure, say so.\n\n"
        f"{context}\n\n"
        f"Question: {msg.content}"
    )

    answer = cl.Message(content="")
    stream = await client.chat.completions.create(
        model=MODEL,
        stream=True,
        messages=[{"role": "user", "content": prompt}],
    )
    async for chunk in stream:
        token = chunk.choices[0].delta.content or ""
        await answer.stream_token(token)

    answer.elements = [
        cl.Text(
            name=f"Source {i + 1} — page {c.metadata.get('page', '?')}",
            content=c.page_content,
            display="side",
        )
        for i, c in enumerate(chunks)
    ]
    await answer.send()
