import streamlit as st
import requests
import json
import time
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
from datetime import datetime
import os
import glob
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configuration
API_BASE_URL = "http://localhost:3000/rgt-expense/api/v1"
SUPPORTED_FILE_TYPES = ["pdf", "png", "jpg", "jpeg", "tiff"]
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB

# Page configuration
st.set_page_config(
    page_title="Document Processing Interface",
    page_icon="📄",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Custom CSS for better styling
st.markdown("""
<style>
    .main-header {
        font-size: 2.5rem;
        font-weight: bold;
        color: #1f77b4;
        text-align: center;
        margin-bottom: 2rem;
    }
    .section-header {
        font-size: 1.5rem;
        font-weight: bold;
        color: #2e8b57;
        margin-top: 2rem;
        margin-bottom: 1rem;
    }
    .status-box {
        padding: 1rem;
        border-radius: 0.5rem;
        margin: 1rem 0;
    }
    .status-success {
        background-color: #d4edda;
        border: 1px solid #c3e6cb;
        color: #155724;
    }
    .status-error {
        background-color: #f8d7da;
        border: 1px solid #f5c6cb;
        color: #721c24;
    }
    .status-warning {
        background-color: #fff3cd;
        border: 1px solid #ffeaa7;
        color: #856404;
    }
    .status-info {
        background-color: #d1ecf1;
        border: 1px solid #bee5eb;
        color: #0c5460;
    }
</style>
""", unsafe_allow_html=True)

def get_available_countries():
    """Get list of available countries from the data directory"""
    try:
        # Get all JSON files in the data directory
        data_files = glob.glob("data/*.json")
        countries = []

        for file_path in data_files:
            # Extract country name from filename (remove .json extension and capitalize)
            country_name = os.path.basename(file_path).replace('.json', '').replace('_', ' ').title()
            countries.append(country_name)

        # Sort countries alphabetically
        countries.sort()

        # If no countries found, return a default list
        if not countries:
            return ["Germany", "Austria", "Italy", "Switzerland"]

        return countries
    except Exception as e:
        st.error(f"Error loading countries from data directory: {e}")
        # Return default countries as fallback
        return ["Germany", "Austria", "Italy", "Switzerland"]

def check_api_health():
    """Check if the API is accessible"""
    try:
        response = requests.get(f"{API_BASE_URL}/health", timeout=5)
        return response.status_code == 200, response.json() if response.status_code == 200 else None
    except Exception as e:
        return False, str(e)

def upload_document(file, user_id, country, icp, document_reader):
    """Upload document for processing"""
    try:
        files = {"file": (file.name, file.getvalue(), file.type)}
        data = {
            "userId": user_id,
            "country": country,
            "icp": icp,
            "documentReader": document_reader
        }
        
        response = requests.post(
            f"{API_BASE_URL}/documents/process",
            files=files,
            data=data,
            timeout=30
        )
        
        return response.status_code, response.json()
    except Exception as e:
        return 500, {"error": str(e)}

def get_job_status(job_id):
    """Get job processing status"""
    try:
        response = requests.get(f"{API_BASE_URL}/documents/status/{job_id}", timeout=10)
        return response.status_code, response.json()
    except Exception as e:
        return 500, {"error": str(e)}

def get_job_results(job_id):
    """Get job processing results"""
    try:
        response = requests.get(f"{API_BASE_URL}/documents/results/{job_id}", timeout=10)
        return response.status_code, response.json()
    except Exception as e:
        return 500, {"error": str(e)}

def get_compliance_results(job_id):
    """Get compliance results from the new filtered endpoint"""
    try:
        response = requests.get(f"{API_BASE_URL}/documents/compliance/{job_id}", timeout=10)
        return response.status_code, response.json()
    except Exception as e:
        return 500, {"error": str(e)}

def get_job_list(status_filter=None, user_filter=None, limit=10):
    """Get list of processing jobs"""
    try:
        params = {"limit": limit, "offset": 0}
        if status_filter:
            params["status"] = status_filter
        if user_filter:
            params["userId"] = user_filter
            
        response = requests.get(f"{API_BASE_URL}/documents/jobs", params=params, timeout=10)
        return response.status_code, response.json()
    except Exception as e:
        return 500, {"error": str(e)}

def main():
    # Header
    st.markdown('<div class="main-header">📄 Document Processing Interface</div>', unsafe_allow_html=True)
    
    # Sidebar for navigation
    st.sidebar.title("Navigation")
    page = st.sidebar.selectbox(
        "Choose a page",
        ["🏠 Home", "📤 Document Processing", "📋 Job History", "🔧 System Health"]
    )
    
    # API Health Check
    is_healthy, health_data = check_api_health()
    if is_healthy:
        st.sidebar.success("✅ API is online")
    else:
        st.sidebar.error("❌ API is offline")
        st.error("⚠️ Cannot connect to the API. Please ensure the service is running on http://localhost:3000")
        return
    
    # Page routing
    if page == "🏠 Home":
        show_home_page()
    elif page == "📤 Document Processing":
        show_document_processing_page()
    elif page == "📋 Job History":
        show_history_page()
    elif page == "🔧 System Health":
        show_health_page(health_data)

def show_home_page():
    """Home page with overview and quick actions"""
    st.markdown('<div class="section-header">Welcome to Document Processing</div>', unsafe_allow_html=True)
    
    col1, col2 = st.columns(2)
    
    with col1:
        st.markdown("""
        ### 🚀 Features
        - **Dual Processing Engines**: Choose between LlamaParse and AWS Textract
        - **Real-time Monitoring**: Track processing progress in real-time
        - **Comprehensive Analysis**: Extract data, detect issues, generate citations
        - **Performance Metrics**: Detailed timing and performance analytics
        - **Multi-format Support**: PDF, PNG, JPG, JPEG, TIFF files
        """)
        
    with col2:
        st.markdown("""
        ### 📊 Processing Pipeline
        1. **Document Upload** - Upload your expense documents
        2. **Content Extraction** - Convert to markdown using AI/OCR
        3. **Data Extraction** - Extract structured expense data
        4. **Compliance Check** - Detect policy violations
        5. **Citation Generation** - Link data to source content
        """)
    
    # Quick stats
    st.markdown('<div class="section-header">Quick Stats</div>', unsafe_allow_html=True)
    
    # Get recent job statistics
    status_code, jobs_data = get_job_list(limit=50)
    if status_code == 200 and jobs_data.get("success"):
        jobs = jobs_data.get("data", {}).get("jobs", [])
        
        col1, col2, col3, col4 = st.columns(4)
        
        with col1:
            st.metric("Total Jobs", len(jobs))
        
        with col2:
            completed_jobs = len([j for j in jobs if j.get("status") == "completed"])
            st.metric("Completed", completed_jobs)
        
        with col3:
            failed_jobs = len([j for j in jobs if j.get("status") == "failed"])
            st.metric("Failed", failed_jobs)
        
        with col4:
            active_jobs = len([j for j in jobs if j.get("status") in ["waiting", "active"]])
            st.metric("Active", active_jobs)

def show_document_processing_page():
    """Combined document upload and status monitoring page"""
    st.markdown('<div class="section-header">Document Processing</div>', unsafe_allow_html=True)
    
    # Check if we have a current job being processed
    current_job_id = st.session_state.get("current_job_id", "")
    
    # Upload Document Section (Top)
    st.markdown("#### Upload Document")
    
    # Upload form
    with st.form("upload_form"):
        uploaded_file = st.file_uploader(
            "Choose a document file",
            type=SUPPORTED_FILE_TYPES,
            help=f"Supported formats: {', '.join(SUPPORTED_FILE_TYPES).upper()}. Max size: 50MB"
        )
        
        # Processing parameters in a more compact layout
        user_id = st.text_input(
            "User ID *",
            value="demo_user",
            help="Unique identifier for the user"
        )
        
        # Get available countries from data directory
        available_countries = get_available_countries()
        country = st.selectbox(
            "Country",
            available_countries,
            help="Country for compliance requirements"
        )
        
        col_a, col_b = st.columns(2)
        with col_a:
            document_reader = st.selectbox(
                "Document Reader",
                ["llamaparse", "textract"],
                help="Choose processing engine"
            )
        
        with col_b:
            icp = st.selectbox(
                "ICP Provider",
                ["Global People", "ADP", "Workday", "SAP"],
                help="ICP provider for compliance"
            )

        submitted = st.form_submit_button("🚀 Process Document", type="primary")

    # Handle form submission
    if submitted:
        if not uploaded_file:
            st.error("Please upload a file")
        elif not user_id:
            st.error("Please enter a User ID")
        else:
            # Check file size
            if uploaded_file.size > MAX_FILE_SIZE:
                st.error(f"File size ({uploaded_file.size / 1024 / 1024:.1f}MB) exceeds the 50MB limit")
            else:
                with st.spinner(f"🔄 Processing {uploaded_file.name}..."):
                    status_code, response = upload_document(
                        uploaded_file, user_id, country, icp, document_reader
                    )

                if status_code == 201 and response.get("success"):
                    job_id = response["data"]["jobId"]
                    st.success(f"🎉 Document uploaded successfully!")
                    st.info(f"Job ID: `{job_id}`")
                    
                    # Auto-fill the job ID for monitoring
                    st.session_state.current_job_id = job_id
                    st.session_state.auto_refresh = True
                    st.rerun()

                else:
                    st.error(f"❌ Upload failed: {response.get('message', 'Unknown error')}")

    # Job Status & Results Section (Bottom)
    st.markdown("---")  # Add separator
    st.markdown("#### Job Status & Results")
    
    # Job ID input with auto-filled value
    job_id = st.text_input(
        "Job ID",
        value=current_job_id,
        help="Enter job ID to monitor (auto-filled from upload)"
    )
    
    # Store the job ID in session state when changed
    if job_id != current_job_id:
        st.session_state.current_job_id = job_id
    
    # Auto-refresh controls
    col_x, col_y = st.columns([3, 1])
    with col_x:
        auto_refresh = st.checkbox(
            "Auto-refresh", 
            value=st.session_state.get("auto_refresh", False),
            help="Automatically refresh status every 5 seconds"
        )
    with col_y:
        if st.button("🔄 Refresh", help="Manual refresh"):
            st.rerun()

    # Store auto-refresh preference
    st.session_state.auto_refresh = auto_refresh

    if job_id:
        # Status monitoring section
        if auto_refresh:
            # Create placeholder for dynamic updates
            status_placeholder = st.empty()
            
            # Auto-refresh logic
            for i in range(60):  # Refresh for up to 5 minutes
                with status_placeholder.container():
                    show_job_status_compact(job_id)
                
                # Break if job is completed or failed
                status_code, response = get_job_status(job_id)
                if (status_code == 200 and response.get("success") and 
                    response["data"].get("status") in ["completed", "failed"]):
                    # Turn off auto-refresh when job is finished
                    st.session_state.auto_refresh = False
                    break
                
                time.sleep(5)
                
                # Check if user disabled auto-refresh
                if not st.session_state.get("auto_refresh", False):
                    break
        else:
            show_job_status_compact(job_id)

def show_job_status_compact(job_id):
    """Display compact job status for the combined page"""
    status_code, response = get_job_status(job_id)

    if status_code == 200 and response.get("success"):
        job_data = response["data"]
        status = job_data.get("status", "unknown")

        # Status indicator
        status_colors = {
            "waiting": "🟡",
            "active": "🔵", 
            "completed": "🟢",
            "failed": "🔴",
            "delayed": "🟠"
        }

        st.markdown(f"**Status:** {status_colors.get(status, '⚪')} {status.upper()}")

        # Progress information
        progress = job_data.get("progress", {})
        if progress:
            # Calculate overall progress percentage
            progress_items = [
                progress.get("fileClassification", False) or progress.get("file_classification", False),
                progress.get("dataExtraction", False) or progress.get("data_extraction", False),
                progress.get("issueDetection", False) or progress.get("issue_detection", False),
                progress.get("citationGeneration", False) or progress.get("citation_generation", False)
            ]
            completed_steps = sum(progress_items)
            progress_percent = (completed_steps / len(progress_items)) * 100
            
            st.progress(progress_percent / 100)
            st.caption(f"Progress: {completed_steps}/{len(progress_items)} steps ({progress_percent:.0f}%)")

        # Results preview for completed jobs
        if status == "completed":
            st.success("Processing completed!")
            
            # Get compliance results
            results_code, results_response = get_compliance_results(job_id)
            if results_code == 200 and results_response.get("success"):
                with st.expander("📊 View Results", expanded=True):
                    show_compliance_results(results_response["data"])
            else:
                st.error("Failed to load results")

        elif status == "failed":
            error_msg = job_data.get("error", "Unknown error")
            st.error(f"Processing failed: {error_msg}")

        # Timestamps
        created_at = job_data.get("createdAt")
        if created_at:
            st.caption(f"Created: {created_at}")

    else:
        st.error(f"Failed to get job status: {response.get('message', 'Unknown error') if response else 'Connection error'}")

def show_upload_page():
    """Document upload page"""
    st.markdown('<div class="section-header">Upload Document for Processing</div>', unsafe_allow_html=True)
    
    # Upload form
    with st.form("upload_form"):
        col1, col2 = st.columns([2, 1])
        
        with col1:
            uploaded_file = st.file_uploader(
                "Choose a document file",
                type=SUPPORTED_FILE_TYPES,
                help=f"Supported formats: {', '.join(SUPPORTED_FILE_TYPES).upper()}. Max size: 50MB"
            )
        
        with col2:
            st.markdown("### File Requirements")
            st.markdown("""
            - **Formats**: PDF, PNG, JPG, JPEG, TIFF
            - **Max Size**: 50MB
            - **Content**: Expense documents, receipts, invoices
            """)
        
        # Processing parameters
        st.markdown("### Processing Parameters")
        
        col1, col2 = st.columns(2)
        
        with col1:
            user_id = st.text_input(
                "User ID *",
                value="demo_user",
                help="Unique identifier for the user"
            )
            
            # Get available countries from data directory
            available_countries = get_available_countries()
            country = st.selectbox(
                "Country",
                available_countries,
                help="Country for compliance requirements (loaded from data directory)"
            )
        
        with col2:
            document_reader = st.selectbox(
                "Document Reader",
                ["llamaparse", "textract"],
                help="Choose the document processing engine"
            )
            
            icp = st.selectbox(
                "ICP Provider",
                ["Global People", "ADP", "Workday", "SAP"],
                help="ICP provider for compliance rules"
            )
        

        submitted = st.form_submit_button("🚀 Process Document", type="primary")

    # Handle form submission outside the form
    if submitted:
        if not uploaded_file:
            st.error("Please upload a file")
        elif not user_id:
            st.error("Please enter a User ID")
        else:
            # Check file size
            if uploaded_file.size > MAX_FILE_SIZE:
                st.error(f"File size ({uploaded_file.size / 1024 / 1024:.1f}MB) exceeds the 50MB limit")
            else:
                with st.spinner(f"🔄 Processing {uploaded_file.name} with {document_reader}..."):
                    status_code, response = upload_document(
                        uploaded_file, user_id, country, icp, document_reader
                    )

                if status_code == 201 and response.get("success"):
                    job_id = response["data"]["jobId"]
                    st.success(f"🎉 Document uploaded successfully! Job ID: `{job_id}`")

                    # Store job ID in session state for tracking
                    if "job_ids" not in st.session_state:
                        st.session_state.job_ids = []
                    st.session_state.job_ids.append(job_id)

                    # Store the latest job for navigation
                    st.session_state.latest_job_id = job_id

                    # Show navigation options outside the form
                    col1, col2 = st.columns(2)
                    with col1:
                        if st.button("📊 Monitor Progress", type="primary", key="monitor_btn"):
                            st.session_state.selected_job_id = job_id
                            st.session_state.page = "status"  # Navigate to status page
                            st.rerun()
                    with col2:
                        if st.button("📤 Upload Another", key="upload_another_btn"):
                            st.rerun()

                else:
                    st.error(f"❌ Upload failed: {response.get('message', 'Unknown error')}")
                    st.markdown("**Troubleshooting:**")
                    st.markdown("- Check if the API is running (`npm run start:dev`)")
                    st.markdown("- Verify file format and size")
                    st.markdown("- Try again in a few moments")

def show_status_page():
    """Job status monitoring page"""
    st.markdown('<div class="section-header">Job Status Monitoring</div>', unsafe_allow_html=True)

    # Job ID input
    col1, col2 = st.columns([3, 1])

    with col1:
        # Use selected job ID from upload page if available
        default_job_id = ""
        if st.session_state.get("selected_job_id"):
            default_job_id = st.session_state.selected_job_id
        elif st.session_state.get("job_ids"):
            default_job_id = st.session_state.job_ids[-1]  # Most recent job

        job_id = st.text_input(
            "Enter Job ID",
            value=default_job_id,
            help="Enter the job ID to monitor"
        )

    with col2:
        auto_refresh = st.checkbox("Auto-refresh", value=True)
        if auto_refresh:
            st.write("Refreshing every 5 seconds...")

    if job_id:
        # Create placeholder for dynamic updates
        status_placeholder = st.empty()
        progress_placeholder = st.empty()
        results_placeholder = st.empty()

        # Auto-refresh logic
        if auto_refresh:
            for i in range(60):  # Refresh for up to 5 minutes
                with status_placeholder.container():
                    show_job_status(job_id)

                time.sleep(5)
                if not auto_refresh:  # Check if user disabled auto-refresh
                    break
        else:
            show_job_status(job_id)

def show_job_status(job_id):
    """Display job status details"""
    status_code, response = get_job_status(job_id)

    if status_code == 200 and response.get("success"):
        job_data = response["data"]
        status = job_data.get("status", "unknown")

        # Status indicator
        status_colors = {
            "waiting": "🟡",
            "active": "🔵",
            "completed": "🟢",
            "failed": "🔴",
            "delayed": "🟠"
        }

        st.markdown(f"### {status_colors.get(status, '⚪')} Job Status: {status.upper()}")

        # Progress information
        progress = job_data.get("progress", {})
        if progress:
            st.markdown("#### Processing Progress")

            # Try different possible key formats for each step
            progress_items = [
                ("Markdown Extraction",
                 progress.get("markdownExtraction", False) or
                 progress.get("markdown_extraction", False) or
                 progress.get("markdown", False)),
                ("File Classification",
                 progress.get("fileClassification", False) or
                 progress.get("file_classification", False) or
                 progress.get("classification", False)),
                ("Data Extraction",
                 progress.get("dataExtraction", False) or
                 progress.get("data_extraction", False) or
                 progress.get("extraction", False)),
                ("Issue Detection",
                 progress.get("issueDetection", False) or
                 progress.get("issue_detection", False) or
                 progress.get("compliance", False)),
                ("Citation Generation",
                 progress.get("citationGeneration", False) or
                 progress.get("citation_generation", False) or
                 progress.get("citations", False))
            ]

            cols = st.columns(len(progress_items))
            for i, (step, completed) in enumerate(progress_items):
                with cols[i]:
                    icon = "✅" if completed else "⏳"
                    st.markdown(f"{icon} **{step}**")

        # Results preview
        if status == "completed":
            st.success("🎉 Processing completed successfully!")

            # Get compliance results from the new filtered endpoint
            results_code, results_response = get_compliance_results(job_id)
            if results_code == 200 and results_response.get("success"):
                show_compliance_results(results_response["data"])

        elif status == "failed":
            error_msg = job_data.get("error", "Unknown error")
            st.error(f"❌ Processing failed: {error_msg}")

        # Timestamps
        created_at = job_data.get("createdAt")
        updated_at = job_data.get("updatedAt")

        if created_at or updated_at:
            st.markdown("#### Timestamps")
            col1, col2 = st.columns(2)

            with col1:
                if created_at:
                    st.write(f"**Created:** {created_at}")

            with col2:
                if updated_at:
                    st.write(f"**Updated:** {updated_at}")

    else:
        st.error(f"❌ Failed to get job status: {response.get('message', 'Unknown error')}")

def show_compliance_results(results_data):
    """Display compliance results without tabs - only classification, extraction, and compliance issues"""
    st.markdown("### Compliance Analysis Results")

    # Show Classification Section
    if "classification" in results_data:
        st.markdown("### Classification")
        classification = results_data["classification"]

        if isinstance(classification, dict):
            # Show all classification data except schema field analysis
            schema_fields = ["schema_field_analysis", "field_analysis", "schema_analysis"]

            # Get all fields except schema
            all_fields = {k: v for k, v in classification.items() if k not in schema_fields and v is not None}

            if all_fields:
                # Separate reasoning from other fields
                reasoning_fields = ["classification_reason", "reason", "reasoning", "explanation"]
                reasoning_text = None
                display_fields = {}

                for key, value in all_fields.items():
                    if key in reasoning_fields:
                        reasoning_text = value
                    elif not isinstance(value, (dict, list)):  # Skip complex objects
                        display_fields[key] = value

                # Display main fields in a grid layout
                if display_fields:
                    # Create rows of 3 columns each
                    field_items = list(display_fields.items())

                    for i in range(0, len(field_items), 3):
                        cols = st.columns(3)

                        for j, col in enumerate(cols):
                            if i + j < len(field_items):
                                key, value = field_items[i + j]

                                # Format value without emojis
                                formatted_value = value

                                if "expense" in key.lower():
                                    if isinstance(value, bool):
                                        formatted_value = "Yes" if value else "No"
                                elif "score" in key.lower():
                                    if isinstance(value, (int, float)):
                                        formatted_value = f"{value:.2f}"
                                elif "confidence" in key.lower():
                                    if isinstance(value, (int, float)):
                                        # Check if value is already a percentage (0-100) or decimal (0-1)
                                        if value > 1:
                                            formatted_value = f"{value:.1f}%"
                                        else:
                                            formatted_value = f"{value:.1%}"
                                elif "match" in key.lower() or "location" in key.lower():
                                    if isinstance(value, bool):
                                        formatted_value = f"{value}"

                                field_name = key.replace('_', ' ').title()

                                with col:
                                    st.metric(
                                        label=field_name,
                                        value=str(formatted_value)
                                    )

                # Display reasoning text spanning full width
                if reasoning_text:
                    st.markdown("---")
                    st.markdown("#### **Classification Reasoning**")
                    st.markdown(f"*{reasoning_text}*")
        else:
            st.json(classification)

    # Show Extraction Section
    if "extraction" in results_data:
        st.markdown("### Extracted Data")
        extraction = results_data["extraction"]
        st.json(extraction)

    # Show Compliance Issues Section
    if "compliance" in results_data:
        st.markdown("### Compliance Issues")
        compliance = results_data["compliance"]

        if isinstance(compliance, dict):
            # Search for issues in the compliance structure
            issues = []

            # Check for validation_result.issues structure
            if "validation_result" in compliance:
                validation_result = compliance["validation_result"]
                if isinstance(validation_result, dict) and "issues" in validation_result:
                    issues = validation_result["issues"]

            # Ensure issues is a list
            if not isinstance(issues, list):
                issues = []

            # Display results
            if not issues:
                st.info("No compliance issues found")
            else:
                st.write(f"{len(issues)} compliance issue(s) detected")

                # Display all issues with simple formatting
                for i, issue in enumerate(issues, 1):
                    if isinstance(issue, dict):
                        # Get issue type
                        issue_type = issue.get("issue_type", issue.get("type", f"Issue {i}"))

                        # Simple display
                        st.markdown(f"**Issue Type:** {issue_type}")
                        
                        if "description" in issue:
                            st.markdown(f"**Description:** {issue['description']}")
                        
                        if "recommendation" in issue:
                            st.markdown(f"**Recommendation:** {issue['recommendation']}")

                        st.markdown("---")
                    else:
                        # Simple issue format
                        st.write(f"Issue {i}: {str(issue)}")
                        st.markdown("---")

        else:
            st.json(compliance)

def show_job_results(results_data):
    """Display detailed job results"""
    st.markdown("#### 📊 Processing Results")

    # Tabs for different result sections
    tabs = st.tabs(["📋 Classification", "📄 Extracted Data", "⚠️ Issues", "📎 Citations", "⏱️ Performance", "🔧 Full JSON"])

    with tabs[0]:  # Classification
        if "classification" in results_data:
            classification = results_data["classification"]

            if isinstance(classification, dict):
                # Show all classification data except schema field analysis
                schema_fields = ["schema_field_analysis", "field_analysis", "schema_analysis"]

                # Get all fields except schema
                all_fields = {k: v for k, v in classification.items() if k not in schema_fields and v is not None}

                if all_fields:
                    # Separate reasoning from other fields
                    reasoning_fields = ["classification_reason", "reason", "reasoning", "explanation"]
                    reasoning_text = None
                    display_fields = {}

                    for key, value in all_fields.items():
                        if key in reasoning_fields:
                            reasoning_text = value
                        elif not isinstance(value, (dict, list)):  # Skip complex objects
                            display_fields[key] = value

                    # Display main fields in a grid layout
                    if display_fields:
                        # Create rows of 3 columns each
                        field_items = list(display_fields.items())

                        for i in range(0, len(field_items), 3):
                            cols = st.columns(3)

                            for j, col in enumerate(cols):
                                if i + j < len(field_items):
                                    key, value = field_items[i + j]

                                    # Add appropriate emoji and format value
                                    emoji = ""
                                    formatted_value = value

                                    if "expense" in key.lower():
                                        emoji = "💰"
                                        if isinstance(value, bool):
                                            formatted_value = "✅ Yes" if value else "❌ No"
                                    elif "document" in key.lower() and "type" in key.lower():
                                        emoji = "📋"
                                    elif "type" in key.lower() and "expense" not in key.lower():
                                        emoji = "📂"
                                    elif "language" in key.lower():
                                        emoji = "🌐"
                                    elif "score" in key.lower():
                                        emoji = "🎯"
                                        if isinstance(value, (int, float)):
                                            formatted_value = f"{value:.2f}"
                                    elif "confidence" in key.lower():
                                        emoji = "📊"
                                        if isinstance(value, (int, float)):
                                            # Check if value is already a percentage (0-100) or decimal (0-1)
                                            if value > 1:
                                                formatted_value = f"{value:.1f}%"
                                            else:
                                                formatted_value = f"{value:.1%}"
                                    elif "quality" in key.lower():
                                        emoji = "⭐"
                                    elif "method" in key.lower():
                                        emoji = "🔧"
                                    elif "status" in key.lower():
                                        emoji = "✅"
                                    elif "category" in key.lower():
                                        emoji = "🏷️"
                                    elif "country" in key.lower():
                                        emoji = "🌍"
                                    elif "currency" in key.lower():
                                        emoji = "💱"
                                    elif "match" in key.lower() or "location" in key.lower():
                                        emoji = "📍"
                                        if isinstance(value, bool):
                                            formatted_value = f"{'✅' if value else '❌'} {value}"
                                    else:
                                        emoji = "📝"

                                    field_name = key.replace('_', ' ').title()

                                    with col:
                                        st.metric(
                                            label=f"{emoji} {field_name}",
                                            value=str(formatted_value)
                                        )

                    # Display reasoning text spanning full width
                    if reasoning_text:
                        st.markdown("---")
                        st.markdown("### 🔍 **Classification Reasoning**")
                        st.markdown(f"*{reasoning_text}*")

                # Schema field analysis in dropdown
                schema_data = {k: v for k, v in classification.items() if k in schema_fields and v is not None}
                if schema_data:
                    with st.expander("🔧 Schema Field Analysis"):
                        for key, value in schema_data.items():
                            st.markdown(f"**{key.replace('_', ' ').title()}:**")
                            if isinstance(value, dict):
                                st.json(value)
                            else:
                                st.write(value)
            else:
                st.json(classification)

    with tabs[1]:  # Extracted Data
        if "extraction" in results_data:
            extraction = results_data["extraction"]
            st.markdown("**💰 Extracted Expense Data**")

            if isinstance(extraction, dict):
                # Separate line items from other fields
                line_items_fields = ["line_items", "items", "invoice_items", "expense_items", "receipt_items", "products", "services"]
                line_items_data = None
                other_fields = {}
                nested_fields = {}

                for key, value in extraction.items():
                    if key in line_items_fields and value:
                        line_items_data = value
                    elif isinstance(value, (dict, list)) and key not in line_items_fields:
                        # Handle nested objects/arrays that aren't line items
                        nested_fields[key] = value
                    elif value and str(value).strip():
                        other_fields[key] = value

                # Display main expense fields
                if other_fields:
                    st.markdown("#### 📋 Main Expense Information")
                    display_data = []
                    for key, value in other_fields.items():
                        field_name = key.replace('_', ' ').title()
                        display_data.append({"Field": field_name, "Value": str(value)})

                    import pandas as pd
                    df = pd.DataFrame(display_data)
                    st.dataframe(df, use_container_width=True, hide_index=True)

                # Display line items separately
                if line_items_data:
                    st.markdown("#### 🛒 Line Items")

                    if isinstance(line_items_data, list):
                        # Create a table for line items
                        line_items_table = []
                        for i, item in enumerate(line_items_data, 1):
                            if isinstance(item, dict):
                                row = {"#": i}
                                for key, value in item.items():
                                    field_name = key.replace('_', ' ').title()
                                    row[field_name] = str(value) if value else ""
                                line_items_table.append(row)
                            else:
                                line_items_table.append({"#": i, "Item": str(item)})

                        if line_items_table:
                            df_items = pd.DataFrame(line_items_table)
                            st.dataframe(df_items, use_container_width=True, hide_index=True)
                    else:
                        st.write(str(line_items_data))

                # Display nested fields (objects/arrays that aren't line items)
                if nested_fields:
                    st.markdown("#### 🔧 Complex Fields")
                    for key, value in nested_fields.items():
                        field_name = key.replace('_', ' ').title()
                        with st.expander(f"📋 {field_name}"):
                            if isinstance(value, dict):
                                # Display as key-value pairs
                                nested_data = []
                                for sub_key, sub_value in value.items():
                                    nested_data.append({
                                        "Field": sub_key.replace('_', ' ').title(),
                                        "Value": str(sub_value) if sub_value is not None else ""
                                    })
                                if nested_data:
                                    import pandas as pd
                                    df_nested = pd.DataFrame(nested_data)
                                    st.dataframe(df_nested, use_container_width=True, hide_index=True)
                            elif isinstance(value, list):
                                # Display as numbered list or table
                                if value and isinstance(value[0], dict):
                                    # Table format for list of objects
                                    import pandas as pd
                                    df_list = pd.DataFrame(value)
                                    st.dataframe(df_list, use_container_width=True, hide_index=True)
                                else:
                                    # Simple list
                                    for i, item in enumerate(value, 1):
                                        st.write(f"{i}. {item}")
                            else:
                                st.write(str(value))

                if not other_fields and not line_items_data and not nested_fields:
                    st.info("No extracted data available")
            else:
                st.json(extraction)

    with tabs[2]:  # Issues
        if "compliance" in results_data:
            compliance = results_data["compliance"]
            st.markdown("**⚠️ Compliance Analysis**")

            if isinstance(compliance, dict):
                # Search for issues in the compliance structure
                issues = []

                # Check for validation_result.issues structure (based on your debug info)
                if "validation_result" in compliance:
                    validation_result = compliance["validation_result"]
                    if isinstance(validation_result, dict) and "issues" in validation_result:
                        issues = validation_result["issues"]

                # If not found, check other possible locations
                if not issues:
                    possible_issue_keys = [
                        "issues", "compliance_issues", "violations", "detected_issues",
                        "policy_violations", "rule_violations", "findings", "alerts"
                    ]

                    for key in possible_issue_keys:
                        if key in compliance and compliance[key]:
                            if isinstance(compliance[key], list):
                                issues.extend(compliance[key])
                                break
                            elif isinstance(compliance[key], dict):
                                # If it's a dict, check if it contains issue-like data
                                for sub_key, sub_value in compliance[key].items():
                                    if isinstance(sub_value, list) and sub_key == "issues":
                                        issues.extend(sub_value)
                                        break

                # Ensure issues is a list
                if not isinstance(issues, list):
                    issues = []

                # Display results
                if not issues:
                    st.success("✅ No compliance issues found!")
                else:
                    st.warning(f"⚠️ {len(issues)} compliance issue(s) detected")

                    # Display all issues with better formatting
                    for i, issue in enumerate(issues, 1):
                        if isinstance(issue, dict):
                            # Get issue type and format it nicely
                            issue_type = issue.get("issue_type", issue.get("type", f"Issue {i}"))

                            # Create a nice container for each issue
                            with st.container():
                                # Bold issue type as header with smaller font
                                st.markdown(f"#### 🚨 **{issue_type}**")

                                # Display main issue info
                                col1, col2 = st.columns([3, 1])

                                with col1:
                                    if "description" in issue:
                                        st.markdown(f"**📝 Description**")
                                        st.write(issue['description'])

                                    if "field" in issue:
                                        st.markdown(f"**🎯 Affected Field**")
                                        st.code(issue['field'])

                                with col2:
                                    if "severity" in issue:
                                        severity = issue["severity"].lower()
                                        severity_icon = {
                                            "high": "🔴", "critical": "🔴", "error": "🔴",
                                            "medium": "🟡", "warning": "🟡",
                                            "low": "🟢", "info": "🟢", "minor": "🟢"
                                        }.get(severity, "⚪")
                                        st.metric("Severity", f"{severity_icon} {issue['severity']}")

                                # Recommendation in a special colored box
                                if "recommendation" in issue:
                                    with st.expander("💡 **Recommendation**", expanded=False):
                                        st.success(issue["recommendation"])

                                # Knowledge base reference (other fields)
                                other_fields = {k: v for k, v in issue.items()
                                              if k not in ["issue_type", "type", "description", "field", "severity", "recommendation"]
                                              and v and str(v).strip()}

                                if other_fields:
                                    with st.expander("📚 **Knowledge Base Reference**", expanded=False):
                                        for key, value in other_fields.items():
                                            field_name = key.replace('_', ' ').title()
                                            st.markdown(f"**{field_name}:**")
                                            st.info(str(value))

                                st.divider()
                        else:
                            # Simple issue format
                            st.markdown(f"### 🚨 **Issue {i}**")
                            st.write(str(issue))
                            st.divider()

                # Summary metrics if available
                summary_keys = ["summary", "compliance_summary", "analysis_summary"]
                for summary_key in summary_keys:
                    if summary_key in compliance and isinstance(compliance[summary_key], dict):
                        summary = compliance[summary_key]
                        st.markdown("#### 📊 Compliance Summary")

                        summary_data = []
                        for key, value in summary.items():
                            if value is not None:
                                field_name = key.replace('_', ' ').title()
                                summary_data.append({"Metric": field_name, "Value": str(value)})

                        if summary_data:
                            import pandas as pd
                            df_summary = pd.DataFrame(summary_data)
                            st.dataframe(df_summary, use_container_width=True, hide_index=True)
                        break
            else:
                st.json(compliance)

    with tabs[3]:  # Citations
        if "citations" in results_data:
            citations = results_data["citations"]
            st.markdown("**📎 Generated Citations**")

            if isinstance(citations, dict):
                # Look for citations in various possible structures
                citation_data = None
                citation_mapping = {}

                # Check different possible citation structures
                possible_citation_keys = [
                    "citations", "field_citations", "source_citations", "data_citations",
                    "field_mapping", "source_mapping", "citation_mapping"
                ]

                for key in possible_citation_keys:
                    if key in citations and citations[key]:
                        citation_data = citations[key]
                        break

                # If no structured citations found, check if the whole object is citation data
                if not citation_data and citations:
                    # Check if citations object itself contains field mappings
                    potential_fields = 0
                    for key, value in citations.items():
                        if isinstance(value, dict) and any(field in value for field in ["source", "text", "page", "confidence", "location"]):
                            potential_fields += 1

                    if potential_fields > 0:
                        citation_data = citations

                if citation_data and isinstance(citation_data, dict):
                    st.markdown("#### 🔗 **Field Citations**")

                    # Display citations in a clean card format
                    citation_count = 0
                    for field, citation_info in citation_data.items():
                        if citation_info:  # Only show non-empty citations
                            citation_count += 1
                            field_name = field.replace('_', ' ').title()

                            # Add appropriate emoji for field type
                            emoji = ""
                            if "vendor" in field.lower() or "company" in field.lower():
                                emoji = "🏢"
                            elif "amount" in field.lower() or "total" in field.lower():
                                emoji = "💰"
                            elif "date" in field.lower():
                                emoji = "📅"
                            elif "invoice" in field.lower() or "receipt" in field.lower():
                                emoji = "📄"
                            elif "address" in field.lower():
                                emoji = "📍"
                            elif "tax" in field.lower():
                                emoji = "🧾"
                            else:
                                emoji = "📝"

                            # Create a nice card for each citation
                            with st.container():
                                st.markdown(f"**{emoji} {field_name}**")

                                if isinstance(citation_info, dict):
                                    # Handle the nested citation structure (field_citation and value_citation)
                                    if "field_citation" in citation_info or "value_citation" in citation_info:
                                        # Display field citation
                                        if "field_citation" in citation_info and citation_info["field_citation"]:
                                            field_cite = citation_info["field_citation"]
                                            st.markdown("**🏷️ Field Citation**")
                                            if "source_text" in field_cite:
                                                st.info(f'"{field_cite["source_text"]}"')

                                            col1, col2 = st.columns(2)
                                            with col1:
                                                if "confidence" in field_cite:
                                                    st.metric("🎯 Confidence", f"{field_cite['confidence']:.1%}")
                                            with col2:
                                                if "source_location" in field_cite:
                                                    st.metric("📍 Source", field_cite["source_location"])

                                        # Display value citation
                                        if "value_citation" in citation_info and citation_info["value_citation"]:
                                            value_cite = citation_info["value_citation"]
                                            st.markdown("**💎 Value Citation**")
                                            if "source_text" in value_cite:
                                                st.success(f'"{value_cite["source_text"]}"')

                                            col1, col2 = st.columns(2)
                                            with col1:
                                                if "confidence" in value_cite:
                                                    st.metric("🎯 Confidence", f"{value_cite['confidence']:.1%}")
                                            with col2:
                                                if "source_location" in value_cite:
                                                    st.metric("📍 Source", value_cite["source_location"])
                                    else:
                                        # Fallback for other citation formats
                                        source_text = None
                                        if "source_text" in citation_info:
                                            source_text = citation_info["source_text"]
                                        elif "text" in citation_info:
                                            source_text = citation_info["text"]
                                        elif "source" in citation_info:
                                            source_text = str(citation_info["source"])

                                        if source_text:
                                            st.markdown("**📄 Source Text**")
                                            st.info(f'"{source_text}"')

                                        # Citation metadata
                                        col1, col2, col3 = st.columns(3)

                                        with col1:
                                            if "confidence" in citation_info:
                                                conf = citation_info["confidence"]
                                                if isinstance(conf, (int, float)):
                                                    st.metric("🎯 Confidence", f"{conf:.1%}")

                                        with col2:
                                            if "page" in citation_info:
                                                st.metric("📄 Page", citation_info["page"])

                                        with col3:
                                            if "location" in citation_info:
                                                st.metric("📍 Location", citation_info["location"])
                                else:
                                    # Simple text citation
                                    st.markdown("**📄 Source**")
                                    source_text = str(citation_info)
                                    st.info(f'"{source_text}"')

                                st.divider()

                    if citation_count == 0:
                        st.info("No citation mappings found")

                # Citation statistics
                stats_keys = ["statistics", "citation_stats", "summary"]
                for stats_key in stats_keys:
                    if stats_key in citations and isinstance(citations[stats_key], dict):
                        stats = citations[stats_key]
                        st.markdown("#### 📊 Citation Statistics")

                        stats_data = []
                        for key, value in stats.items():
                            if value is not None:
                                field_name = key.replace('_', ' ').title()
                                if isinstance(value, (int, float)) and "confidence" in key.lower():
                                    formatted_value = f"{value:.1%}"
                                else:
                                    formatted_value = str(value)
                                stats_data.append({"Metric": field_name, "Value": formatted_value})

                        if stats_data:
                            import pandas as pd
                            df_stats = pd.DataFrame(stats_data)
                            st.dataframe(df_stats, use_container_width=True, hide_index=True)
                        break

                # If no citations found at all
                if not citation_data:
                    st.info("No citations found in the response")
            else:
                st.json(citations)

    with tabs[4]:  # Performance
        if "timing" in results_data:
            timing = results_data["timing"]
            show_performance_metrics(timing)

    with tabs[5]:  # Full JSON
        st.markdown("**🔧 Complete Raw Results**")
        st.markdown("This tab shows the complete, unprocessed JSON response from the API.")
        st.json(results_data)

def show_performance_metrics(timing_data):
    """Display performance metrics and charts"""
    st.markdown("**Processing Performance**")

    # Phase timings
    if "phase_timings" in timing_data:
        phase_timings = timing_data["phase_timings"]

        # Convert to DataFrame for visualization
        phases = []
        times = []

        for phase, time_str in phase_timings.items():
            if time_str:  # Skip None values
                phase_name = phase.replace("_", " ").title()
                phases.append(phase_name)
                times.append(float(time_str))

        if phases and times:
            df = pd.DataFrame({"Phase": phases, "Time (minutes)": times})

            # Bar chart
            fig = px.bar(df, x="Phase", y="Time (minutes)",
                        title="Processing Time by Phase",
                        color="Time (minutes)",
                        color_continuous_scale="viridis")
            fig.update_layout(xaxis_tickangle=45)
            # Use a unique key with session state counter
            if "chart_counter" not in st.session_state:
                st.session_state.chart_counter = 0
            st.session_state.chart_counter += 1
            chart_key = f"performance_timing_chart_{st.session_state.chart_counter}"
            st.plotly_chart(fig, use_container_width=True, key=chart_key)

            # Summary metrics
            col1, col2, col3 = st.columns(3)

            with col1:
                total_time = timing_data.get("total_processing_time_seconds", "0")
                st.metric("Total Time", f"{total_time}s")

            with col2:
                fastest_phase = min(zip(phases, times), key=lambda x: x[1])
                st.metric("Fastest Phase", f"{fastest_phase[0]}: {fastest_phase[1]:.1f}s")

            with col3:
                slowest_phase = max(zip(phases, times), key=lambda x: x[1])
                st.metric("Slowest Phase", f"{slowest_phase[0]}: {slowest_phase[1]:.1f}s")

            # Display timing validation if available
            if "validation" in timing_data:
                validation = timing_data["validation"]
                st.markdown("---")
                st.markdown("### ⚖️ **Timing Validation**")

                col1, col2, col3, col4 = st.columns(4)

                with col1:
                    is_consistent = validation.get("is_consistent", False)
                    status_icon = "✅" if is_consistent else "❌"
                    status_text = "Consistent" if is_consistent else "Inconsistent"
                    st.metric(f"{status_icon} Status", status_text)

                with col2:
                    phase_sum = validation.get("phase_sum_seconds", validation.get("sequential_sum_seconds", "0"))
                    st.metric("📊 Phase Sum", f"{phase_sum}s")

                with col3:
                    difference = validation.get("difference_seconds", "0")
                    st.metric("📏 Difference", f"{difference}s")

                with col4:
                    tolerance = validation.get("tolerance_seconds", "3.0")
                    st.metric("🎯 Tolerance", f"{tolerance}s")

                # Show warning if inconsistent
                if not is_consistent:
                    total_time = validation.get('total_time_seconds', 'N/A')
                    expected_time = validation.get('expected_parallel_time_seconds', validation.get('phase_sum_seconds', 'N/A'))
                    st.warning(f"⚠️ Timing inconsistency detected! Total time ({total_time}s) doesn't match expected time ({expected_time}s)")

                # Show error if validation failed
                if "error" in validation:
                    st.error(f"❌ Timing validation error: {validation['error']}")

            # Display parallel processing metrics if available
            if "performance_metrics" in timing_data:
                metrics = timing_data["performance_metrics"]
                st.markdown("---")
                st.markdown("### 🚀 **Parallel Processing Performance**")

                col1, col2, col3, col4 = st.columns(4)

                with col1:
                    group1_time = metrics.get("parallel_group_1_seconds", "N/A")
                    st.metric("⚡ Group 1 Time", f"{group1_time}s")

                with col2:
                    group2_time = metrics.get("parallel_group_2_seconds", "N/A")
                    st.metric("⚡ Group 2 Time", f"{group2_time}s")

                with col3:
                    speedup = metrics.get("estimated_speedup_factor", "N/A")
                    st.metric("🏃 Speedup Factor", f"{speedup}x")

                with col4:
                    sequential_time = metrics.get("estimated_sequential_time_seconds", "N/A")
                    st.metric("🐌 Est. Sequential", f"{sequential_time}s")

                # Show optimization info if available
                if "metadata" in timing_data.get("../", {}) and "optimization" in timing_data["../"]["metadata"]:
                    opt_info = timing_data["../"]["metadata"]["optimization"]
                    if opt_info.get("parallel_processing"):
                        st.success("✅ This document was processed using parallel optimization!")
                        estimated_savings = float(opt_info.get("estimated_sequential_time_minutes", 0)) - float(opt_info.get("actual_parallel_time_minutes", 0))
                        if estimated_savings > 0:
                            st.info(f"⏱️ Estimated time saved: {estimated_savings:.2f} minutes ({estimated_savings*60:.1f} seconds)")

def show_history_page():
    """Job history page"""
    st.markdown('<div class="section-header">Job History</div>', unsafe_allow_html=True)

    # Filters
    col1, col2, col3 = st.columns(3)

    with col1:
        status_filter = st.selectbox(
            "Filter by Status",
            ["All", "waiting", "active", "completed", "failed", "delayed"]
        )

    with col2:
        user_filter = st.text_input("Filter by User ID")

    with col3:
        limit = st.number_input("Number of Jobs", min_value=5, max_value=100, value=20)

    # Get jobs
    status_param = None if status_filter == "All" else status_filter
    user_param = user_filter if user_filter else None

    status_code, response = get_job_list(status_param, user_param, limit)

    if status_code == 200 and response.get("success"):
        jobs_data = response.get("data", {})
        jobs = jobs_data.get("jobs", [])

        if jobs:
            # Convert to DataFrame
            df_data = []
            for job in jobs:
                df_data.append({
                    "Job ID": job.get("jobId", ""),
                    "Status": job.get("status", ""),
                    "Created": job.get("createdAt", ""),
                    "Updated": job.get("updatedAt", ""),
                    "Error": job.get("error", "")[:50] + "..." if job.get("error") and len(job.get("error", "")) > 50 else job.get("error", "")
                })

            df = pd.DataFrame(df_data)

            # Display table
            st.dataframe(df, use_container_width=True)

            # Status distribution chart
            if len(jobs) > 1:
                status_counts = df["Status"].value_counts()
                fig = px.pie(values=status_counts.values, names=status_counts.index,
                           title="Job Status Distribution")
                # Use a unique key with session state counter
                if "chart_counter" not in st.session_state:
                    st.session_state.chart_counter = 0
                st.session_state.chart_counter += 1
                chart_key = f"job_status_distribution_chart_{st.session_state.chart_counter}"
                st.plotly_chart(fig, use_container_width=True, key=chart_key)
        else:
            st.info("No jobs found matching the criteria")
    else:
        st.error(f"Failed to get job history: {response.get('message', 'Unknown error')}")

def show_health_page(health_data):
    """System health page"""
    st.markdown('<div class="section-header">System Health</div>', unsafe_allow_html=True)

    if health_data:
        # Overall status
        status = health_data.get("status", "unknown")
        if status == "healthy":
            st.success(f"✅ System Status: {status.upper()}")
        else:
            st.error(f"❌ System Status: {status.upper()}")

        # System info
        col1, col2 = st.columns(2)

        with col1:
            st.markdown("#### System Information")
            system_info = health_data.get("system", {})
            if system_info:
                st.write(f"**Memory Usage:** {system_info.get('memoryUsage', 'N/A')}")
                st.write(f"**Uptime:** {health_data.get('uptime', 'N/A')}")

        with col2:
            st.markdown("#### Environment")
            env_info = health_data.get("environment", {})
            if env_info:
                st.write(f"**Node Environment:** {env_info.get('NODE_ENV', 'N/A')}")
                st.write(f"**Port:** {env_info.get('PORT', 'N/A')}")
                st.write(f"**Document Reader:** {env_info.get('DOCUMENT_READER', 'N/A')}")

        # Connections
        st.markdown("#### Connection Status")
        connections = health_data.get("connections", {})

        if connections:
            col1, col2 = st.columns(2)

            with col1:
                redis_status = connections.get("redis", {})
                if redis_status.get("status") == "connected":
                    st.success(f"✅ Redis: {redis_status.get('status')}")
                else:
                    st.error(f"❌ Redis: {redis_status.get('status')}")

            with col2:
                bullmq_status = connections.get("bullmq", {})
                if bullmq_status.get("status") == "configured":
                    st.success(f"✅ BullMQ: {bullmq_status.get('status')}")
                else:
                    st.error(f"❌ BullMQ: {bullmq_status.get('status')}")

        # Raw health data
        with st.expander("View Raw Health Data"):
            st.json(health_data)
    else:
        st.error("Unable to retrieve health data")

if __name__ == "__main__":
    main()
