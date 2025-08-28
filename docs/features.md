# Phase 1

## Core Data Management
- [x] Generate unique 4-letter part IDs (A-Z format)
- [x] Store parts with manufacturer codes, types, descriptions, quantities
- [x] Manage numbered boxes with configurable capacity
- [x] Track numbered locations within boxes (BOX-LOCATION format)  
- [x] Handle part-location assignments with quantities
- [x] Auto-clear location assignments when total quantity reaches zero
- [x] Maintain part records even when quantity is zero
- [x] Store part tags as arrays for categorization
- [x] Track seller information and product links per part
- [x] Maintain comprehensive test dataset with realistic electronics inventory

## Inventory Operations
- [x] Add new parts to inventory
- [x] Add stock for existing parts to specific locations
- [x] Remove stock from specific locations
- [x] Move items between locations
- [x] Split quantities across multiple locations
- [x] Track quantity change history with timestamps
- [x] Get location suggestions for part types
- [x] Calculate total quantities across all locations for parts
- [x] List parts with filtering by type and pagination

## Document Management
- [ ] Store PDFs in S3 (inventory-docs bucket)
- [ ] Store images in S3 (inventory-images bucket)
- [ ] Handle document uploads through backend API
- [ ] Link multiple documents per part
- [ ] Store document metadata and original filenames

## AI Integration (Celery Jobs)
- [ ] Auto-tag parts from descriptions and manufacturer codes
- [ ] Suggest categories from part information
- [ ] Extract part numbers from uploaded photos
- [ ] Discover and fetch datasheets based on part numbers
- [ ] Store fetched datasheets in S3

## Box & Location Management
- [x] Create boxes with configurable capacity
- [x] Update box capacity and descriptions
- [x] Delete empty boxes
- [x] List boxes with usage statistics (occupied vs available locations)
- [x] Get detailed box information with locations
- [x] Calculate box usage percentages
- [x] List locations within boxes with optional part assignment data
- [x] Auto-generate sequential location numbers within boxes

## API Infrastructure
- [x] Implement Flask blueprints for all resource endpoints
- [x] Use Pydantic v2 models for request/response validation
- [x] Generate OpenAPI documentation with Spectree
- [x] Handle centralized error responses with structured JSON
- [x] Manage database sessions per request
- [x] CORS support for frontend integration
- [x] Health check endpoint for container orchestration
- [x] Testing endpoints for development/QA environments
- [x] CLI commands for database operations and test data loading

## Background Job Processing
- [ ] Configure Celery with RabbitMQ broker
- [ ] Set up PostgreSQL result backend for Celery
- [ ] Implement job retry logic for failed AI operations
- [ ] Handle asynchronous datasheet fetching and storage

# Phase 2

## Search & Discovery
- [ ] Implement PostgreSQL pg_trgm search across all text fields
- [ ] Search parts by ID, manufacturer code, type, tags, description, seller
- [ ] Search document filenames
- [ ] Return search results with quantities and locations

## Shopping List
- [ ] Create shopping list items for parts not yet in inventory
- [ ] Link shopping list items to existing parts when applicable
- [ ] Convert shopping list items to inventory with location suggestions

## Projects/Kits
- [ ] Create projects with required parts and quantities
- [ ] Calculate stock coverage (enough/partial/missing)
- [ ] Deduct quantities from chosen locations during build
- [ ] Add missing project items to shopping list

## Location Intelligence
- [ ] Suggest locations for new parts (prefer same-category boxes)
- [ ] Suggest locations for existing parts (fill gaps in category boxes)
- [ ] Identify first available location when no category preference exists

## Reorganization
- [ ] Generate reorganization plans via Celery background jobs
- [ ] Analyze current layout for optimization opportunities
- [ ] Suggest moves to cluster categories and reduce spread
- [ ] Propose step-by-step move lists with quantities and locations
