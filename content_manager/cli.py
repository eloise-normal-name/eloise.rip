from __future__ import annotations

import argparse
import json
import sys

from content_manager.config import load_config
from content_manager.services.article_generation import ArticleGenerator
from content_manager.services.generation_workflow import generate_article_from_sources


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="python -m content_manager.cli")
    subparsers = parser.add_subparsers(dest="command", required=True)

    generate_parser = subparsers.add_parser("generate", help="Generate article text from media")
    generate_parser.add_argument(
        "--media-path",
        action="append",
        default=[],
        help="Path relative to content/media, for example video/bungle-babes-duo-choreo.mp4",
    )
    generate_parser.add_argument(
        "--pretty",
        action="store_true",
        help="Pretty-print JSON output",
    )
    return parser


def cmd_generate(args: argparse.Namespace) -> int:
    config = load_config()
    generator = ArticleGenerator(api_key=config.openai_api_key, model=config.openai_model)
    result = generate_article_from_sources(
        config=config,
        generator=generator,
        media_paths=args.media_path,
    )
    if args.pretty:
        print(json.dumps(result.to_dict(), indent=2))
    else:
        print(json.dumps(result.to_dict()))
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        if args.command == "generate":
            return cmd_generate(args)
    except Exception as err:
        print(json.dumps({"error": str(err)}), file=sys.stderr)
        return 1
    parser.error(f"unknown command: {args.command}")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
