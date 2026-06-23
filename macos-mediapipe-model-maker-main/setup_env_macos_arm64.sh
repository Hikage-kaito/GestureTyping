#!/usr/bin/env bash
set -euo pipefail

ENV_NAME="mp-model-maker"

if ! conda env list | awk '{print $1}' | grep -qx "$ENV_NAME"; then
  conda env create -f environment.yml
fi
conda run -n "$ENV_NAME" python -m pip install "tensorflow==2.15.0"
conda run -n "$ENV_NAME" python -m pip install \
  "mediapipe==0.10.11" \
  "opencv-contrib-python<4.12" \
  "matplotlib<3.9" \
  sounddevice \
  attrs \
  --no-deps
conda run -n "$ENV_NAME" python -m pip install \
  "tensorflow-addons==0.23.0" \
  "tensorflow-datasets==4.9.3" \
  "tensorflow-hub==0.15.0" \
  "tensorflow-model-optimization==0.7.5" \
  "tf-models-official==2.15.0" \
  "mediapipe-model-maker==0.2.1.4" \
  --no-deps
conda run -n "$ENV_NAME" python -m pip install \
  "setuptools<81" \
  "typeguard<3" \
  array-record \
  click \
  contourpy \
  cycler \
  Cython \
  dm-tree \
  etils \
  fonttools \
  gin-config \
  google-api-python-client \
  immutabledict \
  kaggle \
  kiwisolver \
  oauth2client \
  pandas \
  pillow \
  promise \
  psutil \
  py-cpuinfo \
  pyarrow \
  pycocotools \
  pyparsing \
  pyyaml \
  sacrebleu \
  scipy \
  sentencepiece \
  seqeval \
  simple-parsing \
  tensorflow-metadata \
  tf-slim \
  toml \
  tqdm

conda run -n "$ENV_NAME" python -m pip uninstall -y jax jaxlib >/dev/null 2>&1 || true
conda run -n "$ENV_NAME" python -c "import psutil; import tensorflow as tf; print(tf.__version__)"
