# Invoice Splitter Module

An intelligent LLM-based invoice splitter that analyzes PDF documents to detect multiple invoices and automatically splits them into separate files with corresponding markdown content.

## Features

- **LLM-Powered Analysis**: Uses AI to intelligently detect invoice boundaries across document pages
- **PDF Splitting**: Creates separate PDF files for each detected invoice
- **Markdown Extraction**: Provides structured markdown content for each split invoice
- **Optimized Textract Integration**: Uses AWS Textract's built-in page markers for efficient processing
- **Confidence Scoring**: Returns confidence levels for each detected split
- **Temporary File Management**: Automatic cleanup of temporary files
- **Single API Call**: Processes entire document in one Textract call instead of page-by-page

## API Endpoints

### POST `/invoice-splitter/analyze`

Analyzes a PDF document for multiple invoices and creates split files.

**Request:**
```bash
curl -X POST \
  http://localhost:3000/invoice-splitter/analyze \
  -H 'Content-Type: multipart/form-data' \
  -F 'file=@multi_invoices.pdf'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "originalFileName": "multi_invoices.pdf",
    "totalPages": 5,
    "hasMultipleInvoices": true,
    "totalInvoices": 2,
    "invoices": [
      {
        "invoiceNumber": 1,
        "pages": [1, 2],
        "content": "# Page 1\n\nINVOICE #INV-001...",
        "confidence": 0.95,
        "reasoning": "Pages 1-2: Invoice #INV-001 from Company A",
        "totalPages": 2,
        "pdfPath": "/temp/invoice-splits/1640995200000/invoice_1.pdf",
        "fileName": "invoice_1.pdf",
        "fileSize": 45823
      }
    ],
    "tempDirectory": "/temp/invoice-splits/1640995200000"
  }
}
```

### DELETE `/invoice-splitter/cleanup/{tempDirectory}`

Cleans up temporary files created during the splitting process.

**Request:**
```bash
curl -X DELETE http://localhost:3000/invoice-splitter/cleanup/1640995200000
```

## Configuration

Add these environment variables to your `.env` file:

```env
# Invoice Splitter Configuration
INVOICE_SPLITTER_ENABLED=true
SPLITTER_LLM_PROVIDER=anthropic  # Options: anthropic, openai
SPLITTER_CONFIDENCE_THRESHOLD=0.75
SPLITTER_MAX_INVOICES=10

# Required LLM API Keys
ANTHROPIC_KEY=your_anthropic_api_key_here
OPENAI_API_KEY=your_openai_api_key_here

# Document Reader Configuration
DOCUMENT_READER=llamaparse  # Options: llamaparse, textract
LLAMAINDEX_API_KEY=your_llamaindex_api_key_here
```

## How It Works

1. **PDF Upload**: User uploads a PDF document through the API
2. **Full Document Extraction**: Extract entire document as markdown using Textract (single API call)
3. **Page Parsing**: Parse markdown using Textract's built-in page markers (## Page 1, ## Page 2, etc.)
4. **LLM Analysis**: The AI agent analyzes all pages to identify invoice boundaries
5. **Grouping**: Pages are grouped into logical invoice units based on:
   - Invoice numbers and headers
   - Vendor information consistency
   - Date and amount continuity
   - Document formatting patterns
6. **PDF Creation**: Separate PDF files are created for each invoice group
7. **Response**: Returns both PDF file paths and combined markdown content

## LLM Prompting Strategy

The system uses sophisticated prompting to ensure accurate invoice detection:

- **Context-Aware Analysis**: Understands document structure and invoice patterns
- **Multi-Page Handling**: Correctly groups continuation pages with their parent invoices
- **Confidence Scoring**: Provides reliability metrics for each detected boundary
- **Flexible Pattern Recognition**: Adapts to various invoice formats and layouts

## File Management

- **Temporary Storage**: Split files are stored in timestamped directories
- **Automatic Cleanup**: Failed operations clean up temporary files automatically
- **Manual Cleanup**: Explicit cleanup endpoint for post-processing cleanup
- **Configurable Storage**: Upload path configurable via environment variables

## Error Handling

- **Graceful Degradation**: Falls back to single invoice if analysis fails
- **Page-Level Errors**: Individual page failures don't stop the entire process
- **Clear Error Messages**: Detailed error information for debugging
- **Resource Cleanup**: Ensures temporary files are cleaned up even on errors

## Integration with Existing Pipeline

The invoice splitter is designed as a standalone service that can be:

1. **Used Independently**: Direct API calls for invoice splitting
2. **Integrated with Document Processing**: Use split results in existing expense pipeline
3. **Batch Processing**: Process multiple documents programmatically
4. **Microservice Architecture**: Can be deployed as separate service if needed

## Performance Considerations

- **Page-by-Page Processing**: Handles large documents efficiently
- **Parallel Processing**: Can be extended for concurrent page processing
- **Memory Management**: Temporary files minimize memory usage
- **LLM Optimization**: Single API call analyzes all pages together

## Testing

Run the tests:

```bash
npm test src/modules/invoice-splitter
```

For integration testing with real documents, ensure you have:
- Valid LLM API keys
- Document reader credentials
- Sample multi-invoice PDF files

## Troubleshooting

**Common Issues:**

1. **LLM API Failures**: Check API keys and rate limits
2. **Document Reader Errors**: Verify credentials and file formats
3. **File System Permissions**: Ensure write access to upload directory
4. **Memory Issues**: Monitor memory usage with large PDF files

**Debug Mode:**
Set `LOG_LEVEL=debug` to see detailed processing logs.

## Future Enhancements

- Machine learning model training on custom data
- Support for additional file formats (Word, images)
- Batch processing endpoints
- Integration with cloud storage providers
- Advanced confidence threshold tuning
