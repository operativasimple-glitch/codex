# Imagen del pueblo de bots (Railway, Render, un VPS...).
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PUEBLO_DATA_DIR=/data

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY pueblo ./pueblo
RUN mkdir -p /data

# La web escucha en $PORT (lo pone la plataforma) o en el 8090.
EXPOSE 8090
CMD ["python", "-m", "pueblo"]
