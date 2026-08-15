import json
import os
import random
import time
import sys
from pathlib import Path
from streetlevel import streetview

COORDENADAS_PATH = Path(__file__).resolve().parent / "server" / "coordenadas_validas.json"
OUTPUT_DIR = Path(__file__).resolve().parent / "panos_descargados"
THUMBS_DIR = OUTPUT_DIR / "thumbs"
THUMB_SIZE = 400
THUMB_ASPECT = (4, 3)  # ancho:alto

def cargar_coordenadas():
    with open(COORDENADAS_PATH, "r", encoding="utf-8") as f:
        return json.load(f)

def generar_nombre(entry):
    lat = entry["lat"]
    lng = entry["lng"]
    pano_id = entry.get("pano_id", "unknown")
    return f"{lat};{lng};{pano_id}.jpg"

def generar_nombre_thumb(pano_id):
    return THUMBS_DIR / f"{pano_id}_thumb.jpg"

def ya_descargado(output_path):
    return output_path.exists() and output_path.stat().st_size > 0

def descargar_panorama(entry, output_path):
    lat = entry["lat"]
    lng = entry["lng"]
    pano_id = entry.get("pano_id")

    print(f"  Buscando panorama en {lat}, {lng}...")
    pano = streetview.find_panorama(lat, lng)

    if pano is None:
        print(f"  [WARN] No se encontro panorama en {lat}, {lng}")
        return False

    if pano_id and pano.id != pano_id:
        print(f"  [WARN] El pano_id difiere: esperado {pano_id}, obtenido {pano.id}")
    else:
        print(f"  [OK] Panorama encontrado: {pano.id}")

    nombre_real = f"{lat};{lng};{pano.id}.jpg"
    output_path_real = output_path.with_name(nombre_real)

    if output_path_real != output_path:
        if output_path.exists():
            output_path.unlink()

    if ya_descargado(output_path_real):
        print(f"  [SKIP] Ya descargado: {output_path_real.name}")
        crear_miniatura(output_path_real, pano.id)
        return True

    print(f"  Descargando...")
    streetview.download_panorama(pano, str(output_path_real))
    print(f"  [OK] Guardado: {output_path_real.name}")
    crear_miniatura(output_path_real, pano.id)
    return True

def crear_miniatura(output_path_real, pano_id):
    if not output_path_real.exists():
        return False
    try:
        from PIL import Image
    except ImportError:
        print("  [WARN] Pillow no esta instalado; se omite la miniatura.")
        return False

    thumb_path = generar_nombre_thumb(pano_id)
    thumb_path.parent.mkdir(parents=True, exist_ok=True)

    try:
        with Image.open(output_path_real) as img:
            w, h = img.size
            target_w, target_h = THUMB_ASPECT
            ratio = target_w / target_h
            if w / h > ratio:
                new_w = int(h * ratio)
                new_h = h
                left = (w - new_w) // 2
                top = 0
            else:
                new_w = w
                new_h = int(w / ratio)
                left = 0
                top = (h - new_h) // 2
            img = img.crop((left, top, left + new_w, top + new_h))
            img = img.resize((THUMB_SIZE, int(THUMB_SIZE / ratio)), Image.LANCZOS)
            img.convert("RGB").save(thumb_path, "JPEG", quality=85)
        print(f"  [OK] Miniatura: {thumb_path.name}")
        return True
    except Exception as e:
        print(f"  [WARN] No se pudo crear la miniatura: {e}")
        return False

def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    coordenadas = cargar_coordenadas()
    total = len(coordenadas)
    print(f"[{total}] coordenadas cargadas\n")

    descargados = 0
    omitidos = 0
    errores = 0

    for i, entry in enumerate(coordenadas, 1):
        nombre = generar_nombre(entry)
        output_path = OUTPUT_DIR / nombre

        print(f"[{i}/{total}] {entry.get('pano_id', '?')}")

        if ya_descargado(output_path):
            omitidos += 1
            print(f"  [SKIP] Ya descargado ({omitidos} omitidos hasta ahora)")
            continue

        try:
            ok = descargar_panorama(entry, output_path)
            if ok:
                descargados += 1
            else:
                errores += 1
        except Exception as e:
            errores += 1
            print(f"  [ERROR] {e}")

        if i < total:
            delay = random.uniform(2, 4)
            print(f"  Esperando {delay:.1f}s...\n")
            time.sleep(delay)
        else:
            print()

    print("=" * 40)
    print(f"Descargados: {descargados}")
    print(f"Omitidos:   {omitidos}")
    print(f"Errores:    {errores}")
    print(f"Carpeta:    {OUTPUT_DIR}")

if __name__ == "__main__":
    main()
