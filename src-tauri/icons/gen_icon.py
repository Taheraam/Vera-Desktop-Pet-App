import struct

width, height = 16, 16
pixels = b''
for y in range(height):
    for x in range(width):
        cx, cy = width//2, height//2
        r = 6
        dx, dy = x - cx, y - cy
        if dx*dx + dy*dy <= r*r:
            pixels += struct.pack('BBBB', 0xFF, 0x6B, 0x6B, 0xFF)
        else:
            pixels += struct.pack('BBBB', 0, 0, 0, 0)

row_size = ((width * 4 + 3) // 4) * 4
bmi_size = 40
pixel_data_size = row_size * height
mask_size = ((width + 31) // 32) * 4 * height
total_bmp = bmi_size + pixel_data_size + mask_size

ico_header = struct.pack('<HHH', 0, 1, 1)
ico_entry = struct.pack('<BBBBHHII',
    width if width < 256 else 0,
    height if height < 256 else 0,
    0, 0, 1, 32, total_bmp, 6 + 16)

bmi = struct.pack('<IIIHHIIIIII',
    bmi_size, width, height * 2, 1, 32, 0,
    pixel_data_size + mask_size, 0, 0, 0, 0)

bmp_pixels = b''
for y in range(height-1, -1, -1):
    for x in range(width):
        idx = (y * width + x) * 4
        r, g, b, a = pixels[idx], pixels[idx+1], pixels[idx+2], pixels[idx+3]
        bmp_pixels += struct.pack('BBBB', b, g, r, a)

and_mask = b'\x00' * mask_size

with open(r'C:\New folder\TauriPetApp\src-tauri\icons\icon.ico', 'wb') as f:
    f.write(ico_header + ico_entry + bmi + bmp_pixels + and_mask)

print('icon.ico created:', 6 + 16 + total_bmp, 'bytes')
