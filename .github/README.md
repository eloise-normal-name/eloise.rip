# GitHub Copilot Agent Configuration

This directory contains configuration and documentation for GitHub Copilot agents working on the eloise.rip repository.

## Files

- **copilot-instructions.md**: Main instruction file for all agents with project-specific guidelines, workflows, and conventions
- **agent-models.json**: Registry of supported AI agent models and their capabilities
- **README.md**: This file - overview of agent configuration

## Agent Identification System

All agents working on this repository are required to identify themselves at the start of their interaction using the format specified in `agent-models.json`.

### Purpose

The agent identification system serves several important functions:

1. **Performance Tracking**: Monitor which models handle which types of tasks
2. **Quality Assurance**: Analyze model performance across different work types
3. **Transparency**: Maintain clear records of which agent made which changes
4. **Optimization**: Identify the best model for specific tasks based on historical data
5. **Collaboration**: Enable better handoffs between different agent types

### How It Works

1. When an agent begins work, it reads the `agent-models.json` file
2. The agent identifies its model from the registry
3. The agent announces itself using the standard format: `Agent: {model_name} ({model_id})`
4. The agent proceeds with its work following the guidelines in `copilot-instructions.md`

### Supported Models

The current registry includes:

- **GPT-4 Optimized (gpt-4o)**: Complex reasoning, multi-file changes, architecture
- **GPT-4 Optimized Mini (gpt-4o-mini)**: Simple tasks, quick edits, single-file changes
- **Claude 3.5 Sonnet (claude-3.5-sonnet)**: Code quality, security, detailed analysis
- **Claude 3 Haiku (claude-3-haiku)**: Quick tasks, exploration, simple commands
- **OpenAI o1 Preview (o1-preview)**: Algorithm design, optimization, complex debugging
- **OpenAI o1 Mini (o1-mini)**: Focused reasoning, mathematical problems

See `agent-models.json` for detailed capabilities and preferred use cases.

## Adding New Models

To add a new agent model to the registry:

1. Edit `agent-models.json`
2. Add a new entry to the `agent_models` array with:
   - `id`: Unique identifier for the model
   - `name`: Human-readable name
   - `provider`: The company/organization providing the model
   - `capabilities`: List of capabilities the model has
   - `preferred_for`: List of task types the model excels at
3. Update this README with the new model in the Supported Models section

## Best Practices

- Always check the model's capabilities before assigning complex tasks
- Use the most appropriate model for the task at hand
- Document any model-specific quirks or limitations in this directory
- Keep `agent-models.json` updated as new models become available
