#!/usr/bin/env python3
"""
Enhanced Nmap GUI Tool - Application Entry Point
"""

import os
import sys
import logging
import webbrowser
from pathlib import Path
import time
import threading

# Add the backend directory to Python path
backend_dir = Path(__file__).parent / 'backend'
sys.path.insert(0, str(backend_dir))

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def open_browser(port=5000):
    """Open the web browser after a short delay"""
    time.sleep(2)  # Wait for server to start
    try:
        webbrowser.open(f'http://localhost:{port}')
        logger.info(f"Opened browser at http://localhost:{port}")
    except Exception as e:
        logger.error(f"Failed to open browser: {e}")


def check_requirements():
    """Check if all required dependencies are installed"""
    try:
        import flask
        import flask_cors
        import flask_socketio
        return True
    except ImportError as e:
        logger.error(f"Missing required dependency: {e}")
        logger.error("Please install requirements: pip install -r requirements.txt")
        return False


def main():
    """Main entry point"""
    print("""
    ╔══════════════════════════════════════════╗
    ║     Enhanced Nmap GUI Tool v1.0.0        ║
    ║     Network Scanning Made Easy           ║
    ╚══════════════════════════════════════════╝
    """)
    
    # Check requirements
    if not check_requirements():
        sys.exit(1)
    
    # Import and run the Flask app
    try:
        from app import app, socketio
        
        # Open browser in a separate thread
        browser_thread = threading.Thread(target=open_browser, args=(5000,))
        browser_thread.daemon = True
        browser_thread.start()
        
        logger.info("Starting Enhanced Nmap GUI Tool...")
        logger.info("Server running at http://localhost:5000")
        logger.info("Press Ctrl+C to stop the server")
        
        # Run the application
        socketio.run(app, host='0.0.0.0', port=5000, debug=False)
        
    except KeyboardInterrupt:
        logger.info("\nShutting down server...")
    except Exception as e:
        logger.error(f"Failed to start application: {e}")
        sys.exit(1)


if __name__ == '__main__':
    main()