# 🛡️ Enhanced Nmap GUI Tool

A powerful, project-based, web-frontend for the Nmap network scanner. This tool provides an intuitive graphical interface to simplify network scanning, organize results, and streamline security assessments.

It is designed for security professionals, network administrators, and cybersecurity enthusiasts who want to leverage the power of Nmap without constantly managing command-line flags and raw output files.

## ✨ Key Features

*   **🚀 Real-Time Scanning:** View scan progress, live results, and host status in real-time as Nmap runs.
*   **📂 Project-Based Organization:** Group scans into projects with associated metadata (e.g., Project Manager, Assessment Type). Load and review historical scan data at any time.
*   **🎯 Flexible Target Input:** Supports multiple target formats:
    *   Single IPs (`192.168.1.1`)
    *   CIDR notation (`192.168.1.0/24`)
    *   IP Ranges (`192.168.1.10-20`)
    *   IPs with specific ports (`10.0.0.1:80,443`)
    *   File upload for bulk targets (`.txt`, `.csv`).
*   **⚙️ Comprehensive Scan Configuration:** Easily configure complex Nmap scans through a simple UI, including:
    *   Scan templates (Fast, Comprehensive, Vulnerability, etc.)
    *   Timing templates (T0-T5)
    *   Service & OS detection, script scanning, and more.
*   **👁️ Live Command Preview:** See the exact Nmap command that will be executed before you start the scan.
*   **📊 Interactive Results Dashboard:**
    *   **Summary View:** Get a high-level overview of hosts up/down, open ports, and discovered services.
    *   **Detailed View:** Dive into host-specific results, including open ports, services, versions, and script output.
    *   **Dynamic Filtering:** Instantly filter results by IP, service, port state, or host status.
*   **💾 Template Management:** Save your favorite scan configurations as custom templates for repeatable assessments.
*   **▶️ Scan Resume:** Load incomplete projects and resume scanning the remaining targets with the original settings.
*   **📤 Easy Exporting:** Export aggregated project results to JSON for integration with other tools.

##  Prerequisites

Before you begin, ensure you have the following installed on your system:

1.  **Python:** Version 3.8 or higher.
2.  **Nmap:** The core scanning engine.

## 🛠️ Installation

Installation is straightforward using the provided scripts.

1.  **Clone the repository:**
    ```sh
    git clone https://github.com/your-username/enhanced-nmap-gui.git
    cd enhanced-nmap-gui
    ```

2.  **Run the installation script for your OS:**

    *   **Windows:**
        Double-click `install.bat` or run it from the command prompt:
        ```cmd
        install.bat
        ```

    *   **Linux / macOS:**
        Make the script executable and run it:
        ```sh
        chmod +x install.sh
        bash install.sh
        ```
    The script will create a Python virtual environment (`venv`), activate it, and install all the necessary dependencies.

### Manual Installation (Alternative)

If you prefer to install manually:```sh
# Create and activate a virtual environment
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate.bat

# Install dependencies
pip install -r requirements.txt```

## 🚀 How to Use

1.  **Start the Application:**
    *   **Windows:** Double-click the `start.py` file.
    *   **Linux / macOS:** Run the start script from your terminal:
        ```sh
        python3 start.py
        ```
    The script will start the backend server, and your default web browser should automatically open to `http://localhost:5000`.

2.  **Perform Your First Scan (Quick Start):**
    *   **Enter Targets:** In the "Target Input" section on the left, type your target IPs into the "Manual" tab (e.g., `scanme.nmap.org` or `192.168.1.0/24`).
    *   **Create a Project:** In the "Project Configuration" section, give your scan a unique "Project Name".
    *   **Configure Scan:** In the "Scan Configuration" section, select a "Scan Template" (e.g., "Comprehensive Scan") or customize the options as needed.
    *   **Start Scan:** Click the big "Start Scan" button.
    *   **View Results:** Watch the results appear in real-time on the right-hand panel!

## 📁 Project Structure

The project is organized into a clean client-server architecture.

```
enhanced-nmap-gui/
├── backend/                # Flask server, API, and Nmap logic
│   ├── __init__.py
│   ├── app.py              # Main Flask app, API routes, WebSockets
│   ├── config.py           # Configuration management
│   ├── nmap_scanner.py     # Nmap process wrapper and XML parser
│   └── analyser.py         # (Placeholder for future analysis)
├── frontend/               # All UI files (HTML, CSS, JS)
│   ├── index.html          # The single-page application layout
│   ├── css/
│   └── js/
│       ├── main.js         # Core app initialization, global state
│       ├── projects.js     # Project and template management
│       ├── results.js      # Rendering and filtering scan results
│       ├── scanner.js      # Scan configuration and execution logic
│       └── utils.js        # Shared helper functions
├── data/                   # (Created at runtime) Stores projects, templates
├── install.bat             # Installation script for Windows
├── install.sh              # Installation script for Linux/macOS
├── start.py                # Main application entry point
└── requirements.txt        # Python dependencies
```

## 💻 Technology Stack

*   **Backend:** Python, Flask, Flask-SocketIO, Eventlet
*   **Frontend:** Vanilla JavaScript (ES6), HTML5, CSS3, Socket.IO-Client
*   **Core Engine:** Nmap
