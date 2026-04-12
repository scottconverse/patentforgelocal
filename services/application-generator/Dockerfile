FROM python:3.12-slim

WORKDIR /app

COPY pyproject.toml .
RUN pip install --no-cache-dir .

COPY src/ src/

EXPOSE 3003

CMD ["uvicorn", "src.server:app", "--host", "0.0.0.0", "--port", "3003"]
