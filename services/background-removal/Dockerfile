FROM python:3.12-slim-bookworm
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 U2NET_HOME=/opt/rembg-models
WORKDIR /app
RUN apt-get update && apt-get upgrade -y && rm -rf /var/lib/apt/lists/* && useradd --system --uid 10001 worker && install -d -o worker -g worker /opt/rembg-models
COPY services/background-removal/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY services/background-removal/app.py ./app.py
USER worker
EXPOSE 8080
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8080", "--workers", "1"]
