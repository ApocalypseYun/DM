FROM python:3.11-slim

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL 'https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_linux_x86_64.tar.gz' \
    | tar -xzf - -C /opt \
    && ln -sf /opt/piper/piper /usr/local/bin/piper

ENV LD_LIBRARY_PATH=/opt/piper
ENV ESPEAK_DATA_PATH=/opt/piper/espeak-ng-data

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

EXPOSE 8091

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8091"]
