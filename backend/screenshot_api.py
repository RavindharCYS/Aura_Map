# Backend API routes and logic for screenshot integration
from flask import request, jsonify, send_from_directory
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
import os
import hashlib
import time
import threading
import uuid
from pathlib import Path

# This dictionary will store active screenshot sessions in memory
screenshot_sessions = {}

class ScreenshotCapture:
    def __init__(self, project_id, session_id, socketio_instance):
        self.project_id = project_id
        self.session_id = session_id
        self.socketio = socketio_instance
        self.is_cancelled = False
        self.driver = None
        # Use Path for robust path handling
        self.project_dir = Path('data/projects')
        self.project_folder = next((p for p in self.project_dir.iterdir() if p.is_dir() and p.name.startswith(project_id)), None)
        if not self.project_folder:
            raise FileNotFoundError(f"Project folder for ID {project_id} not found.")
        
        self.screenshot_dir = self.project_folder / "screenshots"
        self.screenshot_dir.mkdir(exist_ok=True)

    def setup_driver(self):
        """Setup Chrome driver with optimal settings"""
        options = Options()
        options.add_argument("--headless=new")
        options.add_argument("--disable-gpu")
        options.add_argument("--no-sandbox")
        options.add_argument("--disable-dev-shm-usage")
        options.add_argument("--window-size=1920,1080")
        options.add_argument("--ignore-certificate-errors")
        options.add_experimental_option("excludeSwitches", ["enable-logging"])
        
        try:
            self.driver = webdriver.Chrome(options=options)
            self.driver.set_page_load_timeout(20) # 20 second timeout per page
        except Exception as e:
            print(f"Error setting up Selenium WebDriver: {e}")
            print("Please ensure you have Google Chrome and the correct version of chromedriver installed and in your PATH.")
            raise

    def capture_screenshots(self, web_services):
        """Main screenshot capture process"""
        try:
            self.setup_driver()
            total = len(web_services)
            successful = 0
            
            for i, service in enumerate(web_services):
                if self.is_cancelled:
                    print(f"Screenshot session {self.session_id} cancelled.")
                    break
                
                # Emit progress update
                self.socketio.emit('screenshot_progress', {
                    'completed': i,
                    'total': total,
                    'current_url': service.get('url', [''])[0],
                    'session_id': self.session_id
                }, room=self.session_id)
                
                result = self.capture_single_service(service)
                if result:
                    if not result.get('error'):
                        successful += 1
                    # Emit individual result
                    self.socketio.emit('screenshot_result', {
                        'result': result,
                        'session_id': self.session_id
                    }, room=self.session_id)
                
                time.sleep(0.5)  # Brief pause between captures
            
            self.socketio.emit('screenshot_completed', {
                'total': total,
                'successful': successful,
                'session_id': self.session_id
            }, room=self.session_id)
            
        except Exception as e:
            print(f"Screenshot capture error: {e}")
            self.socketio.emit('screenshot_error', {'error': str(e), 'session_id': self.session_id}, room=self.session_id)
        finally:
            if self.driver:
                self.driver.quit()
            if self.session_id in screenshot_sessions:
                del screenshot_sessions[self.session_id]

    def capture_single_service(self, service):
        """Capture screenshot for a single service"""
        ip = service.get('ip')
        port = service.get('port')
        urls_to_try = service.get('url', []) # Expecting a list of ['http://...', 'https://...']
        
        for url in urls_to_try:
            try:
                self.driver.get(url)
                time.sleep(2) # Allow page to render basic elements

                # Create a unique filename based on URL hash to avoid filesystem issues
                filename_hash = hashlib.md5(url.encode()).hexdigest()
                filename = f"{ip}_{port}_{filename_hash}.png"
                filepath = self.screenshot_dir / filename
                
                self.driver.save_screenshot(str(filepath))

                return {
                    "ip": ip,
                    "port": port,
                    "url": url,
                    "screenshot_filename": filename,
                    "error": None
                }
            except Exception as e:
                # This error is expected if a URL (e.g., http on an https port) fails.
                # We will only log it on the server, not send it as a final error.
                print(f"Failed to capture {url}: {e}")
        
        # If all URLs failed
        return {
            "ip": ip,
            "port": port,
            "url": urls_to_try[0] if urls_to_try else f"{ip}:{port}",
            "screenshot_filename": None,
            "error": "Could not connect to the service or page timed out."
        }

    def cancel(self):
        self.is_cancelled = True

def register_screenshot_routes(app, socketio):
    @app.route('/api/screenshots/capture', methods=['POST'])
    def start_capture():
        data = request.json
        project_id = data.get('project_id')
        web_services = data.get('web_services', [])

        if not project_id or not web_services:
            return jsonify({'success': False, 'error': 'Project ID and web services are required'}), 400

        session_id = str(uuid.uuid4())
        capture_instance = ScreenshotCapture(project_id, session_id, socketio)
        screenshot_sessions[session_id] = capture_instance

        # Run capture in a background thread
        thread = threading.Thread(target=capture_instance.capture_screenshots, args=(web_services,))
        thread.daemon = True
        thread.start()

        return jsonify({'success': True, 'session_id': session_id})

    @app.route('/api/screenshots/cancel', methods=['POST'])
    def cancel_capture():
        data = request.json
        session_id = data.get('session_id')
        if session_id in screenshot_sessions:
            screenshot_sessions[session_id].cancel()
            return jsonify({'success': True, 'message': 'Cancellation request sent.'})
        return jsonify({'success': False, 'error': 'Session not found.'}), 404

    @app.route('/api/screenshots/<project_id>/<filename>')
    def get_screenshot_file(project_id, filename):
        # Security check: ensure filename is clean
        if '..' in filename or filename.startswith('/'):
            return "Invalid filename", 400
        
        project_dir = Path('data/projects')
        project_folder = next((p for p in project_dir.iterdir() if p.is_dir() and p.name.startswith(project_id)), None)
        
        if not project_folder:
            return "Project not found", 404
            
        screenshot_path = project_folder / 'screenshots'
        return send_from_directory(screenshot_path, filename)
        
    # WebSocket handlers for screenshots
    @socketio.on('join_screenshot_session')
    def handle_join_screenshot(data):
        session_id = data.get('session_id')
        if session_id:
            from flask_socketio import join_room
            join_room(session_id)
            print(f"Client joined screenshot session: {session_id}")