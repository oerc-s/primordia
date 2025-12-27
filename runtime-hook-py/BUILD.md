# Build and Development Guide

Instructions for building, testing, and publishing the primordia-runtime-hook package.

## Development Setup

### 1. Install Development Dependencies

```bash
pip install -e ".[dev]"
```

This installs the package in editable mode with all development dependencies.

### 2. Install Optional Dependencies

```bash
# For OpenAI integration
pip install -e ".[openai]"

# For Anthropic integration
pip install -e ".[anthropic]"

# For LangChain integration
pip install -e ".[langchain]"

# Install everything
pip install -e ".[all,dev]"
```

## Verification

### Quick Verification

```bash
python verify.py
```

This runs a quick smoke test to verify the package is working correctly.

### Run Tests

```bash
# Run all tests
pytest

# Run with coverage
pytest --cov=primordia_runtime_hook --cov-report=html

# Run specific test
pytest tests/test_hook.py -v
```

### Run Examples

```bash
# Basic usage
python examples/basic_usage.py

# OpenAI integration (requires API key)
export OPENAI_API_KEY='sk-...'
python examples/openai_integration.py

# Paid mode (requires kernel running)
python examples/paid_mode.py
```

## Code Quality

### Format Code

```bash
# Format with black
black .

# Sort imports
isort .

# Or both
black . && isort .
```

### Lint Code

```bash
# Run ruff
ruff check .

# Fix auto-fixable issues
ruff check --fix .
```

### Type Checking

```bash
mypy primordia_runtime_hook
```

## Building

### Build Distribution Packages

```bash
# Install build tools
pip install build twine

# Build source and wheel distributions
python -m build

# Output will be in dist/
# - primordia_runtime_hook-0.1.0.tar.gz (source)
# - primordia_runtime_hook-0.1.0-py3-none-any.whl (wheel)
```

### Verify Build

```bash
# Check package
twine check dist/*

# Install locally from wheel
pip install dist/primordia_runtime_hook-0.1.0-py3-none-any.whl
```

## Publishing

### Test PyPI (Recommended First)

```bash
# Upload to Test PyPI
twine upload --repository testpypi dist/*

# Test install
pip install --index-url https://test.pypi.org/simple/ primordia-runtime-hook
```

### Production PyPI

```bash
# Upload to PyPI
twine upload dist/*

# Install from PyPI
pip install primordia-runtime-hook
```

## Version Management

Update version in `pyproject.toml`:

```toml
[project]
name = "primordia-runtime-hook"
version = "0.1.0"  # Update this
```

Also update `__version__` in `primordia_runtime_hook/__init__.py`:

```python
__version__ = "0.1.0"  # Update this
```

## Release Checklist

- [ ] Update version in `pyproject.toml`
- [ ] Update `__version__` in `__init__.py`
- [ ] Update CHANGELOG.md (if exists)
- [ ] Run tests: `pytest`
- [ ] Run verification: `python verify.py`
- [ ] Format code: `black . && isort .`
- [ ] Lint code: `ruff check .`
- [ ] Build package: `python -m build`
- [ ] Check package: `twine check dist/*`
- [ ] Test on Test PyPI
- [ ] Tag release: `git tag v0.1.0`
- [ ] Push tag: `git push origin v0.1.0`
- [ ] Upload to PyPI: `twine upload dist/*`

## Continuous Integration

### GitHub Actions (Example)

Create `.github/workflows/test.yml`:

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        python-version: ['3.8', '3.9', '3.10', '3.11', '3.12']

    steps:
    - uses: actions/checkout@v3
    - name: Set up Python ${{ matrix.python-version }}
      uses: actions/setup-python@v4
      with:
        python-version: ${{ matrix.python-version }}
    - name: Install dependencies
      run: |
        pip install -e ".[dev]"
    - name: Run tests
      run: |
        pytest --cov=primordia_runtime_hook
    - name: Run verification
      run: |
        python verify.py
```

## Documentation

### Build Sphinx Docs (Optional)

```bash
# Install sphinx
pip install sphinx sphinx-rtd-theme

# Initialize (first time only)
sphinx-quickstart docs

# Build docs
cd docs
make html

# View docs
open _build/html/index.html
```

## Troubleshooting

### Import Errors After Install

Make sure you're not in the source directory:

```bash
cd /tmp
python -c "from primordia_runtime_hook import PrimordiaHook; print('OK')"
```

### Build Failures

Clean build artifacts:

```bash
rm -rf build/ dist/ *.egg-info
python -m build
```

### Test Failures

Run with verbose output:

```bash
pytest -vv
```

## Project Structure

```
runtime-hook-py/
├── primordia_runtime_hook/
│   └── __init__.py           # Main package code
├── tests/
│   ├── __init__.py
│   └── test_hook.py          # Unit tests
├── examples/
│   ├── basic_usage.py
│   ├── openai_integration.py
│   └── paid_mode.py
├── pyproject.toml            # Package metadata & dependencies
├── setup.py                  # Backward compatibility
├── MANIFEST.in               # Package manifest
├── README.md                 # Full documentation
├── QUICKSTART.md             # Quick start guide
├── BUILD.md                  # This file
├── LICENSE                   # MIT license
├── .gitignore                # Git ignore rules
└── verify.py                 # Verification script
```

## Support

For issues or questions:
- GitHub Issues: https://github.com/primordia/primordia/issues
- Documentation: https://docs.primordia.network
