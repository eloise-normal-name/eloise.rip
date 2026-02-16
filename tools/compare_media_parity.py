from __future__ import annotations

import argparse
import hashlib
from pathlib import Path


def rel_files(root: Path) -> list[str]:
    return sorted(str(p.relative_to(root)).replace('\\', '/') for p in root.rglob('*') if p.is_file())


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser(description='Compare python and make media outputs for parity')
    parser.add_argument('--python-root', default='content/media_py_ref', help='Reference output from transcode_videos.py')
    parser.add_argument('--make-root', default='content/media_make_ref', help='Output from Makefile transcoder')
    parser.add_argument('--src-root', default='media-source', help='Source media root used to identify HEIC-derived outputs')
    parser.add_argument('--allow-heic-gap', action='store_true', help='Treat python-only AVIF files derived from HEIC/HEIF as expected')
    args = parser.parse_args()

    py_root = Path(args.python_root).resolve()
    mk_root = Path(args.make_root).resolve()
    src_root = Path(args.src_root).resolve()

    if not py_root.exists():
        print(f'[ERROR] Python output root not found: {py_root}')
        return 2
    if not mk_root.exists():
        print(f'[ERROR] Make output root not found: {mk_root}')
        return 2

    py_files = rel_files(py_root)
    mk_files = rel_files(mk_root)

    py_set = set(py_files)
    mk_set = set(mk_files)

    only_py = sorted(py_set - mk_set)
    only_mk = sorted(mk_set - py_set)

    if args.allow_heic_gap:
        filtered_only_py = []
        ignored_heic = []
        for rel in only_py:
            rel_path = Path(rel)
            if rel_path.suffix.lower() == '.avif' and rel_path.parts and rel_path.parts[0] == 'images':
                stem_rel = Path(*rel_path.parts[1:]).with_suffix('')
                heic_src = src_root / f'{stem_rel.as_posix()}.heic'
                heif_src = src_root / f'{stem_rel.as_posix()}.heif'
                if heic_src.exists() or heif_src.exists():
                    ignored_heic.append(rel)
                    continue
            filtered_only_py.append(rel)
        if ignored_heic:
            print(f'[INFO] Ignored HEIC-derived python-only files: {len(ignored_heic)}')
            for rel in ignored_heic[:20]:
                print(f'  ~ {rel}')
        only_py = filtered_only_py

    print(f'[INFO] Python files: {len(py_files)}')
    print(f'[INFO] Make files:   {len(mk_files)}')

    if only_py:
        print(f'[WARN] Only in python output: {len(only_py)}')
        for rel in only_py[:20]:
            print(f'  - {rel}')
    if only_mk:
        print(f'[WARN] Only in make output:   {len(only_mk)}')
        for rel in only_mk[:20]:
            print(f'  + {rel}')

    common = sorted(py_set & mk_set)
    hash_mismatch = []
    for rel in common:
        if sha256(py_root / rel) != sha256(mk_root / rel):
            hash_mismatch.append(rel)

    print(f'[INFO] Common files compared by hash: {len(common)}')
    if hash_mismatch:
        print(f'[WARN] Hash mismatches: {len(hash_mismatch)}')
        for rel in hash_mismatch[:20]:
            print(f'  * {rel}')
    else:
        print('[OK] No hash mismatches in common file set.')

    if only_py or only_mk or hash_mismatch:
        return 1

    print('[OK] Parity verified between python and make outputs.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
