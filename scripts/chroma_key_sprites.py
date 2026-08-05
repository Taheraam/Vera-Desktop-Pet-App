"""
Chroma-key sprite sheets for VeraPet.

Removes baked-in green backgrounds from AI-generated sprite PNGs.
The pet body is orange (~247,150,60) so G << R — safely below threshold.

Usage:
    python scripts/chroma_key_sprites.py
"""

from pathlib import Path
from PIL import Image
import numpy as np

SPRITES_DIR = Path(__file__).resolve().parent.parent / "src" / "assets" / "sprites"
SPRITE_FILES = ["idle.png", "sleep.png", "waking_up.png", "eating.png"]

# Hard-key threshold: if green dominates by this much, fully transparent
HARD_THRESHOLD = 40
# Feather band: between HARD and SOFT, blend alpha proportionally
SOFT_THRESHOLD = 60


def chroma_key(img_path: Path) -> None:
    """Remove green background from a single sprite sheet."""
    img = Image.open(img_path).convert("RGBA")
    data = np.array(img, dtype=np.int16)  # int16 to avoid underflow

    r, g, b, a = data[:, :, 0], data[:, :, 1], data[:, :, 2], data[:, :, 3]
    max_rb = np.maximum(r, b)
    green_excess = g - max_rb  # how much greener than the next channel

    # Hard key: green dominates by > HARD_THRESHOLD → fully transparent
    hard_mask = green_excess > HARD_THRESHOLD
    data[hard_mask, 3] = 0

    # Feather band: between HARD and SOFT threshold → blend alpha
    feather_mask = (green_excess > 0) & (green_excess <= HARD_THRESHOLD)
    # Blend: closer to HARD_THRESHOLD → more transparent
    feather_alpha = ((HARD_THRESHOLD - green_excess[feather_mask]) * 255 // HARD_THRESHOLD)
    # Take minimum of existing alpha and computed alpha
    existing_alpha = data[feather_mask, 3].astype(np.int16)
    data[feather_mask, 3] = np.minimum(existing_alpha, feather_alpha).clip(0, 255)

    # De-green the halo band: reduce G channel on partially transparent pixels
    # to kill green fringe artifacts
    halo_mask = (data[:, :, 3] > 0) & (data[:, :, 3] < 255) & (green_excess > 0)
    if np.any(halo_mask):
        # Pull G down towards the average of R and B
        avg_rb = (r[halo_mask] + b[halo_mask]) // 2
        data[halo_mask, 1] = np.minimum(g[halo_mask], avg_rb + 20).clip(0, 255)

    result = Image.fromarray(data.astype(np.uint8), "RGBA")
    result.save(img_path)
    print(f"  [OK] {img_path.name}: processed ({img.width}x{img.height})")


def main() -> None:
    print(f"Chroma-keying sprites in: {SPRITES_DIR}")
    for name in SPRITE_FILES:
        path = SPRITES_DIR / name
        if not path.exists():
            print(f"  [SKIP] {name}: not found, skipping")
            continue
        chroma_key(path)
    print("Done.")


if __name__ == "__main__":
    main()
