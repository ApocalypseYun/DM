FROM python:3.11-slim

WORKDIR /app

COPY apps/realtime-api/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY apps/realtime-api/app ./app
COPY packages/widget/dist ./packages/widget/dist
COPY assets ./assets

EXPOSE 8090

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8090"]
