# AI-Powered Part Creation - Technical Plan

## Description

Replace the current manual part creation dialog with an AI-powered system that analyzes text input and/or images to automatically suggest all part details. Users provide text (model/manufacturer) and/or a camera photo, and AI fills in manufacturer code, type, description, tags, image, datasheet, documentation, and product page URL. The system uses the existing task system for background processing with SSE progress updates.

## Files to Create or Modify

### New Files

1. **`app/services/ai_part_analysis_task.py`**
   - BaseTask implementation for AI part analysis
   - Result and cancelled result schemas
   - Main AI analysis logic with progress reporting

2. **`app/api/ai_parts.py`**
   - POST `/api/ai-parts/analyze` - Start AI analysis task (multipart/form-data)
   - POST `/api/ai-parts/create` - Create part from AI suggestions
   - Blueprint registration and error handling

3. **`app/schemas/ai_part_analysis.py`**
   - Response schemas for AI suggestions
   - Task result schemas
   - No request schema needed (multipart form handling)

4. **`app/services/ai_service.py`**
   - Core AI integration logic
   - Send text/image directly to AI service
   - AI returns complete part analysis with document URLs
   - Handle document downloading from AI-provided URLs

5. **`app/utils/temp_file_manager.py`**
   - Temporary file storage management
   - Automatic cleanup after 1+ hours
   - Background cleanup thread

### Files to Modify

1. **`app/__init__.py`**
   - Wire new `ai_parts` blueprint
   - Register container wiring for `app.api.ai_parts`

2. **`app/api/__init__.py`**
   - Register `ai_parts_bp` blueprint

3. **`app/services/container.py`**
   - Add `ai_service` provider
   - Add `temp_file_manager` provider (singleton)

## Implementation Algorithm

### AI Analysis Task Flow

1. **Task Initialization**
   - Accept text input and/or uploaded image file via multipart form
   - Validate inputs (at least one must be provided)
   - Initialize progress reporting

2. **AI Analysis Phase (Progress: 0-80%)**
   - Send text and/or image directly to AI service
   - AI handles all analysis internally:
     - Text extraction, image analysis, and OCR
     - Part information generation
     - Document discovery and URL finding
   - Request complete structured response:
     - manufacturer_code
     - type (from existing categories)
     - description
     - tags (array of strings)
     - seller and seller_link
     - package/form factor
     - pin_count
     - voltage_rating
     - mounting_type
     - series
     - dimensions
     - document URLs (datasheets, manuals, images)
   - Report progress: "AI analyzing part and finding resources..."

3. **Document Download Phase (Progress: 80-95%)**
   - Download documents from AI-provided URLs to temp storage
   - Validate and process downloaded files
   - Report progress: "Downloading documentation..."

4. **Result Compilation Phase (Progress: 95-100%)**
   - Package all suggestions into response schema
   - Generate temp URLs for downloaded documents
   - Report progress: "Finalizing suggestions..."
   - Return complete AI analysis result

### Temporary File Management

1. **Storage Structure**
   ```
   /tmp/electronics_inventory/ai_analysis/
   ├── <timestamp>_<uuid>/
   │   ├── datasheet.pdf
   │   ├── manual.pdf
   │   └── part_image.jpg
   ```

2. **Cleanup Algorithm**
   - Background thread runs every hour
   - Delete directories older than 2 hours
   - Log cleanup activities for debugging

### API Endpoints

1. **POST `/api/ai-parts/analyze`** (multipart/form-data)
   ```
   Content-Type: multipart/form-data
   
   text: "Arduino Uno R3"           // optional text field
   image: <uploaded file>           // optional image file
   ```
   
   Response:
   ```json
   {
     "task_id": "uuid",
     "stream_url": "/api/tasks/uuid/stream"
   }
   ```

2. **POST `/api/ai-parts/create`**
   ```json
   {
     "manufacturer_code": "Arduino A000066",
     "type_id": 15,
     "description": "Arduino Uno R3 microcontroller board",
     "tags": ["arduino", "microcontroller", "ATmega328P"],
     "seller": "Arduino Store",
     "seller_link": "https://store.arduino.cc/uno-rev3",
     "package": "Arduino Uno",
     "pin_count": 32,
     "voltage_rating": "5V/3.3V",
     "mounting_type": "Breadboard Compatible",
     "series": "Arduino Uno",
     "dimensions": "68.6x53.4mm",
     "documents": [
       {
         "filename": "datasheet.pdf",
         "url": "/tmp/path/to/file",
         "type": "datasheet"
       }
     ],
     "suggested_image_url": "/tmp/path/to/image.jpg"
   }
   ```

## OpenAI API Integration

### Model Selection
The system will use OpenAI's **GPT-5** model family, the latest state-of-the-art multimodal AI with native vision capabilities. GPT-5 represents a significant advancement with vision capabilities trained alongside text from the ground up, improving image understanding and cross-modal reasoning.

### API Usage Pattern
**Single API Call Architecture:** The system sends both text and images to GPT-5 in a single API request with structured output requirements. This eliminates the need for separate OCR, text processing, or document discovery services.

**Vision Processing:** Images are automatically converted to tokens and processed alongside text input. GPT-5's native vision capabilities handle image analysis, text extraction, component identification, and technical specification extraction with superior accuracy.

**Advanced Parameters:** 
- `verbosity` parameter (low/medium/high) to control response detail level
- `reasoning_effort` parameter for balancing speed vs. thoroughness
- Choose between gpt-5, gpt-5-mini, or gpt-5-nano based on cost/performance needs

The value for these must be configurable.

**Structured Output:** The API request will specify a JSON schema requiring specific fields (manufacturer_code, type, description, technical specifications, document URLs, etc.) ensuring consistent, parseable responses.

### API Request Flow
1. **Multipart Upload Processing:** Convert uploaded image to base64 for OpenAI API
2. **Prompt Engineering:** Send structured prompt with electronics inventory context and required output schema
3. **Parameter Configuration:** Set verbosity and reasoning_effort based on analysis requirements
4. **Single API Call:** Submit text description and image (if provided) to GPT-5
5. **Structured Response:** Receive complete part analysis with all fields populated
6. **Document Download:** Process URLs returned by GPT-5 for additional resources

## Schema Definitions

AI Analysis Request will be handled via Flask multipart form data with validation in the API endpoint for text and image inputs. AI Analysis Result schema will include all part fields (manufacturer_code, type information, description, tags, seller details, extended technical fields, document suggestions, image URL, and confidence score). Document suggestion schema will include filename, temp file path, original AI-provided URL, document type, and description.

## Implementation Phases

### Phase 1: Core Infrastructure
1. Create BaseTask implementation for AI analysis
2. Set up temporary file management system
3. Create basic API endpoints with task integration
4. Implement mock AI service for testing

### Phase 2: OpenAI GPT-5 Integration
1. Integrate OpenAI GPT-5 API with native multimodal input processing
2. Implement structured output parsing from GPT-5 responses
3. Configure verbosity and reasoning_effort parameters for optimal performance
4. Add OpenAI API error handling (rate limits, model availability, token limits)
5. Implement document downloading from GPT-5 provided URLs
6. Add model size selection logic (gpt-5 vs gpt-5-mini vs gpt-5-nano)
7. Create progress reporting throughout OpenAI pipeline

### Phase 3: Part Creation Integration
1. Implement part creation from AI suggestions with extended fields
2. Handle document attachment during part creation
3. Add validation for new technical fields
4. Create comprehensive test coverage including new field validation

## Error Handling

1. **Invalid Inputs**: Return 400 with validation errors before starting task
2. **AI Service Failures**: Task fails with descriptive error message
3. **Document Download Failures**: Continue with partial results, log warnings for failed URLs
4. **Invalid AI-provided URLs**: Skip invalid URLs, continue with valid ones
5. **Temporary Storage Issues**: Fail gracefully with cleanup
6. **Cancellation**: Properly clean up temp files and AI service calls

## Testing Requirements

1. **Unit Tests**: AI service, temp file manager, task implementation
2. **Integration Tests**: Full API flow with mocked AI responses
3. **Task Tests**: SSE stream validation and progress reporting
4. **Cleanup Tests**: Verify temp file cleanup works correctly
5. **Error Tests**: All failure scenarios and edge cases

## Security Considerations

1. **Input Validation**: Sanitize all text inputs, validate image file formats and MIME types
2. **File Size Limits**: Restrict image upload sizes (max 10MB)
3. **File Type Validation**: Only accept common image formats (JPEG, PNG, WebP)
4. **Temp File Security**: Use secure temp directories with proper permissions
5. **URL Validation**: Validate all discovered URLs before downloading
6. **Resource Limits**: Prevent excessive AI service usage per session