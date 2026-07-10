"""Generate placeholder 64x64 PNG sprites for all 11 animation states."""
import struct, zlib, os, json

SPRITES_DIR = r"C:\New folder\TauriPetApp\src\assets\sprites"

STATES = [
    {"name": "idle",            "color": (0xCC, 0xCC, 0xCC), "frames": 6, "fps": 8,  "loop": True},
    {"name": "walk",            "color": (0x66, 0xBB, 0x66), "frames": 8, "fps": 10, "loop": True},
    {"name": "sleep",           "color": (0x88, 0x88, 0xCC), "frames": 4, "fps": 8,  "loop": True},
    {"name": "waking_up",       "color": (0xDD, 0xDD, 0x88), "frames": 4, "fps": 7,  "loop": False},
    {"name": "happy",           "color": (0xFF, 0xCC, 0x44), "frames": 6, "fps": 10, "loop": False},
    {"name": "worried",         "color": (0xCC, 0x88, 0x88), "frames": 4, "fps": 8,  "loop": True},
    {"name": "celebrate",       "color": (0xFF, 0x99, 0x44), "frames": 8, "fps": 10, "loop": False},
    {"name": "typing_focused",  "color": (0x66, 0xCC, 0xCC), "frames": 4, "fps": 8,  "loop": True},
    {"name": "eating",          "color": (0xCC, 0x66, 0xFF), "frames": 6, "fps": 10, "loop": False},
    {"name": "consent_ask",     "color": (0xFF, 0x88, 0x88), "frames": 4, "fps": 8,  "loop": True},
    {"name": "bring_me_a_note", "color": (0x88, 0xCC, 0xFF), "frames": 6, "fps": 7,  "loop": False},
]

def create_png(width, height, frames, base_color):
    """Create a sprite sheet PNG: width*frames x height, each frame slightly varied.
       Returns raw PNG bytes."""
    sheet_width = width * frames
    raw = b""
    for f in range(frames):
        for y in range(height):
            for x in range(width):
                # Draw a simple circle with a "face" dot
                cx, cy = width//2, height//2
                r = min(width, height) * 3 // 8
                dx, dy = x - cx, y - cy
                dist = dx*dx + dy*dy
                if dist <= r*r:
                    # Slightly vary brightness per frame for visual distinction
                    shift = (f - frames//2) * 8
                    raw += struct.pack("BBBB",
                        max(0, min(255, base_color[0] + shift)),
                        max(0, min(255, base_color[1] + shift)),
                        max(0, min(255, base_color[2] + shift)),
                        255)
                else:
                    raw += struct.pack("BBBB", 0, 0, 0, 0)  # transparent

    # Deflate + zlib
    deflate = zlib.compressobj(level=9, wbits=-15)
    compressed = deflate.compress(raw) + deflate.flush()

    # Build PNG
    def chunk(chunk_type, data):
        c = chunk_type + data
        crc = struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF)
        return struct.pack(">I", len(data)) + c + crc

    ihdr = struct.pack(">IIBBBBB", sheet_width, height, 8, 6, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", compressed) + chunk(b"IEND", b"")

for st in STATES:
    png_path = os.path.join(SPRITES_DIR, st["name"] + ".png")
    json_path = os.path.join(SPRITES_DIR, st["name"] + ".json")

    png_data = create_png(64, 64, st["frames"], st["color"])
    with open(png_path, "wb") as f:
        f.write(png_data)

    meta = {
        "frameWidth": 64,
        "frameHeight": 64,
        "frameCount": st["frames"],
        "fps": st["fps"],
        "loop": st["loop"],
    }
    with open(json_path, "w") as f:
        json.dump(meta, f, indent=2)

    print(f"  {st['name']:20s}  {png_path}  ({len(png_data)} bytes)")

print("\nDone — 11 placeholder sprites generated.")
