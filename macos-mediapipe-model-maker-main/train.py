#!/usr/bin/env python3
"""Train a MediaPipe gesture recognizer with MediaPipe Model Maker.

Expected dataset layout:

    dataset/
      none/
        image_001.jpg
      thumbs_up/
        image_001.jpg
      peace/
        image_001.jpg

The "none" class is required by MediaPipe Model Maker and should contain hands
that do not belong to any custom gesture class.
"""

from __future__ import annotations

import argparse
import os
import shutil
import sys
import types
from pathlib import Path


IMAGE_EXTENSIONS = {".bmp", ".jpeg", ".jpg", ".png", ".webp"}


TRAINING_CONFIG = {
    # Change these values to run training with just: python train.py
    "dataset": Path("dataset"),
    "export_dir": Path("exported_model"),
    "model_name": "gesture_recognizer.task",
    "epochs": 20,
    "batch_size": 2,
    "learning_rate": 0.001,
    "lr_decay": 0.99,
    "gamma": 2,
    "dropout_rate": 0.05,
    "layer_widths": "",
    "train_split": 0.8,
    "val_split_of_rest": 0.5,
    # Match MediaPipe Model Maker defaults used by the official guide.
    "min_detection_confidence": 0.7,
    "shuffle_preprocess": True,
    "shuffle_train": False,
    "skip_eval": False,
    "overwrite": False,
}


def configure_stdout() -> None:
    try:
        sys.stdout.reconfigure(line_buffering=True, write_through=True)
    except AttributeError:
        pass


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Train and export a MediaPipe gesture_recognizer.task model."
    )
    parser.add_argument(
        "--dataset",
        default=TRAINING_CONFIG["dataset"],
        type=Path,
        help="Dataset directory in <dataset>/<label>/<image> format.",
    )
    parser.add_argument(
        "--export-dir",
        default=TRAINING_CONFIG["export_dir"],
        type=Path,
        help="Directory for checkpoints, metadata, and exported .task file.",
    )
    parser.add_argument(
        "--model-name",
        default=TRAINING_CONFIG["model_name"],
        help="Exported MediaPipe task filename.",
    )
    parser.add_argument(
        "--epochs",
        default=TRAINING_CONFIG["epochs"],
        type=int,
        help="Training epochs.",
    )
    parser.add_argument(
        "--batch-size",
        default=TRAINING_CONFIG["batch_size"],
        type=int,
        help="Training batch size.",
    )
    parser.add_argument(
        "--learning-rate",
        default=TRAINING_CONFIG["learning_rate"],
        type=float,
        help="Optimizer learning rate.",
    )
    parser.add_argument(
        "--lr-decay",
        default=TRAINING_CONFIG["lr_decay"],
        type=float,
        help="Learning-rate decay.",
    )
    parser.add_argument(
        "--gamma",
        default=TRAINING_CONFIG["gamma"],
        type=int,
        help="Focal loss gamma parameter.",
    )
    parser.add_argument(
        "--dropout-rate",
        default=TRAINING_CONFIG["dropout_rate"],
        type=float,
        help="Classifier dropout rate.",
    )
    parser.add_argument(
        "--layer-widths",
        default=TRAINING_CONFIG["layer_widths"],
        help="Comma-separated hidden layer widths, for example: 128,64",
    )
    parser.add_argument(
        "--train-split",
        default=TRAINING_CONFIG["train_split"],
        type=float,
        help="Fraction used for training before val/test split.",
    )
    parser.add_argument(
        "--val-split-of-rest",
        default=TRAINING_CONFIG["val_split_of_rest"],
        type=float,
        help="Fraction of the non-training split used for validation.",
    )
    parser.add_argument(
        "--min-detection-confidence",
        default=TRAINING_CONFIG["min_detection_confidence"],
        type=float,
        help="Hand detection confidence threshold during preprocessing.",
    )
    parser.add_argument(
        "--shuffle-preprocess",
        action=argparse.BooleanOptionalAction,
        default=TRAINING_CONFIG["shuffle_preprocess"],
        help="Shuffle samples while extracting hand landmarks.",
    )
    parser.add_argument(
        "--shuffle-train",
        action=argparse.BooleanOptionalAction,
        default=TRAINING_CONFIG["shuffle_train"],
        help="Shuffle the generated training dataset.",
    )
    parser.add_argument(
        "--skip-eval",
        action=argparse.BooleanOptionalAction,
        default=TRAINING_CONFIG["skip_eval"],
        help="Skip evaluation on the held-out test split.",
    )
    parser.add_argument(
        "--overwrite",
        action=argparse.BooleanOptionalAction,
        default=TRAINING_CONFIG["overwrite"],
        help="Delete export-dir before training instead of resuming checkpoints.",
    )
    return parser.parse_args()


def image_count(label_dir: Path) -> int:
    return sum(
        1
        for path in label_dir.iterdir()
        if path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS
    )


def validate_dataset(dataset_dir: Path) -> list[tuple[str, int]]:
    if not dataset_dir.exists() or not dataset_dir.is_dir():
        raise ValueError(f"Dataset directory does not exist: {dataset_dir}")

    labels = []
    for child in sorted(dataset_dir.iterdir()):
        if not child.is_dir():
            continue
        count = image_count(child)
        if count > 0:
            labels.append((child.name, count))

    if not labels:
        raise ValueError(
            f"No label directories with images were found under: {dataset_dir}"
        )

    if "none" not in {label.lower() for label, _ in labels}:
        raise ValueError(
            'Gesture datasets for Model Maker must include a "none" label directory.'
        )

    if len(labels) < 2:
        raise ValueError(
            'Add at least one gesture label in addition to "none".')

    return labels


def parse_layer_widths(value: str) -> list[int]:
    if not value.strip():
        return []
    widths = []
    for item in value.split(","):
        item = item.strip()
        if not item:
            continue
        width = int(item)
        if width <= 0:
            raise ValueError(
                "--layer-widths values must be positive integers.")
        widths.append(width)
    return widths


def install_gesture_only_tensorflow_text_stub() -> None:
    """Let Model Maker import on Apple Silicon without tensorflow-text.

    mediapipe_model_maker imports its text classifier at package import time.
    The gesture recognizer does not use tensorflow_text, and tensorflow-text
    2.15 has no macOS arm64 wheel, so this placeholder keeps gesture-only
    training usable in that environment.
    """
    if "tensorflow_text" in sys.modules:
        return

    module = types.ModuleType("tensorflow_text")

    class FastBertTokenizer:  # pragma: no cover - only guards unused text paths.
        def __init__(self, *args, **kwargs):
            raise ImportError(
                "tensorflow_text is not installed. "
                "Text classifier features are unavailable in this environment."
            )

    module.FastBertTokenizer = FastBertTokenizer
    sys.modules["tensorflow_text"] = module


def format_metric(value: object) -> str:
    if value is None:
        return "-"
    try:
        return f"{float(value):.4f}"
    except (TypeError, ValueError):
        return str(value)


def install_epoch_loss_logger(gesture_recognizer: object, total_epochs: int):
    import tensorflow as tf

    class EpochLossLogger(tf.keras.callbacks.Callback):
        def __init__(self) -> None:
            super().__init__()
            self.previous_loss: float | None = None

        def on_epoch_end(self, epoch: int, logs: dict | None = None) -> None:
            logs = logs or {}
            loss = logs.get("loss")
            delta = "-"
            if loss is not None:
                loss_value = float(loss)
                if self.previous_loss is not None:
                    delta = f"{loss_value - self.previous_loss:+.4f}"
                self.previous_loss = loss_value

            parts = [
                f"Epoch {epoch + 1}/{total_epochs}",
                f"loss={format_metric(loss)}",
                f"delta={delta}",
                f"val_loss={format_metric(logs.get('val_loss'))}",
            ]
            if "categorical_accuracy" in logs:
                parts.append(
                    f"acc={format_metric(logs.get('categorical_accuracy'))}")
            if "val_categorical_accuracy" in logs:
                parts.append(
                    f"val_acc={format_metric(logs.get('val_categorical_accuracy'))}"
                )
            if "lr" in logs:
                parts.append(f"lr={format_metric(logs.get('lr'))}")
            sys.stdout.write(" | ".join(parts) + "\n")
            sys.stdout.flush()

    original_get_callbacks = gesture_recognizer.GestureRecognizer._get_callbacks
    original_fit = tf.keras.Model.fit

    def patched_get_callbacks(self):
        return [*original_get_callbacks(self), EpochLossLogger()]

    def quiet_fit(self, *args, **kwargs):
        kwargs.setdefault("verbose", 0)
        return original_fit(self, *args, **kwargs)

    gesture_recognizer.GestureRecognizer._get_callbacks = patched_get_callbacks
    tf.keras.Model.fit = quiet_fit

    def restore_training_hooks() -> None:
        gesture_recognizer.GestureRecognizer._get_callbacks = original_get_callbacks
        tf.keras.Model.fit = original_fit

    return restore_training_hooks


def main() -> int:
    configure_stdout()
    args = parse_args()
    os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")

    try:
        labels = validate_dataset(args.dataset)
        layer_widths = parse_layer_widths(args.layer_widths)
        if not 0 < args.train_split < 1:
            raise ValueError("--train-split must be between 0 and 1.")
        if not 0 < args.val_split_of_rest < 1:
            raise ValueError("--val-split-of-rest must be between 0 and 1.")
        if not 0 <= args.min_detection_confidence <= 1:
            raise ValueError(
                "--min-detection-confidence must be between 0 and 1.")
    except ValueError as exc:
        print(f"Input error: {exc}", file=sys.stderr)
        return 2

    if args.overwrite and args.export_dir.exists():
        shutil.rmtree(args.export_dir)
    args.export_dir.mkdir(parents=True, exist_ok=True)

    try:
        install_gesture_only_tensorflow_text_stub()
        from mediapipe_model_maker import gesture_recognizer
    except ImportError as exc:
        print(
            "Could not import mediapipe_model_maker. "
            "Install it with: pip install mediapipe-model-maker",
            file=sys.stderr,
        )
        print(f"Original import error: {exc}", file=sys.stderr)
        return 1

    restore_training_hooks = install_epoch_loss_logger(
        gesture_recognizer, args.epochs)

    print("Labels:")
    for label, count in labels:
        print(f"  {label}: {count} image(s)")

    preprocessing = gesture_recognizer.HandDataPreprocessingParams(
        shuffle=args.shuffle_preprocess,
        min_detection_confidence=args.min_detection_confidence,
    )
    print("Extracting hand landmarks...")
    data = gesture_recognizer.Dataset.from_folder(
        dirname=str(args.dataset),
        hparams=preprocessing,
    )
    print(f"Usable landmark samples: {len(data)}")

    if len(data) < 3:
        print(
            "Need at least 3 usable hand samples after MediaPipe preprocessing "
            "to create train/validation/test splits.",
            file=sys.stderr,
        )
        return 2

    train_data, rest_data = data.split(args.train_split)
    validation_data, test_data = rest_data.split(args.val_split_of_rest)
    print(
        "Split sizes: "
        f"train={len(train_data)}, validation={len(validation_data)}, test={len(test_data)}"
    )

    hparams = gesture_recognizer.HParams(
        learning_rate=args.learning_rate,
        batch_size=args.batch_size,
        epochs=args.epochs,
        shuffle=args.shuffle_train,
        export_dir=str(args.export_dir),
        lr_decay=args.lr_decay,
        gamma=args.gamma,
    )
    model_options = gesture_recognizer.ModelOptions(
        dropout_rate=args.dropout_rate,
        layer_widths=layer_widths,
    )
    options = gesture_recognizer.GestureRecognizerOptions(
        model_options=model_options,
        hparams=hparams,
    )

    print("Training gesture recognizer...")
    try:
        model = gesture_recognizer.GestureRecognizer.create(
            train_data=train_data,
            validation_data=validation_data,
            options=options,
        )
    finally:
        restore_training_hooks()

    if not args.skip_eval and len(test_data) > 0:
        loss, accuracy = model.evaluate(test_data, batch_size=1)
        print(f"Test loss: {loss:.4f}")
        print(f"Test accuracy: {accuracy:.4f}")
    elif len(test_data) == 0:
        print("Skipping evaluation because the test split is empty.")

    print("Exporting model bundle...")
    model.export_model(model_name=args.model_name)
    output_path = args.export_dir / args.model_name
    print(f"Exported: {output_path.resolve()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
