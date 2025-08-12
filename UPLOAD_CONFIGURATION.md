# File Upload Configuration

This document explains how file upload paths are configured to work in both Docker and local development environments.

## Environment-Aware Upload Path Configuration

The application automatically detects whether it's running in Docker or local development and adjusts file paths accordingly:

### Local Development
- **Upload Path**: `./uploads` (relative to project root)
- **Detection**: No `.dockerenv` file and not production environment
- **Directory Creation**: Automatically created if it doesn't exist

### Docker Environment
- **Upload Path**: `/app/uploads` (absolute path in container)
- **Detection**: Presence of `.dockerenv` file or production environment with `/app` directory
- **Directory Creation**: Pre-created with proper permissions during Docker build

## Configuration

### Environment Variables
```bash
# Local development (.env.example)
UPLOAD_PATH=./uploads

# Docker production (.env)
UPLOAD_PATH=/app/uploads
```

### Automatic Path Resolution
The `DocumentService.normalizeUploadPath()` method handles path resolution:
- **Absolute paths**: Used as-is
- **Relative paths in Docker**: Converted to `/app/{relative_path}`
- **Relative paths locally**: Resolved relative to `process.cwd()`

## Directory Structure

### Local Development
```
project-root/
├── uploads/           # Auto-created upload directory
├── src/
└── ...
```

### Docker Container
```
/app/
├── uploads/           # Pre-created with proper permissions
├── dist/              # Built application
├── data/              # Configuration data
└── ...
```

## File Upload Flow

1. **File Reception**: Files are received in memory buffer (no temp files)
2. **Path Resolution**: Environment-aware path calculation
3. **Directory Validation**: Automatic creation if needed
4. **File Saving**: Direct write from buffer to final location
5. **Verification**: File existence and size validation

## Error Handling

The system includes comprehensive error handling for:
- Missing file buffer
- Directory creation failures
- File write permissions
- Path resolution issues
- Cross-platform compatibility

## Security Considerations

- Files are saved with unique names: `file-{timestamp}-{random}.{ext}`
- Upload directory is excluded from git via `.gitignore`
- Docker runs as non-root user with proper file permissions
- File type validation in controller layer
- File size limits enforced

## Prerequisites

### Local Development
- **Redis Server**: Must be running on localhost:6379
  ```bash
  # Install Redis (macOS)
  brew install redis
  brew services start redis
  
  # Install Redis (Ubuntu)
  sudo apt update
  sudo apt install redis-server
  sudo systemctl start redis-server
  
  # Verify Redis is running
  redis-cli ping
  # Should return: PONG
  ```

### Docker Environment
- Redis is automatically started via docker-compose
- No additional setup required

## Testing

To test file uploads in both environments:

### Local Development
```bash
# Ensure Redis is running
redis-cli ping

# Start the application
npm run start:dev

# Test file upload
curl -X POST http://localhost:3000/rgt-expense/api/v1/documents/process \
  -F 'file=@test.pdf' \
  -F 'userId=123' \
  -F 'country=Germany'
```

### Docker
```bash
docker-compose up
curl -X POST http://localhost:3000/rgt-expense/api/v1/documents/process \
  -F 'file=@test.pdf' \
  -F 'userId=123' \
  -F 'country=Germany'
```

Both should work seamlessly with the same API calls.
