FROM python:3.11-slim

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY vendor/piper_linux_x86_64.tar.gz /tmp/piper_linux_x86_64.tar.gz
RUN tar -xzf /tmp/piper_linux_x86_64.tar.gz -C /opt \
    && ln -sf /opt/piper/piper /usr/local/bin/piper \
    && rm -f /tmp/piper_linux_x86_64.tar.gz

ENV LD_LIBRARY_PATH=/opt/piper
ENV ESPEAK_DATA_PATH=/opt/piper/espeak-ng-data

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

EXPOSE 8091

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8091"]
