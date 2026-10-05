FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends fonts-noto-cjk default-jdk-headless bash gcc g++ \
    && rm -rf /var/lib/apt/lists/*
COPY requirements.txt /runner/requirements.txt
RUN pip install --no-cache-dir -r /runner/requirements.txt
COPY runner.py /runner/runner.py
ENV MPLBACKEND=Agg MPLCONFIGDIR=/tmp/matplotlib HOME=/tmp \
    OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 MKL_NUM_THREADS=1 POLARS_MAX_THREADS=1 NUMEXPR_MAX_THREADS=1 PYTHONDONTWRITEBYTECODE=1
USER 65534:65534
WORKDIR /tmp
ENTRYPOINT ["python", "-I", "/runner/runner.py"]
