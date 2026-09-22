"""
Week 14A — Chainlit RAG bot, final state.

This is what you should have at the end of Section 2 Step 5:
    - Loads data/sample.pdf into a FAISS index in @cl.on_chat_start
    - Streams the LLM answer token-by-token
    - Displays the retrieved chunks as cl.Text source elements

Run:
    pip install -r requirements.txt
    cp .env.example .env  # then edit .env to add your OPENAI_API_KEY
    chainlit run app.py -w

Snapshots of each progressive step live under steps/.
"""

import os
from pathlib import Path

import chainlit as cl
from dotenv import load_dotenv
from langchain_community.document_loaders import PyPDFLoader
from langchain_community.vectorstores import FAISS
from langchain_openai import OpenAIEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter
from openai import AsyncOpenAI

load_dotenv()

PDF_PATH = Path(__file__).parent / "data" / "sample.pdf"
MODEL = "gpt-4o-mini"

client = AsyncOpenAI()


@cl.on_chat_start
async def start():
    """Build the retriever once per user session."""
    if not PDF_PATH.exists():
        await cl.Message(
            content=(
                f"❌ PDF not found at {PDF_PATH}.\n\n"
                "Run `python scripts/make_sample_pdf.py` to generate the demo "
                "PDF, or drop your own PDF at that path."
            )
        ).send()
        return

    loading = cl.Message(content="Building the index from the spec PDF…")
    await loading.send()

    docs = PyPDFLoader(str(PDF_PATH)).load()
    chunks = RecursiveCharacterTextSplitter(
        chunk_size=800, chunk_overlap=100
    ).split_documents(docs)
    store = FAISS.from_documents(chunks, OpenAIEmbeddings())
    retriever = store.as_retriever(search_kwargs={"k": 4})
    cl.user_session.set("retriever", retriever)

    loading.content = (
        f"✅ Indexed {len(chunks)} chunks from "
        f"`{PDF_PATH.name}`. Ask me anything about the Acme Widget API."
    )
    await loading.update()


@cl.on_message
async def main(msg: cl.Message):
    retriever = cl.user_session.get("retriever")
    if retriever is None:
        await cl.Message(content="No retriever loaded — restart the chat.").send()
        return

    chunks = await retriever.ainvoke(msg.content)
    context = "\n\n".join(c.page_content for c in chunks)
    prompt = (
        "Answer the question using ONLY the context below. "
        "If the context doesn't contain the answer, say so directly.\n\n"
        f"Context:\n{context}\n\n"
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
