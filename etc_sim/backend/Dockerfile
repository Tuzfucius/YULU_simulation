FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

COPY . /app/etc_sim

WORKDIR /app/etc_sim
RUN mkdir -p data/charts data/charts_output data/config data/datasets data/layouts data/models data/results data/road_map data/simulations data/workflows

EXPOSE 8000

CMD ["uvicorn", "etc_sim.backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
