#!/usr/bin/env python3
"""
Example script demonstrating agent self-identification.

This script shows how an agent would:
1. Read the agent-models.json registry
2. Identify itself based on its model
3. Display its capabilities

Usage:
    python .github/agent-identification-example.py <model_id>

Example:
    python .github/agent-identification-example.py claude-3.5-sonnet
"""

import json
import sys
from pathlib import Path


def load_agent_models(json_path: Path) -> dict:
    """Load the agent models registry from JSON file."""
    with open(json_path, 'r') as f:
        return json.load(f)


def identify_agent(model_id: str, registry: dict) -> None:
    """Identify an agent based on its model ID."""
    # Find the model in the registry
    model_info = None
    for model in registry['agent_models']:
        if model['id'] == model_id:
            model_info = model
            break
    
    if not model_info:
        print(f"Error: Model '{model_id}' not found in registry.")
        print("\nAvailable models:")
        for model in registry['agent_models']:
            print(f"  - {model['id']}: {model['name']}")
        sys.exit(1)
    
    # Display identification using the format from the registry
    id_format = registry['identification_format']['template']
    identification = id_format.format(
        model_name=model_info['name'],
        model_id=model_info['id']
    )
    
    print(identification)
    print()
    print(f"Provider: {model_info['provider']}")
    print(f"Capabilities: {', '.join(model_info['capabilities'])}")
    print(f"Preferred for: {', '.join(model_info['preferred_for'])}")


def main():
    if len(sys.argv) != 2:
        print("Usage: python agent-identification-example.py <model_id>")
        print("\nExample: python agent-identification-example.py claude-3.5-sonnet")
        sys.exit(1)
    
    model_id = sys.argv[1]
    
    # Load registry
    script_dir = Path(__file__).parent
    registry_path = script_dir / 'agent-models.json'
    
    if not registry_path.exists():
        print(f"Error: Registry file not found at {registry_path}")
        sys.exit(1)
    
    registry = load_agent_models(registry_path)
    
    # Identify the agent
    identify_agent(model_id, registry)


if __name__ == '__main__':
    main()
