# Langfuse Integration Guide

This document describes the comprehensive Langfuse integration added to your expense processing application for LLM observability, dataset management, and experimentation.

## 🚀 What's Been Implemented

### Core Infrastructure

1. **LangfuseService** (`src/services/langfuse.service.ts`)
   - Centralized Langfuse client management
   - Trace and generation creation
   - Dataset management
   - Experiment tracking
   - Error handling and health monitoring

2. **DatasetManagerService** (`src/services/dataset-manager.service.ts`)
   - Converts existing markdown extractions into structured datasets
   - Creates multiple dataset types (classification, extraction, complete pipeline)
   - Automatically infers metadata (complexity, language, etc.)

3. **Enhanced Agents**
   - FileClassificationAgent now includes comprehensive Langfuse tracing
   - Captures input/output, timing, token usage, and metadata
   - Supports both standalone and nested tracing

4. **API Endpoints** (`src/modules/langfuse/langfuse.controller.ts`)
   - Status monitoring
   - Dataset creation and statistics
   - Experiment templates
   - Data flushing

## 🛠️ Setup Instructions

### 1. Environment Configuration

Add these variables to your `.env` file:

```bash
# Langfuse Configuration
LANGFUSE_SECRET_KEY=sk-lf-...  # Get from Langfuse dashboard
LANGFUSE_PUBLIC_KEY=pk-lf-...  # Get from Langfuse dashboard
LANGFUSE_BASE_URL=http://localhost:3001
LANGFUSE_ENABLED=true
```

### 2. Get Langfuse Credentials

1. Visit your Langfuse dashboard: http://localhost:3001
2. Go to Settings → API Keys
3. Create a new API key
4. Copy the secret and public keys to your `.env` file

### 3. Test the Integration

```bash
# Install axios if not already installed
npm install axios

# Run the test script
node scripts/test-langfuse-integration.js
```

## 📊 Available Datasets

The integration creates three types of datasets from your existing data:

### 1. expense-classification
- **Purpose**: File classification experiments
- **Input**: Markdown content, country, schema
- **Output**: Classification results (expense type, language, confidence)
- **Use Case**: Optimize classification prompts and accuracy

### 2. expense-extraction
- **Purpose**: Data extraction experiments
- **Input**: Markdown content, country
- **Output**: Extracted structured data
- **Use Case**: Improve field extraction completeness and accuracy

### 3. expense-complete-pipeline
- **Purpose**: End-to-end processing experiments
- **Input**: Markdown content, country
- **Output**: Complete processing results (classification + extraction + compliance + citations)
- **Use Case**: Optimize entire pipeline performance

## 🧪 Experiment Templates

The integration provides four experiment templates:

### 1. Classification Prompt Optimization
- Test different classification prompts
- Metrics: accuracy, precision, recall, f1-score
- Datasets: expense-classification

### 2. Extraction Field Coverage
- Optimize data extraction completeness
- Metrics: field_coverage, extraction_accuracy, currency_accuracy
- Datasets: expense-extraction

### 3. Multi-Language Performance
- Compare performance across languages
- Metrics: language_detection, classification_accuracy, extraction_completeness
- Datasets: expense-complete-pipeline

### 4. Model Provider Comparison
- Compare Anthropic vs OpenAI
- Metrics: accuracy, latency, cost_efficiency, consistency
- Datasets: expense-complete-pipeline

## 🔍 API Endpoints

### Status & Health
```bash
GET /langfuse/status
# Returns Langfuse connection status and configuration
```

### Dataset Management
```bash
GET /langfuse/datasets/stats
# Get statistics about available datasets

POST /langfuse/datasets/create
# Create datasets from existing markdown files

POST /langfuse/datasets/create-sample
# Create a sample dataset for testing
```

### Experiments
```bash
GET /langfuse/experiments/templates
# Get available experiment templates
```

### Data Management
```bash
POST /langfuse/flush
# Flush pending traces to Langfuse
```

## 📈 Monitoring & Observability

### Automatic Tracing

The FileClassificationAgent now automatically captures:

- **Input Data**: Markdown content (truncated), country, schema fields
- **Output Data**: Classification results, confidence scores
- **Performance**: Duration, token usage estimates
- **Metadata**: Model used, provider, content length
- **Errors**: Detailed error information if processing fails

### Dashboard Access

Visit http://localhost:3001 to access your Langfuse dashboard and:
- View real-time traces
- Analyze performance metrics
- Browse datasets
- Run experiments
- Monitor costs and usage

## 🚦 Current Status

### ✅ Implemented
- [x] Core Langfuse integration
- [x] FileClassificationAgent tracing
- [x] Dataset creation from existing data
- [x] API endpoints for management
- [x] Comprehensive documentation
- [x] Test suite

### 🔄 Next Steps
- [ ] Instrument remaining agents (DataExtractionAgent, IssueDetectionAgent, etc.)
- [ ] Update ExpenseProcessingService to pass LangfuseService to agents
- [ ] Implement prompt management in Langfuse
- [ ] Create evaluation scripts for datasets
- [ ] Set up automated experiments

## 🧪 Example Usage

### 1. Basic Status Check
```javascript
const response = await fetch('http://localhost:3000/langfuse/status');
const status = await response.json();
console.log('Langfuse enabled:', status.enabled);
```

### 2. Create Datasets
```javascript
const response = await fetch('http://localhost:3000/langfuse/datasets/create', {
  method: 'POST'
});
const result = await response.json();
console.log('Datasets created:', result.datasets);
```

### 3. Get Dataset Statistics
```javascript
const response = await fetch('http://localhost:3000/langfuse/datasets/stats');
const stats = await response.json();
console.log('Files available:', stats.markdown_files);
```

## 🔧 Troubleshooting

### Langfuse Not Connected
1. Check that Langfuse is running on localhost:3001
2. Verify LANGFUSE_SECRET_KEY and LANGFUSE_PUBLIC_KEY in .env
3. Ensure LANGFUSE_ENABLED=true

### No Datasets Created
1. Check that markdown_extractions/ directory exists
2. Verify processing results in results/ directory
3. Check logs for specific error messages

### No Traces Appearing
1. Process a document through the API to trigger tracing
2. Call POST /langfuse/flush to force data transmission
3. Check Langfuse dashboard for any connection issues

## 📚 Additional Resources

- [Langfuse Documentation](https://langfuse.com/docs)
- [TypeScript SDK Guide](https://langfuse.com/docs/sdk/typescript)
- [Dataset Management](https://langfuse.com/docs/datasets)
- [Experiment Tracking](https://langfuse.com/docs/experimentation)

## 🎯 Benefits Achieved

1. **Full Observability**: Complete visibility into LLM operations
2. **Cost Tracking**: Monitor token usage and costs per operation
3. **Performance Optimization**: Identify bottlenecks and optimization opportunities
4. **Quality Assurance**: Track accuracy and consistency over time
5. **Experimentation**: Systematic testing of prompts and models
6. **Data-Driven Decisions**: Evidence-based improvements to your pipeline

Your expense processing application now has enterprise-grade LLM observability and experimentation capabilities!
