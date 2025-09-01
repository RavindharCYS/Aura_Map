#!/bin/bash

# Enhanced Nmap GUI Tool - Installation Script

echo "========================================"
echo "Enhanced Nmap GUI Tool - Installation"
echo "========================================"

# Check if Python 3 is installed
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is not installed. Please install Python 3.8 or higher."
    exit 1
fi

echo "✓ Python 3 found: $(python3 --version)"

# Check if pip is installed
if ! command -v pip3 &> /dev/null; then
    echo "❌ pip3 is not installed. Please install pip3."
    exit 1
fi

echo "✓ pip3 found"

# Check if nmap is installed
if ! command -v nmap &> /dev/null; then
    echo "⚠️  Warning: Nmap is not installed."
    echo "Please install Nmap for your system:"
    echo "  - Ubuntu/Debian: sudo apt-get install nmap"
    echo "  - macOS: brew install nmap"
    echo "  - Other: https://nmap.org/download.html"
    echo ""
    read -p "Continue without Nmap? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
else
    echo "✓ Nmap found: $(nmap --version | head -n 1)"
fi

# Create virtual environment
echo ""
echo "Creating virtual environment..."
python3 -m venv venv

# Activate virtual environment
echo "Activating virtual environment..."
source venv/bin/activate

# Install requirements
echo ""
echo "Installing Python dependencies..."
pip3 install -r requirements.txt

# Create necessary directories
echo ""
echo "Creating data directories..."
mkdir -p data/projects
mkdir -p data/templates
mkdir -p data/exports

# Make start script executable
chmod +x start.py

echo ""
echo "========================================"
echo "✅ Installation complete!"
echo ""
echo "To run the application:"
echo "  1. Activate virtual environment: source venv/bin/activate"
echo "  2. Run: python3 start.py"
echo ""
echo "Or simply run: ./start.py"
echo "========================================"